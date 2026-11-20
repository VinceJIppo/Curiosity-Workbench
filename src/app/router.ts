import { useEffect, useState } from 'preact/hooks';

export function parseHash(h = location.hash): string[] {
  return h.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
}

export function navigate(path: string) {
  location.hash = path.startsWith('/') ? path : `/${path}`;
}

export function useRoute(): string[] {
  const [r, setR] = useState(parseHash());
  useEffect(() => {
    const f = () => setR(parseHash());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}
