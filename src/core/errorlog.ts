/** Local error log (brief §11): last N errors kept in memory + localStorage for later inspection. */
export interface ErrorEntry {
  time: string;
  message: string;
  stack?: string;
}

const KEY = 'tanky.errors';
const MAX = 30;
const entries: ErrorEntry[] = [];

export function logError(err: unknown): void {
  const e = err instanceof Error ? err : new Error(String(err));
  entries.push({ time: new Date().toISOString(), message: e.message, stack: e.stack });
  while (entries.length > MAX) entries.shift();
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* ignore */
  }
  console.error('[tanky]', e);
}

export function getErrors(): readonly ErrorEntry[] {
  return entries;
}

export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (ev) => logError(ev.error ?? ev.message));
  window.addEventListener('unhandledrejection', (ev) => logError(ev.reason));
}
