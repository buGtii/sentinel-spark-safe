// Clipboard protection. When the app regains focus, peek at the clipboard
// (with user permission) and, if it contains a URL we haven't seen, offer to
// scan it before the user pastes it into another app.
//
// Privacy:
//  - Off by default; toggled from /privacy.
//  - We only read clipboard when the document is in the foreground.
//  - Non-URL text is ignored without being stored anywhere.

import { toast } from "sonner";
import { scoreUrl } from "./detector";

const FLAG = "guardian.clipboard.enabled";
const SEEN = "guardian.clipboard.seenHash";

export const isClipboardGuardEnabled = () =>
  typeof localStorage !== "undefined" && localStorage.getItem(FLAG) === "1";

export function setClipboardGuard(enabled: boolean) {
  localStorage.setItem(FLAG, enabled ? "1" : "0");
}

async function fingerprint(s: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].slice(0, 8)
      .map(b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return String(s.length);
  }
}

export function installClipboardGuard(onScan: (url: string) => void) {
  if (typeof window === "undefined") return () => {};

  const check = async () => {
    if (!isClipboardGuardEnabled()) return;
    if (document.visibilityState !== "visible") return;
    if (!navigator.clipboard?.readText) return;
    let text = "";
    try { text = await navigator.clipboard.readText(); } catch { return; }
    if (!text || text.length > 2048) return;
    const m = text.match(/\bhttps?:\/\/\S+/i);
    if (!m) return;
    const url = m[0];
    const fp = await fingerprint(url);
    if (localStorage.getItem(SEEN) === fp) return;
    localStorage.setItem(SEEN, fp);

    const r = scoreUrl(url);
    if (r.verdict === "safe") return;

    toast(`Clipboard contains a ${r.verdict} link`, {
      description: r.reasons[0] || "Scan before pasting elsewhere.",
      action: { label: "Scan", onClick: () => onScan(url) },
      duration: 8000,
    });
  };

  const onVis = () => { if (document.visibilityState === "visible") check(); };
  const onFocus = () => check();
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("focus", onFocus);
  return () => {
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("focus", onFocus);
  };
}
