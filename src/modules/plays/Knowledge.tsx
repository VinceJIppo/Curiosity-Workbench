// Knowledge: the office curates shared sales knowledge drawn from partner decks.
import { useMemo, useState } from 'preact/hooks';
import { update, useWorkspace } from '../../app/store';
import { downloadBlob, pickFile } from '../../app/persist';
import {
  ALLOWED,
  KIND_LABELS,
  NODE_KINDS,
  REL_LABELS,
  allowedRels,
  brokenEvidence,
  claudeInstructions,
  customerSafe,
  deckTextForClaude,
  exportPack,
  freshAsOf,
  importPack,
  isStaleNode,
  link,
  mergeNodes,
  neighbors,
  removeNode,
  seedFromLibrary,
  unlink,
  upsertNode,
  type ImportReport,
  type KNode,
  type KnowledgeBase,
  type NodeKind,
  type NodeStatus,
} from '../../core/pitch/knowledge';
import { sanitizeText } from '../../core/format';
import { Empty, Field, Modal, Select, TextInput, toast } from '../../ui/components';
import { getData, PLAYS_VERSION, type PlaysData } from './data';
import { newId } from '../shared';

const kid = (k: NodeKind) => newId(k);

function setKb(fn: (kb: KnowledgeBase, d: PlaysData) => KnowledgeBase, label: string, coalesce?: string) {
  update(
    (w) => {
      const d = getData(w);
      d.knowledge = fn(d.knowledge, d);
      w.modules.plays = d;
      w.moduleVersions.plays = PLAYS_VERSION;
    },
    label,
    coalesce ? { coalesce } : undefined,
  );
}

const STATUS_BADGE: Record<NodeStatus, string> = { suggested: 'Open', approved: 'pass', retired: 'Assumed' };
const today = () => new Date().toISOString().slice(0, 10);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function NodeDetail({ node, d, onClose, onSelect }: { node: KNode; d: PlaysData; onClose: () => void; onSelect: (id: string) => void }) {
  const kb = d.knowledge;
  const decks = d.decks;
  const [deckId, setDeckId] = useState(decks.find((x) => !node.oem || x.oem === node.oem)?.id ?? '');
  const [slide, setSlide] = useState('');
  const [target, setTarget] = useState('');
  const [mergeWith, setMergeWith] = useState('');
  const save = (patch: Partial<KNode>, label: string, coalesce?: string) => setKb((k) => upsertNode(k, { ...node, ...patch }), label, coalesce);
  const links = neighbors(kb, node.id);
  const broken = brokenEvidence(node, decks);
  const linkable = kb.nodes.filter((n) => n.id !== node.id && n.status !== 'retired' && (allowedRels(node.kind, n.kind).length || allowedRels(n.kind, node.kind).length) && (!node.oem || !n.oem || n.oem === node.oem));
  const deck = decks.find((x) => x.id === deckId);
  return (
    <aside class="drawer" aria-label={`Edit ${node.text}`} data-testid="knowledge-detail">
      <div class="row" style="margin-bottom:10px">
        <h2 style="flex:1;margin:0">{KIND_LABELS[node.kind]}</h2>
        <span class={`badge ${STATUS_BADGE[node.status]}`}>{node.status}</span>
        <button class="btn small" onClick={onClose}>
          Close
        </button>
      </div>
      <div class="stack">
        <Field label="Text">
          <textarea class="text" rows={3} value={node.text} onInput={(e) => save({ text: sanitizeText((e.target as HTMLTextAreaElement).value) }, 'Edited knowledge', `kt-${node.id}`)} />
        </Field>
        <div class="row">
          {node.status !== 'approved' && (
            <button class="btn primary small" onClick={() => save({ status: 'approved' }, 'Approved knowledge')} data-testid="approve-node">
              Approve
            </button>
          )}
          {node.status !== 'retired' && (
            <button class="btn small" onClick={() => save({ status: 'retired' }, 'Retired knowledge')}>
              Retire
            </button>
          )}
          {node.status === 'retired' && (
            <button class="btn small" onClick={() => save({ status: 'suggested' }, 'Restored knowledge')}>
              Restore
            </button>
          )}
          <span class="small muted">Only approved knowledge will drive recommendations.</span>
        </div>
        <div class="form-grid">
          <Field label="OEM (blank for any)">
            <Select value={node.oem ?? ''} options={[...new Set(decks.map((x) => x.oem))]} onChange={(v) => save({ oem: v || undefined }, 'Knowledge OEM')} allowEmpty="Any OEM" />
          </Field>
          <Field label="Came from">
            <span class="small">{node.origin}</span>
          </Field>
        </div>
        <Field label="Notes (office only)">
          <TextInput value={node.notes ?? ''} onChange={(v) => save({ notes: v }, 'Knowledge notes', `kn-${node.id}`)} />
        </Field>
        <div class="callout small">
          Fresh as of {freshAsOf(node, decks) || 'no evidence yet'}.{' '}
          {customerSafe(node, decks) ? 'Customer safe.' : 'Rests on a slide marked internal: prep only, never in a customer deck.'}
          {broken.length > 0 && ` ${broken.length} piece${broken.length > 1 ? 's' : ''} of evidence point at slides no longer in the library.`}
        </div>

        <h3>Evidence</h3>
        {node.evidence.length === 0 && node.kind !== 'persona' && node.kind !== 'service' && <p class="small" style="color:var(--danger)">No slide backs this yet. Add one before approving.</p>}
        <ul class="small" style="margin:0;padding-left:18px">
          {node.evidence.map((e) => {
            const dk = decks.find((x) => x.id === e.deckId);
            const s = dk?.slides.find((x) => x.index === e.slide);
            return (
              <li key={`${e.deckId}:${e.slide}`}>
                {dk ? `${dk.name}, slide ${e.slide}: ${s?.title ?? 'missing'}` : `Missing deck ${e.deckId}, slide ${e.slide}`}
                {s?.internalOnly && <span class="badge fail" style="margin-left:4px">internal</span>}{' '}
                <button class="btn small ghost" onClick={() => save({ evidence: node.evidence.filter((x) => x !== e) }, 'Removed evidence')}>
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
        <div class="row" style="align-items:flex-end">
          <Field label="Deck">
            <Select value={deckId} options={decks.map((x) => x.id)} labels={Object.fromEntries(decks.map((x) => [x.id, `${x.name} (${x.contentDate})`]))} onChange={(v) => { setDeckId(v); setSlide(''); }} />
          </Field>
          <Field label="Slide">
            <Select value={slide} options={(deck?.slides ?? []).map((s) => String(s.index))} labels={Object.fromEntries((deck?.slides ?? []).map((s) => [String(s.index), `${s.index}. ${s.title}`]))} onChange={setSlide} allowEmpty="Choose" />
          </Field>
          <button class="btn small" disabled={!deckId || !slide} onClick={() => save({ evidence: [...node.evidence.filter((x) => !(x.deckId === deckId && x.slide === Number(slide))), { deckId, slide: Number(slide) }] }, 'Added evidence')}>
            Add
          </button>
        </div>

        <h3>Links</h3>
        {links.length === 0 && <p class="small muted">Not linked yet.</p>}
        <ul class="small" style="margin:0;padding-left:18px">
          {links.map(({ edge, node: other, dir }) => (
            <li key={`${edge.from}|${edge.rel}|${edge.to}`}>
              {dir === 'out' ? (
                <>
                  {REL_LABELS[edge.rel]} <a href="#" onClick={(e) => { e.preventDefault(); onSelect(other.id); }}>{other.text}</a> ({KIND_LABELS[other.kind].toLowerCase()})
                </>
              ) : (
                <>
                  <a href="#" onClick={(e) => { e.preventDefault(); onSelect(other.id); }}>{other.text}</a> ({KIND_LABELS[other.kind].toLowerCase()}) {REL_LABELS[edge.rel]} this
                </>
              )}{' '}
              <button class="btn small ghost" onClick={() => setKb((k) => unlink(k, edge), 'Removed link')}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div class="row" style="align-items:flex-end">
          <Field label="Link to">
            <Select value={target} options={linkable.map((n) => n.id)} labels={Object.fromEntries(linkable.map((n) => [n.id, `${KIND_LABELS[n.kind]}: ${n.text.slice(0, 60)}`]))} onChange={setTarget} allowEmpty="Choose" />
          </Field>
          <button
            class="btn small"
            disabled={!target}
            onClick={() => {
              const t = kb.nodes.find((n) => n.id === target)!;
              try {
                const fwd = allowedRels(node.kind, t.kind)[0];
                setKb((k) => (fwd ? link(k, node.id, fwd, t.id) : link(k, t.id, allowedRels(t.kind, node.kind)[0], node.id)), 'Linked knowledge');
                setTarget('');
              } catch (e) {
                toast((e as Error).message);
              }
            }}
          >
            Link
          </button>
        </div>
        <p class="small muted">
          Links this {KIND_LABELS[node.kind].toLowerCase()} can have: {ALLOWED.filter(([f, , t]) => f === node.kind || t === node.kind).map(([f, r, t]) => `${KIND_LABELS[f].toLowerCase()} ${REL_LABELS[r]} ${KIND_LABELS[t].toLowerCase()}`).join('; ') || 'none'}.
        </p>

        <h3>Merge a duplicate</h3>
        <div class="row" style="align-items:flex-end">
          <Select value={mergeWith} options={kb.nodes.filter((n) => n.kind === node.kind && n.id !== node.id).map((n) => n.id)} labels={Object.fromEntries(kb.nodes.map((n) => [n.id, n.text.slice(0, 70)]))} onChange={setMergeWith} allowEmpty="Choose a duplicate" />
          <button class="btn small" disabled={!mergeWith} onClick={() => { setKb((k) => mergeNodes(k, node.id, mergeWith), 'Merged knowledge'); setMergeWith(''); }}>
            Merge into this
          </button>
        </div>
        <button
          class="btn danger"
          onClick={() => {
            if (!confirm('Delete this knowledge and its links? You can undo.')) return;
            setKb((k) => removeNode(k, node.id), 'Deleted knowledge');
            onClose();
          }}
        >
          Delete
        </button>
      </div>
    </aside>
  );
}

export function Knowledge() {
  const ws = useWorkspace();
  const d = getData(ws);
  const kb = d.knowledge;
  const oems = [...new Set(d.decks.map((x) => x.oem))];
  const suggested = kb.nodes.filter((n) => n.status === 'suggested').length;
  const [oem, setOem] = useState('');
  const [kind, setKind] = useState<NodeKind | ''>('');
  const [status, setStatus] = useState<NodeStatus | 'active' | ''>(suggested ? 'suggested' : 'active');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [report, setReport] = useState<(ImportReport & { name: string }) | null>(null);
  const [claudeOem, setClaudeOem] = useState(oems[0] ?? '');
  const [newKind, setNewKind] = useState<NodeKind>('capability');
  const now = new Date();

  const rows = useMemo(
    () =>
      kb.nodes
        .filter((n) => (!oem || n.oem === oem || !n.oem) && (!kind || n.kind === kind) && (status === 'active' ? n.status !== 'retired' : !status || n.status === status) && (!q || `${n.text} ${n.notes ?? ''}`.toLowerCase().includes(q.toLowerCase())))
        .sort((a, b) => NODE_KINDS.indexOf(a.kind) - NODE_KINDS.indexOf(b.kind) || a.text.localeCompare(b.text)),
    [kb, oem, kind, status, q],
  );
  const counts = NODE_KINDS.map((k) => [k, kb.nodes.filter((n) => n.kind === k && n.status !== 'retired').length] as const).filter(([, c]) => c > 0);
  const node = kb.nodes.find((n) => n.id === sel);

  const exportForClaude = () => {
    const decks = d.decks.filter((x) => x.oem === claudeOem);
    const text = `${claudeInstructions(claudeOem)}\n\n# Deck text\n\n${deckTextForClaude(decks)}\n`;
    downloadBlob(new Blob([text], { type: 'text/markdown' }), `knowledge-request-${slug(claudeOem)}-${today()}.md`);
    toast(`Exported ${decks.length} decks for Claude`);
  };
  const importFile = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      const raw = JSON.parse((await f.text()).replace(/^\s*```(json)?\s*|\s*```\s*$/g, ''));
      const r = importPack(kb, raw, d.decks, kid, raw.source ? `${raw.source} (${f.name})` : f.name);
      setKb(() => r.kb, `Imported knowledge pack ${f.name}`);
      setReport({ ...r, name: f.name });
      setStatus('suggested');
    } catch (e) {
      toast(`Could not import: ${(e as Error).message}`);
    }
  };

  return (
    <div class="stack">
      <div class="callout small">
        Shared knowledge from partner decks: products, capabilities, pains, personas, proof, competitors, differentiators, objections and answers, and the redesign services that attach. The office curates it. Every item cites the slides it comes from. Items resting on internal slides are prep only.
      </div>
      <div class="row">
        <button
          class="btn"
          onClick={() => {
            let added = 0;
            setKb((k, dd) => {
              const r = seedFromLibrary(k, dd.decks, kid);
              added = r.added;
              return r.kb;
            }, 'Seeded knowledge from the library');
            toast(added ? `Added ${added} items from the library` : 'Already up to date with the library');
          }}
          data-testid="seed-knowledge"
        >
          Seed from library
        </button>
        <Select value={newKind} options={NODE_KINDS} labels={KIND_LABELS} onChange={(v) => setNewKind((v || 'capability') as NodeKind)} />
        <button
          class="btn"
          onClick={() => {
            const id = kid(newKind);
            setKb((k) => upsertNode(k, { id, kind: newKind, oem: oem || undefined, text: `New ${KIND_LABELS[newKind].toLowerCase()}`, status: 'suggested', evidence: [], origin: 'manual' }), 'Added knowledge');
            setSel(id);
          }}
        >
          Add
        </button>
        <span style="flex:1" />
        <Select value={claudeOem} options={oems} onChange={setClaudeOem} />
        <button class="btn" disabled={!claudeOem} onClick={exportForClaude} title="Instructions plus slide text; paste into Claude and save its answer as a .json file">
          Export for Claude
        </button>
        <button class="btn" onClick={importFile} data-testid="import-pack">
          Import knowledge pack
        </button>
        <button
          class="btn"
          disabled={!kb.nodes.length}
          onClick={() => downloadBlob(new Blob([JSON.stringify(exportPack(kb, d.decks), null, 1)], { type: 'application/json' }), `knowledge-pack-${today()}.json`)}
        >
          Export knowledge pack
        </button>
      </div>
      <details class="small">
        <summary>How to use Claude to extract knowledge</summary>
        <ol>
          <li>Pick the OEM and click Export for Claude. You get a .md file with instructions and the slide text of that OEM's decks.</li>
          <li>Paste it into Claude (or attach the file) and ask it to follow the instructions.</li>
          <li>Save Claude's answer as a .json file and click Import knowledge pack.</li>
          <li>Everything arrives as suggestions. Review each one against its slides, then approve, merge or retire it.</li>
        </ol>
      </details>
      <div class="row small">
        {counts.map(([k, c]) => (
          <button key={k} class={`btn small ${kind === k ? 'primary' : ''}`} onClick={() => setKind(kind === k ? '' : k)}>
            {KIND_LABELS[k]}: {c}
          </button>
        ))}
      </div>
      <div class="row">
        <input class="text" style="max-width:260px" placeholder="Search knowledge" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Search knowledge" />
        <Select value={oem} options={oems} onChange={setOem} allowEmpty="All OEMs" />
        <Select value={status} options={['active', 'suggested', 'approved', 'retired'] as const} labels={{ active: 'Suggested and approved', suggested: `Needs review (${suggested})`, approved: 'Approved', retired: 'Retired' }} onChange={(v) => setStatus(v as typeof status)} allowEmpty="Everything" />
        {picked.length > 0 && (
          <>
            <button class="btn small primary" onClick={() => { setKb((k) => ({ ...k, nodes: k.nodes.map((n) => (picked.includes(n.id) ? { ...n, status: 'approved' } : n)) }), `Approved ${picked.length} items`); setPicked([]); }}>
              Approve {picked.length}
            </button>
            <button class="btn small" onClick={() => { setKb((k) => ({ ...k, nodes: k.nodes.map((n) => (picked.includes(n.id) ? { ...n, status: 'retired' } : n)) }), `Retired ${picked.length} items`); setPicked([]); }}>
              Retire {picked.length}
            </button>
          </>
        )}
      </div>
      {kb.nodes.length === 0 ? (
        <Empty>No knowledge yet. Seed from library to start with products, competitors, personas and redesign services, then add or import the rest.</Empty>
      ) : (
        <div class="table-wrap" style="max-height:62vh">
          <table class="data" data-testid="knowledge-table">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" aria-label="Select all" checked={rows.length > 0 && rows.every((r) => picked.includes(r.id))} onChange={(e) => setPicked((e.target as HTMLInputElement).checked ? rows.map((r) => r.id) : [])} />
                </th>
                <th>Kind</th>
                <th>Knowledge</th>
                <th>OEM</th>
                <th>Status</th>
                <th class="num">Slides</th>
                <th class="num">Links</th>
                <th>Fresh as of</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((n) => {
                const fresh = freshAsOf(n, d.decks);
                return (
                  <tr key={n.id} class={`clickable ${sel === n.id ? 'selected' : ''}`} onClick={() => setSel(n.id)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={picked.includes(n.id)} onChange={(e) => setPicked((e.target as HTMLInputElement).checked ? [...picked, n.id] : picked.filter((x) => x !== n.id))} aria-label={`Select ${n.text}`} />
                    </td>
                    <td class="small">{KIND_LABELS[n.kind]}</td>
                    <td>
                      {n.text}
                      {!customerSafe(n, d.decks) && <span class="badge fail" style="margin-left:6px">prep only</span>}
                      {brokenEvidence(n, d.decks).length > 0 && <span class="badge fail" style="margin-left:6px">missing slide</span>}
                    </td>
                    <td class="small">{n.oem ?? 'Any'}</td>
                    <td>
                      <span class={`badge ${STATUS_BADGE[n.status]}`}>{n.status}</span>
                    </td>
                    <td class="num">{n.evidence.length}</td>
                    <td class="num">{neighbors(kb, n.id).length}</td>
                    <td class="small">
                      {fresh}
                      {isStaleNode(n, d.decks, d.staleMonths, now) && <span class="badge fail" style="margin-left:4px">stale</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {node && <NodeDetail node={node} d={d} onClose={() => setSel(null)} onSelect={setSel} />}
      {report && (
        <Modal title={`Imported ${report.name}`} onClose={() => setReport(null)}>
          <p>
            {report.added} new suggestions, {report.merged} merged into existing knowledge, {report.links} links.
          </p>
          {report.problems.length > 0 && (
            <>
              <p class="small">Skipped or fixed:</p>
              <ul class="small">
                {report.problems.slice(0, 50).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </>
          )}
          <p class="small muted">New items are suggestions. Review them under "Needs review".</p>
        </Modal>
      )}
    </div>
  );
}
