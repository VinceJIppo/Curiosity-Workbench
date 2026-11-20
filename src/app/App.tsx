import { useEffect } from 'preact/hooks';
import { logoSvg } from 'virtual:brand';
import { store, update, useStore } from './store';
import { navigate, useRoute } from './router';
import { setUi } from './ui';
import { saveWorkspace, openWorkspaceFile, autosave } from './persist';
import { allModules, landingModule } from '../modules/registry';
import { MathHost } from '../ui/math';
import { Seg, ToastHost, toast } from '../ui/components';
import type { CaseKey } from '../core/schema/types';
import { useActiveScenario } from '../modules/shared';

let autosaveTimer: ReturnType<typeof setTimeout> | undefined;

async function doSave(saveAs = false) {
  const n = await saveWorkspace(store.ws, saveAs);
  await autosave(store.ws);
  if (n) {
    store.fileName = n;
    store.setSaveState('saved');
    toast(`Saved ${n}`);
  }
}

async function doOpen() {
  try {
    const r = await openWorkspaceFile();
    if (r) {
      store.replace(r.ws, r.name);
      toast(`Opened ${r.name}`);
    }
  } catch (e) {
    toast(`Could not open: ${(e as Error).message}`);
  }
}

export function App() {
  const s = useStore();
  const ws = s.ws;
  const route = useRoute();
  const modules = allModules();
  const mod = modules.find((m) => m.id === route[0]) ?? landingModule();
  const view = mod.views.find((v) => v.id === route[1]) ?? mod.views[0];
  const params = route[0] === mod.id && route[1] === view.id ? route.slice(2) : [];
  const active = useActiveScenario(ws);

  const routeKey = route.slice(0, 2).join('/');
  useEffect(() => {
    document.querySelector('main')?.scrollTo(0, 0);
  }, [routeKey]);

  useEffect(() => {
    document.title = `${ws.settings.displayName} workbench`;
  }, [ws.settings.displayName]);

  // Autosave to IndexedDB shortly after each change.
  useEffect(() => {
    if (s.saveState !== 'unsaved') return;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(async () => {
      const ok = await autosave(store.ws);
      if (store.saveState === 'unsaved') store.setSaveState(ok ? 'autosaved' : 'autosave failed');
    }, 700);
  }, [ws]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      const inField = (e.target as HTMLElement)?.matches?.('input, textarea, select');
      if (k === 's') {
        e.preventDefault();
        doSave(e.shiftKey);
      } else if (k === 'o') {
        e.preventDefault();
        doOpen();
      } else if (k === 'z' && !inField) {
        e.preventDefault();
        e.shiftKey ? store.redo() : store.undo();
      } else if (k === 'y' && !inField) {
        e.preventDefault();
        store.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (store.saveState === 'unsaved') e.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    const flush = () => {
      if (store.saveState === 'unsaved') autosave(store.ws);
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);

  const View = view.component;
  const visibleViews = mod.views.filter((v) => !v.hidden);
  const saveLabel = s.saveState === 'saved' ? 'Saved' : s.saveState === 'autosaved' ? 'Autosaved locally' : s.saveState === 'unsaved' ? 'Unsaved changes' : 'Autosave failed';

  return (
    <div class="app">
      <header class="topbar">
        <div class="brand">
          {logoSvg && <span class="logo" dangerouslySetInnerHTML={{ __html: logoSvg }} />}
          <span>{ws.settings.displayName}</span>
        </div>
        <span class="small muted" title="Workspace">
          {ws.name}
        </span>
        <span class="spacer" />
        <label>
          Scenario
          <select class="text" style="width:auto" value={active.id} onChange={(e) => setUi({ activeScenarioId: (e.target as HTMLSelectElement).value })} aria-label="Active scenario">
            {ws.scenarios.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Case
          <Seg<CaseKey> value={ws.settings.caseKey} options={['conservative', 'base', 'aggressive']} labels={{ conservative: 'Conservative', base: 'Base', aggressive: 'Aggressive' }} onChange={(c) => update((w) => (w.settings.caseKey = c), `Case: ${c}`)} />
        </label>
        <button class="btn small ghost" onClick={() => store.undo()} disabled={!s.past.length} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button class="btn small ghost" onClick={() => store.redo()} disabled={!s.future.length} title="Redo (Ctrl+Shift+Z)">
          Redo
        </button>
        <button class="btn small" onClick={() => doOpen()} title="Open a workspace file (Ctrl+O)">
          Open
        </button>
        <button class="btn small primary" onClick={() => doSave()} title="Save the workspace file (Ctrl+S)">
          Save
        </button>
        <span class={`save-state ${s.saveState === 'unsaved' ? 'unsaved' : ''}`} role="status">
          {saveLabel}
        </span>
      </header>
      <nav class="side" aria-label="Modules">
        {modules
          .filter((m) => !m.hiddenFromNav)
          .map((m) => (
            <a
              key={m.id}
              href={`#/${m.id}`}
              class={m.id === mod.id ? 'active' : ''}
              aria-current={m.id === mod.id ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                navigate(`/${m.id}`);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d={m.icon} />
              </svg>
              {m.title}
            </a>
          ))}
        <div class="nav-foot">
          Offline. No network.
          <br />
          Ctrl+S save, Ctrl+O open, Ctrl+Z undo.
        </div>
      </nav>
      <main>
        {visibleViews.length > 1 && (
          <div class="tabs no-print" role="tablist">
            {visibleViews.map((v) => (
              <a key={v.id} href={`#/${mod.id}/${v.id}`} class={v.id === view.id ? 'active' : ''} role="tab" aria-selected={v.id === view.id}>
                {v.title}
              </a>
            ))}
          </div>
        )}
        <View params={params} />
      </main>
      <MathHost />
      <ToastHost />
    </div>
  );
}
