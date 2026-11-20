// Chart export: SVG, PNG (1920 x 1080, 16:9) and CSV. All local, no network.
import { downloadBlob } from '../app/persist';
import { sanitizeText } from '../core/format';

export const W = 960;
export const H = 540;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chart';

export function svgString(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('[data-hover]').forEach((n) => n.remove());
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(W * 2));
  clone.setAttribute('height', String(H * 2));
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = `text{font-family:${getComputedStyle(document.body).fontFamily};}`;
  clone.insertBefore(style, clone.firstChild);
  return sanitizeText(new XMLSerializer().serializeToString(clone));
}

export function exportSvg(svg: SVGSVGElement, title: string) {
  downloadBlob(new Blob([svgString(svg)], { type: 'image/svg+xml' }), `${slug(title)}.svg`);
}

export function exportPng(svg: SVGSVGElement, title: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = W * 2;
      c.height = H * 2;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => {
        if (b) downloadBlob(b, `${slug(title)}.png`);
        resolve();
      }, 'image/png');
    };
    img.onerror = () => reject(new Error('Could not render PNG'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString(svg))}`;
  });
}

const csvCell = (v: unknown) => {
  const s = sanitizeText(v == null ? '' : typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v));
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

export function exportCsv(title: string, headers: string[], rows: unknown[][]) {
  downloadBlob(new Blob([toCsv(headers, rows)], { type: 'text/csv' }), `${slug(title)}.csv`);
}
