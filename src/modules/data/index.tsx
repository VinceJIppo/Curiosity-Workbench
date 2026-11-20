import { useMemo, useState } from 'preact/hooks';
import type { ModuleManifest, ViewProps } from '../../app/module';
import { store, update, useWorkspace } from '../../app/store';
import { navigate } from '../../app/router';
import { pickFile, parseWorkspaceText } from '../../app/persist';
import { parseCsv, parseJsonRows, parseXlsx, looksLikeWorkspace, type Table, type Workbook } from '../../core/import/parse';
import { applyImport, autoMap, findTemplate, mapRows, suggestEntityType, type Issue } from '../../core/import/mapping';
import { entitySchemas, getEntitySchema } from '../../core/schema/registry';
import { dataQuality } from '../../core/import/quality';
import { EntityTable } from '../../ui/EntityTable';
import { Empty, Field, Modal, Select, TextInput, toast } from '../../ui/components';

interface Loaded {
  fileName: string;
  book?: Workbook;
  sheet?: string;
  table: Table;
}

async function readFile(f: File): Promise<Loaded | { workspaceText: string; fileName: string }> {
  const name = f.name;
  const lower = name.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm') || lower.endsWith('.xls')) {
    const book = parseXlsx(await f.arrayBuffer());
    const sheet = book.sheets.map((s) => ({ s, n: book.table(s).rows.length })).sort((a, b) => b.n - a.n)[0]?.s ?? book.sheets[0];
    return { fileName: name, book, sheet, table: book.table(sheet) };
  }
  const text = await f.text();
  if (lower.endsWith('.json')) {
    if (looksLikeWorkspace(text)) return { workspaceText: text, fileName: name };
    return { fileName: name, table: parseJsonRows(text) };
  }
  return { fileName: name, table: parseCsv(text) };
}

const STEPS = ['File', 'Type', 'Map columns', 'Validate and import'];

function ImportWizard({ params }: ViewProps) {
  const ws = useWorkspace();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [type, setType] = useState<string>(params[0] ?? '');
  const [map, setMap] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<'replace' | 'append' | 'upsert'>('upsert');
  const [skip, setSkip] = useState(true);
  const [tplName, setTplName] = useState('');
  const [dsName, setDsName] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ imported: number; skipped: number; issues: number } | null>(null);
  const [wsText, setWsText] = useState<{ text: string; name: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const schema = type ? getEntitySchema(type) : undefined;
  const templateHit = loaded && schema ? findTemplate(ws.mappingTemplates, loaded.table.headers, schema.type) : undefined;
  const mapped = useMemo(() => (loaded && schema ? mapRows(schema, loaded.table.rows, map) : null), [loaded, schema, map]);

  const begin = (l: Loaded) => {
    setLoaded(l);
    setDone(null);
    const t = params[0] || suggestEntityType(l.table.headers, ws.mappingTemplates) || '';
    setType(t);
    const s = getEntitySchema(t);
    if (s) {
      const am = autoMap(s, l.table.headers, ws.mappingTemplates);
      setMap(am.columnMap);
      setTplName(am.template?.name ?? `${l.fileName.replace(/\.[^.]+$/, '')} (${s.label})`);
    }
    setDsName(l.fileName.replace(/\.[^.]+$/, ''));
    setStep(1);
  };
  const onFile = async (f: File | null) => {
    if (!f) return;
    setErr('');
    try {
      const r = await readFile(f);
      if ('workspaceText' in r) {
        setWsText({ text: r.workspaceText, name: r.fileName });
        return;
      }
      if (!r.table.headers.length) throw new Error('No header row found');
      begin(r);
    } catch (e) {
      setErr(`Could not read ${f.name}: ${(e as Error).message}`);
    }
  };
  const chooseType = (t: string) => {
    setType(t);
    const s = getEntitySchema(t);
    if (s && loaded) {
      const am = autoMap(s, loaded.table.headers, ws.mappingTemplates);
      setMap(am.columnMap);
      setTplName(am.template?.name ?? `${loaded.fileName.replace(/\.[^.]+$/, '')} (${s.label})`);
    }
  };

  const issuesByKind = (mapped?.issues ?? []).reduce<Record<string, number>>((a, i) => ((a[i.kind] = (a[i.kind] ?? 0) + 1), a), {});
  const issueRows = new Set((mapped?.issues ?? []).map((i) => i.row));

  return (
    <div class="stack">
      <div class="wizard-steps">
        {STEPS.map((s, i) => (
          <span key={s} class={i === step ? 'on' : ''}>
            {i + 1}. {s}
          </span>
        ))}
      </div>
      {err && <div class="callout error">{err}</div>}
      {done && (
        <div class="callout">
          Imported {done.imported} rows{done.skipped ? `, skipped ${done.skipped} rows with errors` : ''}. {done.issues ? `${done.issues} issues noted.` : ''} The raw rows are kept in Datasets.{' '}
          <a href="#/data/quality">Check data quality</a>
        </div>
      )}

      {step === 0 && (
        <div
          class="empty"
          style={`padding:48px;${dragOver ? 'border-color:var(--ink)' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onFile(e.dataTransfer?.files?.[0] ?? null);
          }}
        >
          <p>Drop a CSV, XLSX or JSON file here, or</p>
          <button class="btn primary" onClick={async () => onFile(await pickFile('.csv,.tsv,.txt,.xlsx,.xlsm,.xls,.json'))} data-testid="choose-file">
            Choose a file
          </button>
          <p class="small" style="margin-top:12px">
            Files are read in this browser only. Nothing is uploaded anywhere.
          </p>
        </div>
      )}

      {loaded && step >= 1 && (
        <div class="card">
          <div class="row">
            <b style="flex:1">
              {loaded.fileName}
              {loaded.sheet ? ` / ${loaded.sheet}` : ''}: {loaded.table.rows.length} rows, {loaded.table.headers.length} columns
            </b>
            {loaded.book && loaded.book.sheets.length > 1 && (
              <Field label="Sheet">
                <Select value={loaded.sheet ?? ''} options={loaded.book.sheets} onChange={(s) => s && begin({ ...loaded, sheet: s, table: loaded.book!.table(s) })} />
              </Field>
            )}
            <button class="btn small" onClick={() => { setLoaded(null); setStep(0); }}>
              Start over
            </button>
          </div>
        </div>
      )}

      {loaded && step === 1 && (
        <div class="card stack">
          <Field label="What is in this file?">
            <Select value={type} options={entitySchemas().map((s) => s.type)} labels={Object.fromEntries(entitySchemas().map((s) => [s.type, s.label]))} onChange={(t) => chooseType(t)} allowEmpty="Choose a type" />
          </Field>
          {templateHit && <div class="callout">Matched saved mapping "{templateHit.name}". Columns are mapped from last time.</div>}
          <div>
            <button class="btn primary" disabled={!type} onClick={() => setStep(2)}>
              Next: map columns
            </button>
          </div>
        </div>
      )}

      {loaded && schema && step === 2 && (
        <div class="card stack">
          <table class="data">
            <thead>
              <tr>
                <th>Field</th>
                <th>Source column</th>
                <th>First values</th>
              </tr>
            </thead>
            <tbody>
              {schema.fields.map((f) => (
                <tr key={f.key}>
                  <td>
                    {f.label}
                    {f.required && <b> *</b>}
                    {f.enum && <div class="small muted">{f.enum.join(', ')}</div>}
                  </td>
                  <td style="min-width:240px">
                    <Select value={map[f.key] ?? ''} options={loaded.table.headers} onChange={(h) => setMap((m) => { const n = { ...m }; if (h) n[f.key] = h; else delete n[f.key]; return n; })} allowEmpty="(not mapped)" />
                  </td>
                  <td class="small muted">{map[f.key] ? loaded.table.rows.slice(0, 3).map((r) => String(r[map[f.key]] ?? '')).join(' | ') : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p class="small muted">
            Unmapped source columns are still kept in the raw rows: {loaded.table.headers.filter((h) => !Object.values(map).includes(h)).join(', ') || 'none'}.
          </p>
          <div class="row">
            <button class="btn" onClick={() => setStep(1)}>
              Back
            </button>
            <button class="btn primary" onClick={() => setStep(3)}>
              Next: validate
            </button>
          </div>
        </div>
      )}

      {loaded && schema && mapped && step === 3 && (
        <div class="card stack">
          <div class="row">
            <b>{mapped.records.length} rows.</b>
            {Object.keys(issuesByKind).length === 0 ? <span>No issues found.</span> : Object.entries(issuesByKind).map(([k, n]) => <span key={k} class="badge fail">{n} {k}</span>)}
          </div>
          {mapped.issues.length > 0 && (
            <div class="table-wrap" style="max-height:220px">
              <table class="data">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Field</th>
                    <th>Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {mapped.issues.slice(0, 200).map((i: Issue, k) => (
                    <tr key={k}>
                      <td>{i.row || 'file'}</td>
                      <td>{i.field}</td>
                      <td>{i.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h3>Preview</h3>
          <div class="table-wrap" style="max-height:260px">
            <table class="data">
              <thead>
                <tr>
                  <th>Row</th>
                  {schema.fields.filter((f) => map[f.key]).map((f) => (
                    <th key={f.key}>{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mapped.records.slice(0, 25).map((r) => (
                  <tr key={r._row as number} class={issueRows.has(r._row as number) ? 'issue-row' : ''}>
                    <td>{r._row as number}</td>
                    {schema.fields.filter((f) => map[f.key]).map((f) => (
                      <td key={f.key} class={f.sensitive ? 'muted' : ''}>
                        {f.sensitive ? '•••' : Array.isArray(r[f.key]) ? (r[f.key] as string[]).join(', ') : String(r[f.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div class="form-grid">
            <Field label="How to apply">
              <Select value={mode} options={['upsert', 'append', 'replace'] as const} labels={{ upsert: 'Update matching IDs, add new', append: 'Add new only, keep existing', replace: `Replace all ${schema.label}` }} onChange={(v) => setMode((v || 'upsert') as typeof mode)} />
            </Field>
            <Field label="Dataset name">
              <TextInput value={dsName} onChange={setDsName} />
            </Field>
            <Field label="Save this mapping as (blank to skip)" hint="Next time a file with the same headers arrives, it maps itself.">
              <TextInput value={tplName} onChange={setTplName} />
            </Field>
            <label class="row small">
              <input type="checkbox" checked={skip} onChange={(e) => setSkip((e.target as HTMLInputElement).checked)} /> Skip rows with missing required fields or duplicate IDs
            </label>
          </div>
          <div class="row">
            <button class="btn" onClick={() => setStep(2)}>
              Back
            </button>
            <button
              class="btn primary"
              data-testid="do-import"
              onClick={() => {
                try {
                  const out = applyImport(ws, { entityType: schema.type, datasetName: dsName || loaded.fileName, fileName: loaded.fileName, sheet: loaded.sheet, headers: loaded.table.headers, rawRows: loaded.table.rows, columnMap: map, mode, saveTemplateName: tplName || undefined, skipErrorRows: skip });
                  update((w) => Object.assign(w, out.ws), `Imported ${loaded.fileName}`, { log: false });
                  setDone({ imported: out.imported, skipped: out.skipped, issues: out.issues.length });
                  toast(`Imported ${out.imported} rows`);
                  setLoaded(null);
                  setStep(0);
                } catch (e) {
                  setErr((e as Error).message);
                }
              }}
            >
              Import {mapped.records.length} rows
            </button>
          </div>
        </div>
      )}
      {wsText && (
        <Modal title="This is a workspace file" onClose={() => setWsText(null)}>
          <p>{wsText.name} is a whole workspace, not a table of rows. Open it in place of the current workspace? Save first if you need the current one.</p>
          <div class="row">
            <button
              class="btn primary"
              onClick={() => {
                try {
                  store.replace(parseWorkspaceText(wsText.text), wsText.name);
                  setWsText(null);
                  toast(`Opened ${wsText.name}`);
                  navigate('/');
                } catch (e) {
                  setErr((e as Error).message);
                  setWsText(null);
                }
              }}
            >
              Open workspace
            </button>
            <button class="btn" onClick={() => setWsText(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Datasets() {
  const ws = useWorkspace();
  const [view, setView] = useState<string | null>(null);
  const ds = ws.datasets.find((d) => d.id === view);
  return (
    <div class="stack">
      {ws.datasets.length === 0 ? (
        <Empty>No imports yet. Raw rows from every import are kept here alongside the mapped data.</Empty>
      ) : (
        <table class="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>File</th>
              <th>Type</th>
              <th class="num">Rows</th>
              <th>Imported</th>
              <th>Mapping</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ws.datasets.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td class="small">
                  {d.fileName}
                  {d.sheet ? ` / ${d.sheet}` : ''}
                </td>
                <td>{getEntitySchema(d.entityType)?.label ?? d.entityType}</td>
                <td class="num">{d.rowCount}</td>
                <td class="small">{d.importedAt.slice(0, 16).replace('T', ' ')}</td>
                <td class="small">{ws.mappingTemplates.find((t) => t.id === d.mappingTemplateId)?.name ?? ''}</td>
                <td class="row">
                  <button class="btn small" onClick={() => setView(d.id)}>
                    Raw rows
                  </button>
                  <button class="btn small ghost" onClick={() => update((w) => (w.datasets = w.datasets.filter((x) => x.id !== d.id)), 'Removed dataset record')} title="Removes the raw copy. Mapped rows stay.">
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3>Mapping templates</h3>
      {ws.mappingTemplates.length === 0 ? (
        <p class="muted small">Saved when you import. Keyed by the file's header signature.</p>
      ) : (
        <table class="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Signature</th>
              <th>Columns</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ws.mappingTemplates.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{getEntitySchema(t.entityType)?.label ?? t.entityType}</td>
                <td class="mono">{t.headerSignature}</td>
                <td class="small">{Object.entries(t.columnMap).map(([k, v]) => `${v} > ${k}`).join(', ')}</td>
                <td>
                  <button class="btn small ghost" onClick={() => update((w) => (w.mappingTemplates = w.mappingTemplates.filter((x) => x.id !== t.id)), 'Deleted mapping template')}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {ds && (
        <Modal title={`Raw rows: ${ds.name}`} onClose={() => setView(null)} wide>
          <div class="table-wrap">
            <table class="data">
              <thead>
                <tr>
                  {ds.headers.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ds.rawRows.slice(0, 300).map((r, i) => (
                  <tr key={i}>
                    {ds.headers.map((h) => (
                      <td key={h}>{String(r[h] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Quality() {
  const ws = useWorkspace();
  const q = dataQuality(ws);
  return (
    <div class="grid2">
      <div>
        <h3>Row counts</h3>
        <table class="data">
          <tbody>
            {q.counts.map((c) => (
              <tr key={c.collection}>
                <td>{c.label}</td>
                <td class="num">{c.rows}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h3>Findings</h3>
        {q.items.length === 0 ? (
          <p class="muted">No issues found.</p>
        ) : (
          <div class="stack" style="gap:6px">
            {q.items.map((i, k) => (
              <div key={k} class={`callout ${i.severity === 'error' ? 'error' : i.severity === 'warning' ? 'warn' : ''}`} style="margin:0">
                <b>{i.area}.</b> {i.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Browse({ params }: ViewProps) {
  const schemas = entitySchemas().filter((s) => s.collection !== 'assumptions');
  const type = params[0] && schemas.some((s) => s.type === params[0]) ? params[0] : schemas[0].type;
  const schema = getEntitySchema(type)!;
  return (
    <div class="stack">
      <div class="row">
        {schemas.map((s) => (
          <button key={s.type} class={`btn small ${s.type === type ? 'primary' : ''}`} onClick={() => navigate(`/data/browse/${s.type}`)}>
            {s.label}
          </button>
        ))}
      </div>
      <EntityTable key={type} title={schema.label} schema={schema} maskSensitive newRow={() => ({ id: `${schema.idPrefix}-${Date.now().toString(36)}` })} />
    </div>
  );
}

export const dataModule: ModuleManifest = {
  id: 'data',
  title: 'Data',
  icon: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  navOrder: 50,
  views: [
    { id: 'import', title: 'Import', component: ImportWizard },
    { id: 'datasets', title: 'Datasets and mappings', component: Datasets },
    { id: 'quality', title: 'Data quality', component: Quality },
    { id: 'browse', title: 'Browse', component: Browse },
  ],
};
