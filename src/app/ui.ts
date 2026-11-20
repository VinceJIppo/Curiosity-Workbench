// Per-viewer UI state that is not part of the workspace (not undoable, not saved in the file).
import { useEffect, useState } from 'preact/hooks';

type L = () => void;
const listeners = new Set<L>();
const state: { activeScenarioId: string | null; compareIds: string[] } = { activeScenarioId: null, compareIds: [] };

try {
  const raw = localStorage.getItem('cto-ui');
  if (raw) Object.assign(state, JSON.parse(raw));
} catch {
  /* private mode or blocked storage */
}

export function setUi(patch: Partial<typeof state>) {
  Object.assign(state, patch);
  try {
    localStorage.setItem('cto-ui', JSON.stringify(state));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function useUi() {
  const [, set] = useState(0);
  useEffect(() => {
    const l = () => set((x) => x + 1);
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);
  return state;
}
