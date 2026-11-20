import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AssumptionStatus } from '../core/schema/types';

export function Badge({ status, title }: { status: AssumptionStatus | string; title?: string }) {
  return (
    <span class={`badge ${status}`} title={title}>
      {status}
    </span>
  );
}

export function ConflictFlag({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  return (
    <span class="conflict-flag" title={`Depends on Conflict: ${ids.join(', ')}`} aria-label={`Depends on Conflict ${ids.join(', ')}`}>
      !
    </span>
  );
}

export function Modal({ title, onClose, children, wide, actions }: { title: string; onClose: () => void; children: ComponentChildren; wide?: boolean; actions?: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <div class="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div class={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div class="modal-head">
          <h2>{title}</h2>
          {actions}
          <button class="btn small" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ComponentChildren; hint?: string }) {
  return (
    <label class="field">
      <span>{label}</span>
      {children}
      {hint && <span class="small muted">{hint}</span>}
    </label>
  );
}

export function TextInput({ value, onChange, placeholder, disabled, list, ...aria }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; list?: string; 'aria-label'?: string }) {
  return <input class="text" value={value} placeholder={placeholder} disabled={disabled} list={list} aria-label={aria['aria-label']} onInput={(e) => onChange((e.target as HTMLInputElement).value)} />;
}

/** Number input that keeps the raw text while typing and reports a number or null. */
export function NumberInput({ value, onChange, placeholder, step, cls = 'text' }: { value: number | null | undefined; onChange: (v: number | null) => void; placeholder?: string; step?: number; cls?: string }) {
  const [text, setText] = useState(value == null || !Number.isFinite(value) ? '' : String(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      setText(value == null || !Number.isFinite(value) ? '' : String(value));
      last.current = value;
    }
  }, [value]);
  return (
    <input
      class={cls}
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      step={step}
      onInput={(e) => {
        const t = (e.target as HTMLInputElement).value;
        setText(t);
        const s = t.replace(/[$,\s]/g, '');
        const n = s === '' ? null : Number(s);
        if (n === null || Number.isFinite(n)) {
          last.current = n;
          onChange(n);
        }
      }}
    />
  );
}

export function Select<T extends string>({ value, options, onChange, labels, allowEmpty, cls = 'text' }: { value: T | '' | undefined; options: readonly T[]; onChange: (v: T | '') => void; labels?: Record<string, string>; allowEmpty?: string; cls?: string }) {
  return (
    <select class={cls} value={value ?? ''} onChange={(e) => onChange((e.target as HTMLSelectElement).value as T)}>
      {allowEmpty != null && <option value="">{allowEmpty}</option>}
      {options.map((o) => (
        <option value={o} key={o}>
          {labels?.[o] ?? o}
        </option>
      ))}
    </select>
  );
}

export function Seg<T extends string>({ value, options, onChange, labels }: { value: T; options: readonly T[]; onChange: (v: T) => void; labels?: Record<string, string> }) {
  return (
    <div class="seg" role="group">
      {options.map((o) => (
        <button key={o} class={o === value ? 'on' : ''} aria-pressed={o === value} onClick={() => onChange(o)}>
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, tabs, onChange }: { value: T; tabs: { id: T; title: string }[]; onChange: (v: T) => void }) {
  return (
    <div class="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={t.id === value} class={t.id === value ? 'active' : ''} onClick={() => onChange(t.id)}>
          {t.title}
        </button>
      ))}
    </div>
  );
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let setToastFn: ((s: string | null) => void) | null = null;
export function toast(msg: string) {
  setToastFn?.(msg);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setToastFn?.(null), 2600);
}
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  setToastFn = setMsg;
  return msg ? (
    <div class="toast" role="status">
      {msg}
    </div>
  ) : null;
}

export function Empty({ children }: { children: ComponentChildren }) {
  return <div class="empty">{children}</div>;
}
