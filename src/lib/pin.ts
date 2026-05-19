/**
 * In-app PIN gate state. PIN is hashed with SHA-256 + a per-install salt and
 * stored in localStorage. This is NOT a substitute for the system lock; it's
 * a second factor inside CyberSmart that lets us legally capture an intruder
 * selfie on failed attempts.
 */
const LS_HASH = "cybersmart.pin.hash";
const LS_SALT = "cybersmart.pin.salt";
const LS_ENABLED = "cybersmart.pin.enabled";
const LS_THRESHOLD = "cybersmart.pin.threshold";

function getSalt(): string {
  let s = localStorage.getItem(LS_SALT);
  if (!s) {
    s = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(LS_SALT, s);
  }
  return s;
}

async function hash(pin: string): Promise<string> {
  const data = new TextEncoder().encode(getSalt() + ":" + pin);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const Pin = {
  isEnabled(): boolean { return localStorage.getItem(LS_ENABLED) === "1"; },
  hasPin(): boolean { return !!localStorage.getItem(LS_HASH); },
  failedThreshold(): number { return Number(localStorage.getItem(LS_THRESHOLD) ?? "3"); },
  setThreshold(n: number) { localStorage.setItem(LS_THRESHOLD, String(Math.max(2, Math.min(10, n)))); },

  async setPin(pin: string) {
    if (!/^\d{4,8}$/.test(pin)) throw new Error("PIN must be 4–8 digits");
    localStorage.setItem(LS_HASH, await hash(pin));
    localStorage.setItem(LS_ENABLED, "1");
  },
  async verify(pin: string): Promise<boolean> {
    const stored = localStorage.getItem(LS_HASH);
    if (!stored) return true;
    return (await hash(pin)) === stored;
  },
  disable() {
    localStorage.removeItem(LS_HASH);
    localStorage.removeItem(LS_ENABLED);
  },
};
