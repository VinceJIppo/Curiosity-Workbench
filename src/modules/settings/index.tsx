import type { ModuleManifest } from '../../app/module';
import { update, useWorkspace } from '../../app/store';
import { fontFamilies, logoSvg } from 'virtual:brand';
import { ROLE_FAMILIES, type CoverageGroups } from '../../core/schema/types';
import { Field, NumberInput, TextInput } from '../../ui/components';
import { allModules } from '../registry';

function GroupPicker({ k, label }: { k: keyof CoverageGroups; label: string }) {
  const ws = useWorkspace();
  const cur = ws.settings.coverageGroups[k];
  return (
    <Field label={label}>
      <div class="row" style="gap:4px 12px">
        {ROLE_FAMILIES.map((r) => (
          <label key={r} class="small">
            <input
              type="checkbox"
              checked={cur.includes(r)}
              onChange={(e) => update((w) => (w.settings.coverageGroups[k] = (e.target as HTMLInputElement).checked ? [...cur, r] : cur.filter((x) => x !== r)), `Coverage group ${k}`)}
            />{' '}
            {r}
          </label>
        ))}
      </div>
    </Field>
  );
}

function Settings() {
  const ws = useWorkspace();
  const s = ws.settings;
  const set = (fn: (st: typeof s) => void, label: string, key: string) => update((w) => fn(w.settings), label, { coalesce: `set-${key}` });
  const head = fontFamilies.includes('Martina Plantijn');
  const ui = fontFamilies.includes('AF Atelier Sans');
  return (
    <div class="stack" style="max-width:900px">
      <div class="form-grid">
        <Field label="App display name">
          <TextInput value={s.displayName} onChange={(v) => set((x) => (x.displayName = v), 'Display name', 'dn')} />
        </Field>
        <Field label="Approval month (month 0), YYYY-MM">
          <TextInput value={s.approvalMonth} onChange={(v) => set((x) => (x.approvalMonth = v), 'Approval month', 'am')} />
        </Field>
        <Field label="Horizon (months, max 36)">
          <NumberInput value={s.horizonMonths} onChange={(v) => set((x) => (x.horizonMonths = Math.max(12, Math.min(36, Math.round(v ?? 36)))), 'Horizon', 'hz')} />
        </Field>
        <Field label="Default view (months)">
          <NumberInput value={s.viewMonths} onChange={(v) => set((x) => (x.viewMonths = Math.max(6, Math.min(x.horizonMonths, Math.round(v ?? 24)))), 'View months', 'vm')} />
        </Field>
        <Field label="Rerun a missed gate after (months)">
          <NumberInput value={s.gateRetryMonths} onChange={(v) => set((x) => (x.gateRetryMonths = Math.max(1, Math.round(v ?? 6))), 'Gate retry', 'gr')} />
        </Field>
        <Field label="Seller count anchor (binding key)" hint="Coverage uses this register value plus roster changes. Blank counts the roster.">
          <TextInput value={s.headcountAnchors.sellers ?? ''} onChange={(v) => set((x) => (x.headcountAnchors.sellers = v || undefined), 'Seller anchor', 'anchor')} />
        </Field>
      </div>
      <h3>Coverage groups</h3>
      <GroupPicker k="sellers" label="Sellers" />
      <GroupPicker k="specialists" label="Specialists" />
      <GroupPicker k="architects" label="Architects" />
      <h3>Brand</h3>
      <div class="callout small">
        Headlines: {head ? 'Martina Plantijn (embedded)' : 'Georgia (fallback). Martina Plantijn files were not found in assets/fonts at build time.'}
        <br />
        UI: {ui ? 'AF Atelier Sans (embedded)' : 'system sans (fallback). AF Atelier Sans files were not found in assets/fonts at build time.'}
        <br />
        Logo: {logoSvg ? 'redesign logo embedded from assets/brand.' : 'not embedded. Add assets/brand/redesign_logo_black.svg and rebuild.'}
      </div>
      <h3>Modules</h3>
      <table class="data">
        <tbody>
          {allModules().map((m) => (
            <tr key={m.id}>
              <td class="mono">{m.id}</td>
              <td>{m.title}</td>
              <td class="small muted">{m.views.map((v) => v.title).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Privacy</h3>
      <p class="small">
        This file runs fully offline. A Content-Security-Policy blocks every network connection (connect-src 'none'). There is no analytics or telemetry. Workspace data stays in this browser's storage and in files you save.
      </p>
    </div>
  );
}

export const settingsModule: ModuleManifest = {
  id: 'settings',
  title: 'Settings',
  icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  navOrder: 90,
  views: [{ id: 'general', title: 'Settings', component: Settings }],
};
