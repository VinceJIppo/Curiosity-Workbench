// "Show the math" popover: formula, inputs by ID, and each input's status and source.
import { useState } from 'preact/hooks';
import type { Trace } from '../core/engine/types';
import { byUnit, sanitizeText } from '../core/format';
import { Badge, ConflictFlag, Modal } from './components';
import { navigate } from '../app/router';

let open: ((t: Trace | null) => void) | null = null;
export const showMath = (t: Trace) => open?.(t);

export function MathHost() {
  const [t, setT] = useState<Trace | null>(null);
  open = setT;
  if (!t) return null;
  return (
    <Modal title={`Show the math: ${t.label}`} onClose={() => setT(null)} wide>
      <div class="kpi" style="max-width: 360px">
        <div class="label">Value</div>
        <div class="value">{fmtUnit(t.value, t.unit)}</div>
        <div class="sub mono">{Number.isFinite(t.value) ? `unrounded: ${t.value}` : ''}</div>
      </div>
      <h3 style="margin-top:14px">Formula</h3>
      <div class="formula">{t.formula}</div>
      {t.conflicts.length > 0 && (
        <div class="callout warn" style="margin-top:12px">
          This number depends on assumptions marked Conflict: <b>{t.conflicts.join(', ')}</b>. Resolve them in the register or override the value in a scenario.
        </div>
      )}
      <h3 style="margin-top:14px">Inputs</h3>
      <table class="data">
        <thead>
          <tr>
            <th>Input</th>
            <th>ID</th>
            <th class="num">Value</th>
            <th>Status</th>
            <th>Used</th>
            <th>Source</th>
            <th>As of</th>
          </tr>
        </thead>
        <tbody>
          {t.inputs.map((i, k) => (
            <tr key={k}>
              <td>
                {i.label}
                {i.formula && <div class="mono muted">= {i.formula}</div>}
              </td>
              <td>
                {i.assumptionId ? (
                  <a
                    href={`#/assumptions/register/${i.assumptionId}`}
                    onClick={(e) => {
                      e.preventDefault();
                      setT(null);
                      navigate(`/assumptions/register/${i.assumptionId}`);
                    }}
                  >
                    {i.assumptionId}
                  </a>
                ) : (
                  <span class="muted">derived</span>
                )}
              </td>
              <td class="num">
                {fmtUnit(i.value, i.unit)}
                <ConflictFlag ids={i.conflicts ?? []} />
              </td>
              <td>{i.status ? <Badge status={i.status} /> : ''}</td>
              <td class="small">{i.used ?? ''}</td>
              <td class="small">{i.source ? sanitizeText(i.source) : ''}</td>
              <td class="small">{i.asOf ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {t.notes && t.notes.length > 0 && (
        <>
          <h3 style="margin-top:14px">Detail</h3>
          <ul class="small">
            {t.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </>
      )}
      <p class="small muted" style="margin-top:12px">
        Numbers are rounded for display only. Calculations carry full precision.
      </p>
    </Modal>
  );
}

export function fmtUnit(v: number, unit?: string): string {
  if (unit === 'month') return Number.isFinite(v) ? `M${v}` : 'none in horizon';
  if (unit === 'ratio') return Number.isFinite(v) ? (Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(2)) : 'n/a';
  return Number.isFinite(v) ? byUnit(v, unit) : 'n/a';
}

/** A number you can click to see its math. Flags Conflict inputs. */
export function Num({ trace, text, cls }: { trace: Trace; text?: string; cls?: string }) {
  return (
    <span class={cls}>
      <button class="num-btn" title="Show the math" onClick={() => showMath(trace)}>
        {text ?? fmtUnit(trace.value, trace.unit)}
      </button>
      <ConflictFlag ids={trace.conflicts} />
    </span>
  );
}
