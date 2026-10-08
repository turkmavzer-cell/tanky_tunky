/**
 * Key/value storage behind one module: Capacitor Preferences on device, localStorage fallback in
 * the browser/tests. Never let a storage failure crash the game.
 */
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { migrate, type SaveData } from './save';

const KEY = 'tanky.save';

async function readRaw(): Promise<string | null> {
  try {
    if (Capacitor.isNativePlatform()) return (await Preferences.get({ key: KEY })).value;
    return globalThis.localStorage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

async function writeRaw(value: string): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) await Preferences.set({ key: KEY, value });
    else globalThis.localStorage?.setItem(KEY, value);
  } catch {
    /* storage full or unavailable: keep playing */
  }
}

export async function loadSave(): Promise<SaveData> {
  const raw = await readRaw();
  if (!raw) return migrate(null);
  try {
    return migrate(JSON.parse(raw));
  } catch {
    return migrate(null);
  }
}

export async function writeSave(data: SaveData): Promise<void> {
  await writeRaw(JSON.stringify(data));
}
