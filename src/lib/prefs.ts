import { kvSet } from "@/lib/storage";

const KEY = "cybersmart.prefs";

export type ScanPrefs = {
  useVirusTotal: boolean;
  useGemini: boolean;
};

const DEFAULTS: ScanPrefs = { useVirusTotal: true, useGemini: true };

export const PREFS_KEY = KEY;

export function getPrefs(): ScanPrefs {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return DEFAULTS; }
}

export function setPrefs(p: ScanPrefs) {
  void kvSet(KEY, JSON.stringify(p));
}
