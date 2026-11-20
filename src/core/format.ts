// Display formatting. Rounding happens here and only here.

const EM_DASH = '—';

/** Applies the writing rules to any text we export or display from user data. */
export function sanitizeText(s: string): string {
  return s
    .split(EM_DASH)
    .join(', ')
    .replace(/VMware Live Site Recovery|VMware Live Recovery|Live Site Recovery/g, 'VMware Protection and Recovery');
}

function sig3(x: number): string {
  const ax = Math.abs(x);
  const dp = ax >= 100 ? 0 : ax >= 10 ? 1 : 2;
  return String(Number(x.toFixed(dp)));
}

/** $924K, $1.32M, $72K, $4K. Three significant digits. */
export function money(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  const neg = v < 0;
  let a = Math.abs(v);
  let out: string;
  if (a < 1000) out = `$${Math.round(a)}`;
  else if (a < 999_500) {
    a = a / 1000;
    out = `$${sig3(a)}K`;
  } else if (a < 999_500_000) out = `$${sig3(a / 1e6)}M`;
  else out = `$${sig3(a / 1e9)}B`;
  return neg ? `-${out}` : out;
}

/** $230,986 */
export function moneyFull(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  const r = Math.round(v);
  return `${r < 0 ? '-' : ''}$${Math.abs(r).toLocaleString('en-US')}`;
}

export function moneyRange(lo: number, hi: number): string {
  return `${money(lo)} to ${money(hi)}`;
}

export function num(v: number | null | undefined, dp = 0): string {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Coverage ratios: one decimal. */
export function ratio1(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  return v.toFixed(1);
}

export function pct(v: number | null | undefined, dp = 0): string {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  return `${(v * 100).toFixed(dp)}%`;
}

export function monthDate(approvalMonth: string, m: number): string {
  const [y, mo] = approvalMonth.split('-').map(Number);
  if (!y || !mo) return `M${m}`;
  const d = new Date(Date.UTC(y, mo - 1 + m, 1));
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function monthLabel(approvalMonth: string, m: number): string {
  return `M${m} (${monthDate(approvalMonth, m)})`;
}

/** Format a value by unit string from the register. */
export function byUnit(v: number, unit: string | undefined): string {
  const u = (unit || '').toLowerCase();
  if (u.includes('$')) return Math.abs(v) >= 10_000 ? money(v) : moneyFull(v);
  if (u === '%' || u === 'pct' || u === 'percent') return pct(v, Math.abs(v) < 0.1 ? 1 : 0);
  if (u === 'ratio') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (Number.isInteger(v)) return num(v);
  return num(v, 2);
}
