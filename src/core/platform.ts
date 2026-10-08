/**
 * Thin wrapper over Capacitor plugins so the rest of the game never imports them directly and the
 * browser/dev build keeps working without native code.
 */
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { SplashScreen } from '@capacitor/splash-screen';

export const isNative = (): boolean => Capacitor.isNativePlatform();

let hapticsEnabled = true;
export function setHapticsEnabled(v: boolean): void {
  hapticsEnabled = v;
}

export type HapticLevel = 'light' | 'medium' | 'heavy';

export function haptic(level: HapticLevel): void {
  if (!hapticsEnabled) return;
  if (isNative()) {
    const style = level === 'light' ? ImpactStyle.Light : level === 'medium' ? ImpactStyle.Medium : ImpactStyle.Heavy;
    void Haptics.impact({ style }).catch(() => undefined);
  } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(level === 'light' ? 8 : level === 'medium' ? 18 : 35);
  }
}

/** Calls `onPause` when the app goes to background (Capacitor App event or page visibility). */
export function onAppPause(onPause: () => void, onResume: () => void): () => void {
  const vis = (): void => (document.hidden ? onPause() : onResume());
  document.addEventListener('visibilitychange', vis);
  const subs: Promise<{ remove: () => Promise<void> }>[] = [];
  if (isNative()) {
    subs.push(App.addListener('pause', onPause));
    subs.push(App.addListener('resume', onResume));
  }
  return () => {
    document.removeEventListener('visibilitychange', vis);
    subs.forEach((p) => void p.then((s) => s.remove()));
  };
}

export async function hideSplash(): Promise<void> {
  if (isNative()) await SplashScreen.hide().catch(() => undefined);
}

/** Best-effort landscape lock + fullscreen for the browser build (native build locks via manifest). */
export async function requestLandscapeFullscreen(): Promise<void> {
  if (isNative()) return;
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await o.lock?.('landscape');
  } catch {
    /* not supported on desktop browsers */
  }
}
