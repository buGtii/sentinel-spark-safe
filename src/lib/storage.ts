// Cross-platform key/value storage. Uses Capacitor Preferences on native,
// falls back to localStorage on web. Mirrors writes to localStorage so
// synchronous reads (getCfg/getPrefs) keep working everywhere.
import { Preferences } from "@capacitor/preferences";
import { Capacitor } from "@capacitor/core";

const isNative = () => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

export async function kvSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {}
  if (isNative()) {
    try { await Preferences.set({ key, value }); } catch {}
  }
}

export async function kvGet(key: string): Promise<string | null> {
  if (isNative()) {
    try {
      const { value } = await Preferences.get({ key });
      if (value != null) {
        try { localStorage.setItem(key, value); } catch {}
        return value;
      }
    } catch {}
  }
  try { return localStorage.getItem(key); } catch { return null; }
}

// Hydrate localStorage from native preferences once on app start so the
// synchronous getters return the persisted value on the very first render.
export async function hydrateFromNative(keys: string[]) {
  if (!isNative()) return;
  for (const k of keys) {
    try {
      const { value } = await Preferences.get({ key: k });
      if (value != null) localStorage.setItem(k, value);
    } catch {}
  }
}
