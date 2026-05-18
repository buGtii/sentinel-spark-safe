// Versioned, granular consent storage. Bump CONSENT_VERSION when the set of
// capabilities or privacy-impact changes — users will then be re-prompted.

export const CONSENT_VERSION = 2;
const KEY = "guardian.consent.v" + CONSENT_VERSION;

export type ConsentCapability =
  | "tapGuard"            // intercept every outbound link
  | "clipboardGuard"      // peek clipboard on focus
  | "notificationListener" // Android notification scan
  | "phishingUi"          // Android accessibility scan
  | "callProtection";     // Android call hint

export interface ConsentRecord {
  version: number;
  acceptedAt: number;
  capabilities: Partial<Record<ConsentCapability, boolean>>;
}

export function readConsent(): ConsentRecord | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as ConsentRecord;
    if (c?.version !== CONSENT_VERSION) return null;
    return c;
  } catch { return null; }
}

export function writeConsent(caps: Partial<Record<ConsentCapability, boolean>>) {
  const rec: ConsentRecord = {
    version: CONSENT_VERSION,
    acceptedAt: Date.now(),
    capabilities: caps,
  };
  localStorage.setItem(KEY, JSON.stringify(rec));
  return rec;
}

export function revokeConsent() {
  localStorage.removeItem(KEY);
}

export function hasConsentFor(cap: ConsentCapability): boolean {
  return !!readConsent()?.capabilities?.[cap];
}
