// Build-time plugins: optional licensed brand assets and the Content-Security-Policy.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import type { Plugin } from 'vite';

export const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  "connect-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "manifest-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const FONT_MIME: Record<string, string> = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };

function weightOf(name: string): number {
  const n = name.toLowerCase();
  if (n.includes('thin')) return 100;
  if (n.includes('light')) return 300;
  if (n.includes('semibold') || n.includes('semi-bold') || n.includes('demi')) return 600;
  if (n.includes('medium')) return 500;
  if (n.includes('extrabold') || n.includes('black') || n.includes('heavy')) return 800;
  if (n.includes('bold')) return 700;
  return 400;
}

/** virtual:brand exposes embedded fonts (base64) and the logo SVG when the files exist. */
export function brandAssets(root: string): Plugin {
  const id = 'virtual:brand';
  const rid = '\0' + id;
  return {
    name: 'cto-brand-assets',
    resolveId: (s) => (s === id ? rid : undefined),
    load(s) {
      if (s !== rid) return;
      const fontDir = join(root, 'assets/fonts');
      const faces: string[] = [];
      const families = new Set<string>();
      if (existsSync(fontDir)) {
        for (const f of readdirSync(fontDir).sort()) {
          const mime = FONT_MIME[extname(f).toLowerCase()];
          if (!mime) continue;
          const lower = f.toLowerCase();
          const family = lower.includes('plantijn') ? 'Martina Plantijn' : lower.includes('atelier') ? 'AF Atelier Sans' : null;
          if (!family) continue;
          families.add(family);
          const b64 = readFileSync(join(fontDir, f)).toString('base64');
          faces.push(`@font-face{font-family:'${family}';src:url(data:${mime};base64,${b64});font-weight:${weightOf(f)};font-style:${lower.includes('italic') ? 'italic' : 'normal'};font-display:block}`);
          this.addWatchFile?.(join(fontDir, f));
        }
      }
      const logoPath = join(root, 'assets/brand/redesign_logo_black.svg');
      const logo = existsSync(logoPath) ? readFileSync(logoPath, 'utf8').replace(/<\?xml[^>]*>/, '').replace(/<!--[\s\S]*?-->/g, '').trim() : null;
      return `export const fontCss = ${JSON.stringify(faces.join('\n'))};
export const fontFamilies = ${JSON.stringify([...families])};
export const logoSvg = ${JSON.stringify(logo)};`;
    },
  };
}

/** Adds the CSP meta tag to the built HTML only (the dev server needs its websocket). */
export function cspMeta(): Plugin {
  return {
    name: 'cto-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => html.replace('<head>', `<head>\n<meta http-equiv="Content-Security-Policy" content="${CSP}">`),
    },
  };
}

/**
 * Papa Parse ships a URL streamer built on XMLHttpRequest. We never use it, and the
 * CSP blocks it anyway; replace the constructor call so the built file contains no
 * network API at all.
 */
export function stripNetwork(): Plugin {
  return {
    name: 'cto-strip-network',
    apply: 'build',
    renderChunk(code) {
      const out = code.replace(/new XMLHttpRequest\b/g, '(()=>{throw new Error("Network access is disabled in this app")})()');
      return out === code ? null : { code: out, map: null };
    },
  };
}
