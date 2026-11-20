import type { ModuleManifest } from '../../app/module';
import { useWorkspace } from '../../app/store';
import { navigate } from '../../app/router';
import { setUi, useUi } from '../../app/ui';
import type { ScenarioResult } from '../../core/engine/types';
import { CompareBody, defaultCompareIds } from '../../ui/compare';
import { run, scenarioStyle } from '../shared';

function Compare() {
  const ws = useWorkspace();
  const ui = useUi();
  const ids = defaultCompareIds(ws, ui.compareIds);
  const results = ids.map((id) => run(ws, id)).filter((r): r is ScenarioResult => !(r instanceof Error));
  const toggle = (id: string) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    if (next.length < 2 || next.length > 4) return;
    setUi({ compareIds: next });
  };
  return (
    <div>
      <div class="page-head">
        <div class="grow">
          <h1>Compare scenarios</h1>
          <p class="muted">Pick 2 to 4. Click any number to see its math.</p>
        </div>
        <button class="btn" onClick={() => navigate(`/print/compare/${ids.join(',')}`)}>
          Print comparison
        </button>
      </div>
      <div class="row" style="margin-bottom:14px">
        {ws.scenarios.map((s) => (
          <label key={s.id} class="row small" style="gap:4px;margin-right:10px">
            <input type="checkbox" checked={ids.includes(s.id)} onChange={() => toggle(s.id)} disabled={!ids.includes(s.id) && ids.length >= 4} />
            <span class="swatch" style={`background:${scenarioStyle(ws, s.id).color}`} />
            {s.name}
          </label>
        ))}
      </div>
      <CompareBody ws={ws} results={results} />
    </div>
  );
}

export const compareModule: ModuleManifest = {
  id: 'compare',
  title: 'Compare',
  icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  navOrder: 20,
  views: [{ id: 'view', title: 'Compare', component: Compare }],
};
