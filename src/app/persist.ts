// Autosave to IndexedDB, and explicit Save / Open of a workspace file.
// File System Access API when the browser has it, download / upload otherwise.
import type { Workspace } from '../core/schema/types';
import { migrateWorkspace } from '../core/schema/migrate';
import { moduleMigrations } from '../modules/registry';

const DB = 'cto-workbench';
const STORE = 'kv';
const BLOBS = 'blobs';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      for (const s of [STORE, BLOBS]) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest, store = STORE): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function loadAutosave(): Promise<Workspace | null> {
  try {
    const raw = await idb<string | undefined>('readonly', (s) => s.get('workspace'));
    return raw ? migrateWorkspace(JSON.parse(raw), moduleMigrations()) : null;
  } catch {
    return null;
  }
}

export async function autosave(ws: Workspace): Promise<boolean> {
  try {
    await idb('readwrite', (s) => s.put(JSON.stringify(ws), 'workspace'));
    return true;
  } catch {
    return false;
  }
}

export async function clearAutosave(): Promise<void> {
  try {
    await idb('readwrite', (s) => s.delete('workspace'));
  } catch {
    /* nothing to clear */
  }
}

type FileHandle = { name: string; createWritable(): Promise<{ write(d: Blob | string): Promise<void>; close(): Promise<void> }>; getFile(): Promise<File> };
let handle: FileHandle | null = null;

const hasFsApi = () => typeof (window as any).showSaveFilePicker === 'function';

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function workspaceFileName(ws: Workspace) {
  return `${(ws.name || 'workspace').replace(/[^\w.-]+/g, '-').toLowerCase()}.workspace.json`;
}

export async function saveWorkspace(ws: Workspace, saveAs = false): Promise<string | null> {
  const text = JSON.stringify(ws, null, 1);
  if (hasFsApi()) {
    try {
      if (!handle || saveAs) {
        handle = await (window as any).showSaveFilePicker({ suggestedName: workspaceFileName(ws), types: [{ description: 'Workspace', accept: { 'application/json': ['.json'] } }] });
      }
      const w = await handle!.createWritable();
      await w.write(text);
      await w.close();
      return handle!.name;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
      // fall through to download
    }
  }
  const name = workspaceFileName(ws);
  downloadBlob(new Blob([text], { type: 'application/json' }), name);
  return name;
}

export function parseWorkspaceText(text: string): Workspace {
  return migrateWorkspace(JSON.parse(text), moduleMigrations());
}

export async function openWorkspaceFile(): Promise<{ ws: Workspace; name: string } | null> {
  if (typeof (window as any).showOpenFilePicker === 'function') {
    try {
      const [h] = await (window as any).showOpenFilePicker({ types: [{ description: 'Workspace', accept: { 'application/json': ['.json'] } }] });
      const f = await h.getFile();
      const ws = parseWorkspaceText(await f.text());
      handle = h;
      return { ws, name: f.name };
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
      if (e instanceof SyntaxError || (e as Error).name === 'MigrationError') throw e;
    }
  }
  const f = await pickFile('.json,application/json');
  if (!f) return null;
  handle = null;
  return { ws: parseWorkspaceText(await f.text()), name: f.name };
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    };
    document.body.appendChild(input);
    input.click();
  });
}

export function forgetFileHandle() {
  handle = null;
}

// Large binary files (OEM decks) live outside the workspace document, in this
// browser only. A memory copy covers browsers that block IndexedDB.
const memBlobs = new Map<string, Uint8Array>();

export async function putBlob(key: string, data: Uint8Array): Promise<boolean> {
  memBlobs.set(key, data);
  try {
    await idb('readwrite', (s) => s.put(data, key), BLOBS);
    return true;
  } catch {
    return false;
  }
}

export async function getBlob(key: string): Promise<Uint8Array | null> {
  try {
    const v = await idb<Uint8Array | ArrayBuffer | undefined>('readonly', (s) => s.get(key), BLOBS);
    if (v) return v instanceof Uint8Array ? v : new Uint8Array(v);
  } catch {
    /* fall back to memory */
  }
  return memBlobs.get(key) ?? null;
}

export async function deleteBlob(key: string): Promise<void> {
  memBlobs.delete(key);
  try {
    await idb('readwrite', (s) => s.delete(key), BLOBS);
  } catch {
    /* nothing to delete */
  }
}
