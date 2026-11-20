import { useState } from 'preact/hooks';
import type { ModuleManifest } from '../../app/module';
import { store, update, useStore } from '../../app/store';
import { saveWorkspace, openWorkspaceFile, forgetFileHandle } from '../../app/persist';
import { diffContent, type DiffEntry } from '../../core/schema/diff';
import type { Snapshot, WorkspaceContent, Workspace } from '../../core/schema/types';
import { Empty, Field, Select, TextInput, toast } from '../../ui/components';
import { sampleWorkspace } from '../../samples/seed';
import { emptyWorkspace } from '../../core/schema/migrate';
import { newId } from '../shared';

export function contentOf(ws: Workspace): WorkspaceContent {
  const { settings, assumptions, entities, scenarios, baselineScenarioId, datasets, mappingTemplates, modules, moduleVersions } = ws;
  return structuredClone({ settings, assumptions, entities, scenarios, baselineScenarioId, datasets: datasets.map((d) => ({ ...d, rawRows: [] })), mappingTemplates, modules, moduleVersions });
}

const fmtV = (v: unknown) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s == null ? '' : s.length > 80 ? `${s.slice(0, 80)}...` : s;
};

export function DiffView({ entries }: { entries: DiffEntry[] }) {
  if (!entries.length) return <p class="muted">No differences.</p>;
  return (
    <table class="data">
      <thead>
        <tr>
          <th>Area</th>
          <th>Item</th>
          <th>Change</th>
          <th>Detail</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e, i) => (
          <tr key={i}>
            <td class="small">{e.area}</td>
            <td>{e.label}</td>
            <td>{e.kind}</td>
            <td class="small">
              {e.fields?.map((f) => (
                <div key={f.field}>
                  <b>{f.field}</b>: {fmtV(f.before)} {'>'} {fmtV(f.after)}
                </div>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function File() {
  const s = useStore();
  const ws = s.ws;
  return (
    <div class="stack" style="max-width:820px">
      <Field label="Workspace name">
        <TextInput value={ws.name} onChange={(v) => update((w) => (w.name = v), 'Renamed workspace', { coalesce: 'wsname' })} />
      </Field>
      <div class="callout small">
        The workspace file is the source of truth and how you share with Sam and Ryan. It holds comp, GP and customer names: keep it out of email threads and shared drives you do not control. Autosave keeps a copy in this browser only.
      </div>
      <div class="row">
        <button
          class="btn primary"
          onClick={async () => {
            const n = await saveWorkspace(ws);
            if (n) {
              store.fileName = n;
              store.setSaveState('saved');
              toast(`Saved ${n}`);
            }
          }}
        >
          Save (Ctrl+S)
        </button>
        <button
          class="btn"
          onClick={async () => {
            const n = await saveWorkspace(ws, true);
            if (n) {
              store.fileName = n;
              store.setSaveState('saved');
              toast(`Saved ${n}`);
            }
          }}
        >
          Save as
        </button>
        <button
          class="btn"
          onClick={async () => {
            try {
              const r = await openWorkspaceFile();
              if (r) {
                store.replace(r.ws, r.name);
                toast(`Opened ${r.name}`);
              }
            } catch (e) {
              toast(`Could not open: ${(e as Error).message}`);
            }
          }}
        >
          Open (Ctrl+O)
        </button>
        <span style="flex:1" />
        <button
          class="btn"
          onClick={() => {
            if (!confirm('Load the synthetic sample workspace in place of this one? Save first if you need it.')) return;
            forgetFileHandle();
            store.replace(sampleWorkspace(new Date().toISOString()));
          }}
        >
          Load sample
        </button>
        <button
          class="btn"
          onClick={() => {
            if (!confirm('Start a blank workspace? Save first if you need this one.')) return;
            forgetFileHandle();
            store.replace(emptyWorkspace());
          }}
        >
          New blank
        </button>
      </div>
      <p class="small muted">
        Current file: {s.fileName ?? 'not saved to a file yet'}. State: {s.saveState}. Schema version {ws.schemaVersion}.
      </p>
      <h3>Change log</h3>
      <div class="table-wrap" style="max-height:340px">
        <table class="data">
          <tbody>
            {[...ws.changeLog].reverse().slice(0, 300).map((c, i) => (
              <tr key={i}>
                <td class="small mono">{c.at.slice(0, 19).replace('T', ' ')}</td>
                <td>{c.action}</td>
                <td class="small muted">{c.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Snapshots() {
  const s = useStore();
  const ws = s.ws;
  const [name, setName] = useState('');
  const [a, setA] = useState<string>('');
  const [b, setB] = useState<string>('current');
  const pick = (id: string): WorkspaceContent | undefined => (id === 'current' ? contentOf(ws) : ws.snapshots.find((x) => x.id === id)?.data);
  const da = pick(a);
  const db = pick(b);
  const opts = ['current', ...ws.snapshots.map((x) => x.id)];
  const labels = Object.fromEntries([['current', 'Current workspace'], ...ws.snapshots.map((x) => [x.id, `${x.name} (${x.createdAt.slice(0, 10)})`])]);
  return (
    <div class="stack">
      <div class="row" style="align-items:flex-end">
        <Field label="Snapshot name">
          <TextInput value={name} onChange={setName} placeholder="pre-CEO review" />
        </Field>
        <button
          class="btn primary"
          disabled={!name.trim()}
          onClick={() => {
            const snap: Snapshot = { id: newId('snap'), name: name.trim(), createdAt: new Date().toISOString(), data: contentOf(ws) };
            update((w) => (w.snapshots = [...w.snapshots, snap]), `Snapshot "${snap.name}"`);
            setName('');
            toast(`Snapshot "${snap.name}" saved`);
          }}
        >
          Take snapshot
        </button>
      </div>
      {ws.snapshots.length === 0 ? (
        <Empty>No snapshots yet. Take one before big edits, for example "pre-CEO review".</Empty>
      ) : (
        <table class="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Taken</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ws.snapshots.map((x) => (
              <tr key={x.id}>
                <td>{x.name}</td>
                <td class="small">{x.createdAt.slice(0, 16).replace('T', ' ')}</td>
                <td class="row">
                  <button
                    class="btn small"
                    onClick={() => {
                      if (!confirm(`Restore "${x.name}"? Current data is replaced; you can undo.`)) return;
                      update((w) => {
                        const d = structuredClone(x.data);
                        Object.assign(w, d, { datasets: w.datasets });
                      }, `Restored snapshot "${x.name}"`);
                    }}
                  >
                    Restore
                  </button>
                  <button class="btn small ghost" onClick={() => update((w) => (w.snapshots = w.snapshots.filter((y) => y.id !== x.id)), `Deleted snapshot "${x.name}"`)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3>Compare two snapshots</h3>
      <div class="row">
        <Select value={a} options={opts} labels={labels} onChange={setA} allowEmpty="Choose" />
        <span>to</span>
        <Select value={b} options={opts} labels={labels} onChange={setB} allowEmpty="Choose" />
      </div>
      {da && db && <DiffView entries={diffContent(da, db)} />}
    </div>
  );
}

export const workspaceModule: ModuleManifest = {
  id: 'workspace',
  title: 'Workspace',
  icon: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  navOrder: 60,
  views: [
    { id: 'file', title: 'File', component: File },
    { id: 'snapshots', title: 'Snapshots and diff', component: Snapshots },
  ],
};
