// Scenario timeline: months across, one lane per change, chips you drag to change the month.
import { useRef, useState } from 'preact/hooks';
import type { Scenario, Workspace } from '../../core/schema/types';
import type { ScenarioResult } from '../../core/engine/types';
import { effectiveChanges } from '../../core/engine/run';
import { changeRegistry } from '../../app/engine';
import { update } from '../../app/store';
import { range } from '../shared';

const COL = 34;
const LABEL = 128;

export function Timeline({ ws, sc, result, months, selectedId, onSelect }: { ws: Workspace; sc: Scenario; result: ScenarioResult | null; months: number; selectedId: string | null; onSelect: (id: string) => void }) {
  const eff = effectiveChanges(ws, sc.id);
  const reg = changeRegistry();
  const [drag, setDrag] = useState<{ id: string; startX: number; startMonth: number; month: number } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const cols = range(months + 1);
  const width = LABEL + cols.length * COL;
  const outcome = (id: string) => result?.changes.find((c) => c.changeId === id);

  const onDown = (e: PointerEvent, id: string, month: number) => {
    onSelect(id);
    if (sc.locked) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id, startX: e.clientX, startMonth: month, month });
  };
  const onMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const m = Math.max(0, Math.min(ws.settings.horizonMonths, d.startMonth + Math.round((e.clientX - d.startX) / COL)));
    if (m !== d.month) setDrag({ ...d, month: m });
  };
  const onUp = () => {
    const d = dragRef.current;
    if (!d) return;
    setDrag(null);
    if (d.month !== d.startMonth)
      update((w) => {
        const c = w.scenarios.find((s) => s.id === sc.id)!.changes.find((x) => x.id === d.id);
        if (c) c.month = d.month;
      }, `Moved change to M${d.month}`);
  };
  const onKey = (e: KeyboardEvent, id: string, month: number, own: boolean) => {
    if (!own || sc.locked) return;
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const m = Math.max(0, Math.min(ws.settings.horizonMonths, month + delta));
    update((w) => {
      const c = w.scenarios.find((s) => s.id === sc.id)!.changes.find((x) => x.id === id);
      if (c) c.month = m;
    }, `Moved change to M${m}`, { coalesce: `move-${id}` });
  };

  const x = (m: number) => LABEL + m * COL;
  const gateOutcomes = result?.gates ?? [];

  return (
    <div class="timeline" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <div class="tl-inner" style={`width:${width}px`}>
        <div class="tl-axis" style={`grid-template-columns:${LABEL}px repeat(${cols.length}, ${COL}px)`}>
          <div style="text-align:left;padding-left:8px">Month</div>
          {cols.map((m) => (
            <div key={m} class={m % 12 === 0 ? 'year' : ''}>
              {m}
            </div>
          ))}
        </div>
        <div style="position:relative">
          {gateOutcomes
            .filter((g) => g.month <= months)
            .map((g, i) => (
              <div key={i} class={`gate-mark ${g.pass ? '' : 'fail'}`} style={`left:${x(g.month) + COL / 2}px`} title={`${g.gateName}: ${g.reason}`}>
                <span>
                  {g.gateName.replace(/^Month \d+ /, '')} {g.pass ? 'pass' : 'miss'}
                </span>
              </div>
            ))}
          {gateOutcomes.length > 0 && <div class="tl-lane" style="height:22px" />}
          {eff.length === 0 && (
            <div class="tl-lane">
              <div class="lane-label">No changes yet</div>
            </div>
          )}
          {eff.map((ec) => {
            const own = ec.origin === sc.id;
            const t = reg.get(ec.change.type);
            const o = outcome(ec.change.id);
            const isDrag = drag?.id === ec.change.id;
            const planned = isDrag ? drag!.month : ec.month;
            const actual = !isDrag && o?.actualMonth != null ? o.actualMonth : planned;
            const label = t ? t.describe(ec.change.params as never, ws) : ec.change.type;
            const originName = own ? '' : ws.scenarios.find((s) => s.id === ec.origin)?.name ?? ec.origin;
            const held = o && o.status !== 'applied' && o.status !== 'disabled';
            return (
              <div class="tl-lane" key={`${ec.origin}:${ec.change.id}`}>
                <div class="lane-label" title={originName ? `Inherited from ${originName}` : ''}>
                  {t?.short ?? ec.change.type}
                  {originName ? ` (${originName.split(':')[0]})` : ''}
                </div>
                {actual !== planned && planned <= months && <div class="held-arrow" style={`left:${x(planned) + COL / 2}px;width:${(Math.min(actual, months) - planned) * COL}px`} />}
                {Math.min(actual, months + 1) <= months && (
                  <div
                    class={`chip ${own ? '' : 'inherited'} ${selectedId === ec.change.id ? 'selected' : ''} ${held ? 'held' : ''} ${isDrag ? 'dragging' : ''}`}
                    style={`left:${x(actual) + 2}px;${ec.change.enabled === false ? 'opacity:.4' : ''}`}
                    tabIndex={0}
                    role="button"
                    aria-label={`${label}, month ${actual}${own ? '. Arrow keys move it.' : ', inherited'}`}
                    title={`${label}\nPlanned M${planned}${o?.actualMonth != null && o.actualMonth !== planned ? `, applied M${o.actualMonth}` : ''}${o ? `, ${o.status}` : ''}${ec.change.gateId ? `, gate ${ec.change.gateId}` : ''}`}
                    onPointerDown={(e) => (own ? onDown(e as unknown as PointerEvent, ec.change.id, ec.change.month) : onSelect(ec.change.id))}
                    onKeyDown={(e) => onKey(e as unknown as KeyboardEvent, ec.change.id, ec.change.month, own)}
                    onClick={() => onSelect(ec.change.id)}
                  >
                    {ec.change.gateId ? '◆ ' : ''}
                    {label}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
