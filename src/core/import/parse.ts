// File parsing for the import wizard: CSV (Papa Parse), XLSX (SheetJS CE), JSON.
import Papa from 'papaparse';
import { read, utils } from 'xlsx';

export interface Table {
  headers: string[];
  rows: Record<string, unknown>[];
}

const cleanHeader = (h: unknown, i: number) => {
  const s = String(h ?? '').replace(/^﻿/, '').trim();
  return s || `Column ${i + 1}`;
};

function dedupeHeaders(hs: string[]): string[] {
  const seen = new Map<string, number>();
  return hs.map((h) => {
    const n = seen.get(h) ?? 0;
    seen.set(h, n + 1);
    return n ? `${h} (${n + 1})` : h;
  });
}

export function parseCsv(text: string): Table {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
  const data = res.data as unknown as string[][];
  if (!data.length) return { headers: [], rows: [] };
  const headers = dedupeHeaders(data[0].map(cleanHeader));
  const rows = data.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
  return { headers, rows };
}

export interface Workbook {
  sheets: string[];
  table(sheet: string): Table;
}

export function parseXlsx(buf: ArrayBuffer): Workbook {
  const wb = read(new Uint8Array(buf), { type: 'array', cellDates: false });
  return {
    sheets: wb.SheetNames,
    table(sheet: string): Table {
      const ws = wb.Sheets[sheet];
      if (!ws) return { headers: [], rows: [] };
      const aoa = utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '', blankrows: false });
      // Header row: first row with at least two non-empty cells.
      const hi = aoa.findIndex((r) => r.filter((c) => String(c ?? '').trim() !== '').length >= 2);
      if (hi < 0) return { headers: [], rows: [] };
      const headers = dedupeHeaders(aoa[hi].map(cleanHeader));
      const rows = aoa
        .slice(hi + 1)
        .filter((r) => r.some((c) => String(c ?? '').trim() !== ''))
        .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
      return { headers, rows };
    },
  };
}

export function parseJsonRows(text: string): Table {
  const data = JSON.parse(text);
  const arr: unknown[] = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : Array.isArray(data?.data) ? data.data : [];
  const rows = arr.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x));
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return { headers, rows };
}

/** True when a JSON text looks like a whole workspace rather than rows. */
export function looksLikeWorkspace(text: string): boolean {
  try {
    const d = JSON.parse(text);
    return !!d && typeof d === 'object' && !Array.isArray(d) && ('scenarios' in d || 'schemaVersion' in d) && 'assumptions' in d;
  } catch {
    return false;
  }
}
