import { render } from 'preact';
import { fontCss } from 'virtual:brand';
import './styles.css';
import { App } from './app/App';
import { initStore } from './app/store';
import { loadAutosave } from './app/persist';
import { allModules, moduleMigrations } from './modules/registry';
import { migrateWorkspace } from './core/schema/migrate';
import { sampleWorkspace } from './samples/seed';

async function boot() {
  if (fontCss) {
    const st = document.createElement('style');
    st.textContent = fontCss;
    document.head.appendChild(st);
  }
  allModules(); // registers module entity types
  const saved = await loadAutosave();
  initStore(saved ?? migrateWorkspace(sampleWorkspace(new Date().toISOString()), moduleMigrations()));
  render(<App />, document.getElementById('app')!);
}

boot();
