// Hand-built SVG charts. 16:9 viewBox so exports drop straight into decks.
import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { exportCsv, exportPng, exportSvg, W, H } from './export';
import { DASHES, GRID, INK, MUTED, SERIES } from './palette';
import { sanitizeText } from '../core/format';

export interface Series {
  name: string;
  values: number[];
  color?: string;
  dash?: string;
}

const PAD = { l: 92, r: 178, t: 104, b: 48 };

function niceTicks(min: number, max: number, n = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) max = min + 1;
  const span = max - min;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

function ChartFrame({ title, subtitle, csv, children, svgRef, note }: { title: string; subtitle?: string; csv: () => { headers: string[]; rows: unknown[][] }; children: ComponentChildren; svgRef: { current: SVGSVGElement | null }; note?: ComponentChildren }) {
  return (
    <figure class="chart" style="margin:0">
      <div class="chart-head no-print">
        <span class="title sr-only">{title}</span>
        <button class="btn small ghost" onClick={() => svgRef.current && exportPng(svgRef.current, title)} title="Download PNG (16:9)">
          PNG
        </button>
        <button class="btn small ghost" onClick={() => svgRef.current && exportSvg(svgRef.current, title)} title="Download SVG">
          SVG
        </button>
        <button
          class="btn small ghost"
          onClick={() => {
            const d = csv();
            exportCsv(title, d.headers, d.rows);
          }}
          title="Download data as CSV"
        >
          CSV
        </button>
      </div>
      {children}
      {note && <figcaption class="small muted">{note}</figcaption>}
    </figure>
  );
}

export interface LegendItem {
  name: string;
  color: string;
  dash?: string;
  kind?: 'line' | 'box';
}

function SvgTitle({ title, subtitle, legend = [] }: { title: string; subtitle?: string; legend?: LegendItem[] }) {
  let x = 16;
  let y = 88;
  const maxChars = Math.max(14, Math.min(40, Math.floor(((W - 16) / Math.max(1, legend.length) - 50) / 7.4)));
  const items = legend.map((l) => {
    const w = 34 + Math.min(maxChars, l.name.length) * 7.4 + 16;
    if (x + w > W - 10) {
      x = 16;
      y += 20;
    }
    const it = { ...l, x, y };
    x += w;
    return it;
  });
  return (
    <>
      <text x={16} y={30} font-size="22" font-weight="600" fill={INK}>
        {sanitizeText(title)}
      </text>
      {subtitle && (
        <text x={16} y={54} font-size="15" fill={MUTED}>
          {sanitizeText(subtitle)}
        </text>
      )}
      {items.map((l) => (
        <g key={l.name}>
          {l.kind === 'box' ? (
            <rect x={l.x} y={l.y - 10} width="24" height="12" rx="2" fill={l.color} opacity={l.dash === 'band' ? 0.45 : 1} />
          ) : (
            <line x1={l.x} x2={l.x + 26} y1={l.y - 4} y2={l.y - 4} stroke={l.color} stroke-width="3.5" stroke-dasharray={l.dash ?? ''} />
          )}
          <text x={l.x + 34} y={l.y} font-size="13" fill={INK}>
            {sanitizeText(l.name).slice(0, maxChars)}
          </text>
        </g>
      ))}
    </>
  );
}

export interface LineChartProps {
  title: string;
  subtitle?: string;
  x: number[]; // months
  xFormat?: (m: number) => string;
  series: Series[];
  yFormat: (v: number) => string;
  refLines?: { y: number; label: string }[];
  bands?: { name: string; lo: number[]; hi: number[]; color?: string }[];
  markers?: { x: number; label: string }[];
  yMinZero?: boolean;
  note?: ComponentChildren;
}

export function LineChart(p: LineChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const xs = p.x;
  const all = [...p.series.flatMap((s) => s.values), ...(p.bands ?? []).flatMap((b) => [...b.lo, ...b.hi]), ...(p.refLines ?? []).map((r) => r.y)].filter(Number.isFinite);
  let min = all.length ? Math.min(...all) : 0;
  let max = all.length ? Math.max(...all) : 1;
  if (p.yMinZero !== false) min = Math.min(0, min);
  if (max === min) max = min + 1;
  const ticks = niceTicks(min, max);
  min = Math.min(min, ticks[0]);
  max = Math.max(max, ticks[ticks.length - 1]);
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const sx = (i: number) => PAD.l + (xs.length > 1 ? (i / (xs.length - 1)) * iw : iw / 2);
  const sy = (v: number) => PAD.t + ih - ((v - min) / (max - min)) * ih;
  const path = (vals: number[]) => vals.map((v, i) => (Number.isFinite(v) ? `${i === 0 || !Number.isFinite(vals[i - 1]) ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}` : '')).join('');
  const xf = p.xFormat ?? ((m: number) => `M${m}`);
  const xStep = xs.length > 25 ? 6 : xs.length > 13 ? 3 : 1;
  // Direct end labels, nudged apart.
  const ends = [
    ...p.series.map((s, i) => ({ i, y: sy(s.values[s.values.length - 1] ?? 0), name: s.name, ref: false })),
    ...(p.refLines ?? []).map((r, i) => ({ i: 1000 + i, y: sy(r.y), name: r.label, ref: true })),
  ]
    .filter((e) => Number.isFinite(e.y))
    .sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 17) ends[k].y = ends[k - 1].y + 17;
  const onMove = (e: MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((x - PAD.l) / iw) * (xs.length - 1));
    setHover(i >= 0 && i < xs.length ? i : null);
  };
  const csv = () => ({
    headers: ['Month', ...p.series.map((s) => s.name), ...(p.bands ?? []).flatMap((b) => [`${b.name} low`, `${b.name} high`])],
    rows: xs.map((m, i) => [m, ...p.series.map((s) => s.values[i]), ...(p.bands ?? []).flatMap((b) => [b.lo[i], b.hi[i]])]),
  });
  return (
    <ChartFrame title={p.title} subtitle={p.subtitle} csv={csv} svgRef={svgRef} note={p.note}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={p.title} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <rect x="0" y="0" width={W} height={H} fill="#fff" />
        <SvgTitle
          title={p.title}
          subtitle={p.subtitle}
          legend={[
            ...p.series.map((s, i) => ({ name: s.name, color: s.color ?? SERIES[i % SERIES.length], dash: s.dash ?? DASHES[i % DASHES.length] })),
            ...(p.bands ?? []).map((b) => ({ name: b.name, color: b.color ?? '#cfd8fd', kind: 'box' as const, dash: 'band' })),
          ]}
        />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} stroke={GRID} />
            <text x={PAD.l - 8} y={sy(t) + 5} font-size="15" text-anchor="end" fill={MUTED}>
              {p.yFormat(t)}
            </text>
          </g>
        ))}
        {xs.map((m, i) =>
          i % xStep === 0 ? (
            <text key={m} x={sx(i)} y={H - PAD.b + 22} font-size="15" text-anchor="middle" fill={MUTED}>
              {xf(m)}
            </text>
          ) : null,
        )}
        <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih} stroke={INK} />
        {(p.bands ?? []).map((b, bi) => {
          const top = b.hi.map((v, i) => `${i ? 'L' : 'M'}${sx(i)},${sy(v)}`).join('');
          const bot = b.lo.map((_, j) => b.lo.length - 1 - j).map((i) => `L${sx(i)},${sy(b.lo[i])}`).join('');
          return <path key={bi} d={`${top}${bot}Z`} fill={b.color ?? '#cfd8fd'} opacity="0.35" />;
        })}
        {(p.refLines ?? []).map((r) => (
          <g key={r.label}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(r.y)} y2={sy(r.y)} stroke={INK} stroke-dasharray="2 4" />
          </g>
        ))}
        {(p.markers ?? []).map((mk) => {
          const i = xs.indexOf(mk.x);
          if (i < 0) return null;
          return (
            <g key={mk.label}>
              <line x1={sx(i)} x2={sx(i)} y1={PAD.t} y2={PAD.t + ih} stroke={INK} stroke-dasharray="4 3" />
              <text x={sx(i) + 5} y={PAD.t + 14} font-size="14" fill={INK}>
                {mk.label}
              </text>
            </g>
          );
        })}
        {p.series.map((s, i) => (
          <path key={s.name} d={path(s.values)} fill="none" stroke={s.color ?? SERIES[i % SERIES.length]} stroke-width="2.5" stroke-dasharray={s.dash ?? DASHES[i % DASHES.length]} stroke-linejoin="round" />
        ))}
        {ends.map((e) => (
          <text key={e.i} x={W - PAD.r + 8} y={e.y + 5} font-size={e.ref ? 13 : 14} fill={e.ref ? MUTED : INK}>
            {sanitizeText(e.name).slice(0, 22)}
          </text>
        ))}
        {hover != null && (
          <g data-hover>
            <line x1={sx(hover)} x2={sx(hover)} y1={PAD.t} y2={PAD.t + ih} stroke={MUTED} />
            {p.series.map((s, i) => (Number.isFinite(s.values[hover]) ? <circle key={i} cx={sx(hover)} cy={sy(s.values[hover])} r="4.5" fill={s.color ?? SERIES[i % SERIES.length]} stroke="#fff" stroke-width="2" /> : null))}
            {(() => {
              const bx = sx(hover) > W / 2 ? sx(hover) - 236 : sx(hover) + 12;
              const lines = [xf(xs[hover]), ...p.series.map((s) => `${s.name.slice(0, 22)}: ${p.yFormat(s.values[hover])}`)];
              return (
                <g>
                  <rect x={bx} y={PAD.t + 4} width="224" height={lines.length * 17 + 10} rx="4" fill="#fff" stroke={INK} />
                  {lines.map((l, k) => (
                    <text key={k} x={bx + 8} y={PAD.t + 21 + k * 17} font-size="13" font-weight={k ? 400 : 600} fill={INK}>
                      {l}
                    </text>
                  ))}
                </g>
              );
            })()}
          </g>
        )}
      </svg>
    </ChartFrame>
  );
}

export interface StackedBarProps {
  title: string;
  subtitle?: string;
  x: number[];
  xFormat?: (m: number) => string;
  /** category -> values by x index */
  stacks: { name: string; values: number[] }[];
  yFormat: (v: number) => string;
  note?: ComponentChildren;
}

/** Stacked columns. More than 5 categories fold into Other (gray). */
export function StackedBar(p: StackedBarProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  let stacks = [...p.stacks].sort((a, b) => b.values.reduce((s, x) => s + x, 0) - a.values.reduce((s, x) => s + x, 0));
  if (stacks.length > 5) {
    const keep = stacks.slice(0, 4);
    const rest = stacks.slice(4);
    stacks = [...keep, { name: `Other (${rest.length})`, values: p.x.map((_, i) => rest.reduce((s, r) => s + (r.values[i] ?? 0), 0)) }];
  }
  const totals = p.x.map((_, i) => stacks.reduce((s, st) => s + Math.max(0, st.values[i] ?? 0), 0));
  const ticks = niceTicks(0, Math.max(1, ...totals));
  const max = ticks[ticks.length - 1];
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const bw = iw / p.x.length;
  const sy = (v: number) => PAD.t + ih - (v / max) * ih;
  const xf = p.xFormat ?? ((m: number) => `M${m}`);
  const xStep = p.x.length > 25 ? 6 : p.x.length > 13 ? 3 : 1;
  const csv = () => ({ headers: ['Month', ...stacks.map((s) => s.name), 'Total'], rows: p.x.map((m, i) => [m, ...stacks.map((s) => s.values[i]), totals[i]]) });
  return (
    <ChartFrame title={p.title} subtitle={p.subtitle} csv={csv} svgRef={svgRef} note={p.note}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={p.title} onMouseLeave={() => setHover(null)}>
        <rect x="0" y="0" width={W} height={H} fill="#fff" />
        <SvgTitle title={p.title} subtitle={p.subtitle} legend={stacks.map((st, i) => ({ name: st.name, color: SERIES[i], kind: 'box' as const }))} />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} stroke={GRID} />
            <text x={PAD.l - 8} y={sy(t) + 5} font-size="15" text-anchor="end" fill={MUTED}>
              {p.yFormat(t)}
            </text>
          </g>
        ))}
        {p.x.map((m, i) => {
          let acc = 0;
          return (
            <g key={m} onMouseEnter={() => setHover(i)}>
              <rect x={PAD.l + i * bw} y={PAD.t} width={bw} height={ih} fill="transparent" />
              {stacks.map((s, k) => {
                const v = Math.max(0, s.values[i] ?? 0);
                if (!v) return null;
                const y0 = sy(acc);
                acc += v;
                const y1 = sy(acc);
                return <rect key={k} x={PAD.l + i * bw + 1} y={y1 + 1} width={Math.max(1, bw - 2)} height={Math.max(0, y0 - y1 - 2)} fill={SERIES[k]} rx="1.5" />;
              })}
              {i % xStep === 0 && (
                <text x={PAD.l + i * bw + bw / 2} y={H - PAD.b + 22} font-size="15" text-anchor="middle" fill={MUTED}>
                  {xf(m)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih} stroke={INK} />
        {(() => {
          const last = p.x.length - 1;
          let acc = 0;
          return stacks.map((s, k) => {
            const v = Math.max(0, s.values[last] ?? 0);
            const mid = sy(acc + v / 2);
            acc += v;
            return v ? (
              <text key={k} x={W - PAD.r + 8} y={mid + 5} font-size="13" fill={INK}>
                {sanitizeText(s.name).slice(0, 22)}
              </text>
            ) : null;
          });
        })()}
        {hover != null && (
          <g data-hover>
            {(() => {
              const bx = PAD.l + hover * bw > W / 2 ? PAD.l + hover * bw - 236 : PAD.l + (hover + 1) * bw + 8;
              const lines = [`${xf(p.x[hover])}: ${p.yFormat(totals[hover])}`, ...stacks.map((s) => `${s.name.slice(0, 22)}: ${p.yFormat(s.values[hover] ?? 0)}`)];
              return (
                <g>
                  <rect x={bx} y={PAD.t + 4} width="224" height={lines.length * 17 + 10} rx="4" fill="#fff" stroke={INK} />
                  {lines.map((l, k) => (
                    <text key={k} x={bx + 8} y={PAD.t + 21 + k * 17} font-size="13" font-weight={k ? 400 : 600} fill={INK}>
                      {l}
                    </text>
                  ))}
                </g>
              );
            })()}
          </g>
        )}
      </svg>
    </ChartFrame>
  );
}

export interface TornadoProps {
  title: string;
  subtitle?: string;
  base: number;
  bars: { label: string; atLow: number; atHigh: number; lowInput: string; highInput: string }[];
  format: (v: number) => string;
}

export function Tornado(p: TornadoProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const L = 330;
  const R = 70;
  const vals = p.bars.flatMap((b) => [b.atLow, b.atHigh]).concat(p.base).filter(Number.isFinite);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const iw = W - L - R;
  const sx = (v: number) => L + ((v - min) / span) * iw;
  const rowH = Math.min(38, (H - PAD.t - 40) / Math.max(1, p.bars.length));
  const csv = () => ({ headers: ['Assumption', 'Low input', 'High input', 'Result at low', 'Result at high', 'Swing'], rows: p.bars.map((b) => [b.label, b.lowInput, b.highInput, b.atLow, b.atHigh, Math.abs(b.atHigh - b.atLow)]) });
  return (
    <ChartFrame title={p.title} subtitle={p.subtitle} csv={csv} svgRef={svgRef}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={p.title}>
        <rect x="0" y="0" width={W} height={H} fill="#fff" />
        <SvgTitle title={p.title} subtitle={p.subtitle} legend={[{ name: 'Assumption at low bound', color: SERIES[0], kind: 'box' }, { name: 'Assumption at high bound', color: SERIES[1], kind: 'box' }]} />
        {p.bars.map((b, i) => {
          const y = PAD.t + 10 + i * rowH;
          const h = rowH - 8;
          const seg = (v: number, color: string, lbl: string) => {
            const x0 = Math.min(sx(p.base), sx(v));
            const w = Math.abs(sx(v) - sx(p.base));
            return (
              <g>
                <rect x={x0} y={y} width={Math.max(1, w)} height={h} fill={color} rx="2" />
                <text x={v < p.base ? x0 - 4 : x0 + w + 4} y={y + h / 2 + 5} font-size="13" text-anchor={v < p.base ? 'end' : 'start'} fill={INK}>
                  {lbl}
                </text>
              </g>
            );
          };
          return (
            <g key={b.label}>
              <text x={L - 8 - 64} y={y + h / 2 + 5} font-size="13" text-anchor="end" fill={INK}>
                {sanitizeText(b.label).slice(0, 38)}
              </text>
              {seg(b.atLow, SERIES[0], p.format(b.atLow))}
              {seg(b.atHigh, SERIES[1], p.format(b.atHigh))}
            </g>
          );
        })}
        <line x1={sx(p.base)} x2={sx(p.base)} y1={PAD.t} y2={H - 30} stroke={INK} />
        <text x={sx(p.base)} y={H - 12} font-size="14" text-anchor="middle" fill={INK}>
          Current case: {p.format(p.base)}
        </text>
      </svg>
    </ChartFrame>
  );
}
