// Workspace store with undo/redo. Views call update() with a mutator that edits a draft.
// The draft is a deep clone except for snapshots, which mutators must replace, not push into.
import { useEffect, useState } from 'preact/hooks';
import type { Workspace } from '../core/schema/types';

export type SaveState = 'saved' | 'unsaved' | 'autosaved' | 'autosave failed';

type Listener = () => void;

const MAX_HISTORY = 60;

class Store {
  ws: Workspace;
  past: { ws: Workspace; label: string }[] = [];
  future: { ws: Workspace; label: string }[] = [];
  saveState: SaveState = 'saved';
  fileName: string | null = null;
  lastLabel = '';
  private listeners = new Set<Listener>();

  constructor(ws: Workspace) {
    this.ws = ws;
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  emit() {
    this.listeners.forEach((l) => l());
  }

  update(mutate: (draft: Workspace) => void, label: string, opts: { log?: boolean; coalesce?: string } = {}) {
    const prev = this.ws;
    const { snapshots, ...rest } = prev;
    const draft = { ...structuredClone(rest), snapshots } as Workspace;
    mutate(draft);
    draft.updatedAt = new Date().toISOString();
    if (opts.log !== false) draft.changeLog = [...draft.changeLog.slice(-499), { at: draft.updatedAt, action: label }];
    // Coalesce rapid edits of the same field (typing) into one undo step.
    if (opts.coalesce && this.past.length && this.lastLabel === opts.coalesce) {
      // keep the older history entry
    } else {
      this.past.push({ ws: prev, label });
      if (this.past.length > MAX_HISTORY) this.past.shift();
    }
    this.lastLabel = opts.coalesce ?? '';
    this.future = [];
    this.ws = draft;
    this.saveState = 'unsaved';
    this.emit();
  }

  replace(ws: Workspace, fileName: string | null = null) {
    this.ws = ws;
    this.past = [];
    this.future = [];
    this.fileName = fileName;
    this.saveState = 'saved';
    this.lastLabel = '';
    this.emit();
  }

  undo() {
    const p = this.past.pop();
    if (!p) return;
    this.future.push({ ws: this.ws, label: p.label });
    this.ws = p.ws;
    this.saveState = 'unsaved';
    this.lastLabel = '';
    this.emit();
  }
  redo() {
    const f = this.future.pop();
    if (!f) return;
    this.past.push({ ws: this.ws, label: f.label });
    this.ws = f.ws;
    this.saveState = 'unsaved';
    this.lastLabel = '';
    this.emit();
  }
  setSaveState(s: SaveState) {
    this.saveState = s;
    this.emit();
  }
}

export let store: Store;
export function initStore(ws: Workspace) {
  store = new Store(ws);
  return store;
}

export function useStore(): Store {
  const [, setTick] = useState(0);
  useEffect(() => store.subscribe(() => setTick((t) => t + 1)), []);
  return store;
}

export function useWorkspace(): Workspace {
  return useStore().ws;
}

export const update = (mutate: (d: Workspace) => void, label: string, opts?: { log?: boolean; coalesce?: string }) => store.update(mutate, label, opts);
