// Rasterizes the inlined redesign logo SVG to PNG for use in PowerPoint files.
import { logoSvg } from 'virtual:brand';

let cached: Promise<Uint8Array | null> | null = null;

export function hasLogo(): boolean {
  return !!logoSvg;
}

export function logoPng(heightPx = 160): Promise<Uint8Array | null> {
  if (!logoSvg) return Promise.resolve(null);
  if (cached) return cached;
  cached = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 4;
      const c = document.createElement('canvas');
      c.height = heightPx;
      c.width = Math.round(heightPx * ratio);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(async (b) => resolve(b ? new Uint8Array(await b.arrayBuffer()) : null), 'image/png');
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg!)}`;
  });
  return cached;
}
