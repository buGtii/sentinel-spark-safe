import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type GuardianVerdict = "safe" | "suspicious" | "danger";

export interface GuardianStatus {
  platform: string;
  notificationAccess: boolean;
  accessibilityEnabled: boolean;
  canDrawOverlays: boolean;
  guardianEnabled: boolean;
  callProtectionEnabled: boolean;
  phishingUiDetection: boolean;
  alertThreshold?: number;
}

export interface GuardianAlert {
  type: "notification" | "call" | "phishing_ui";
  source?: string;
  package?: string;
  brand?: string;
  number?: string;
  score: number;
  verdict: GuardianVerdict;
  urls?: string[];
  reasons?: string[];
  at: number;
}

export interface UrlVerdict {
  score: number;
  level: GuardianVerdict;
  host: string | null;
  reasons: string[];
}

interface GuardianPlugin {
  getStatus(): Promise<GuardianStatus>;
  setEnabled(o: { enabled: boolean }): Promise<void>;
  setCallProtection(o: { enabled: boolean }): Promise<void>;
  setAccessibilityScan(o: { enabled: boolean }): Promise<void>;
  setAlertThreshold(o: { threshold: number }): Promise<void>;
  getThreatLog(): Promise<{ entries: GuardianAlert[] }>;
  clearThreatLog(): Promise<void>;
  scanUrl(o: { url: string }): Promise<UrlVerdict>;
  openNotificationAccessSettings(): Promise<void>;
  openAccessibilitySettings(): Promise<void>;
  openOverlaySettings(): Promise<void>;
  addListener(
    eventName: "guardianAlert",
    cb: (a: GuardianAlert) => void
  ): Promise<PluginListenerHandle>;
}

const native = registerPlugin<GuardianPlugin>("Guardian");

export const guardianAvailable = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

const webFallback: GuardianStatus = {
  platform: "web",
  notificationAccess: false,
  accessibilityEnabled: false,
  canDrawOverlays: false,
  guardianEnabled: false,
  callProtectionEnabled: false,
  phishingUiDetection: false,
  alertThreshold: 35,
};

export async function getGuardianStatus(): Promise<GuardianStatus> {
  if (!guardianAvailable()) return webFallback;
  try { return await native.getStatus(); } catch { return webFallback; }
}

export async function setGuardianEnabled(enabled: boolean) {
  if (!guardianAvailable()) return;
  await native.setEnabled({ enabled });
}
export async function setCallProtection(enabled: boolean) {
  if (!guardianAvailable()) return;
  await native.setCallProtection({ enabled });
}
export async function setPhishingUiDetection(enabled: boolean) {
  if (!guardianAvailable()) return;
  await native.setAccessibilityScan({ enabled });
}
export async function setAlertThreshold(threshold: number) {
  if (!guardianAvailable()) return;
  await native.setAlertThreshold({ threshold });
}
export async function getThreatLog(): Promise<GuardianAlert[]> {
  if (!guardianAvailable()) return [];
  try {
    const r = await native.getThreatLog();
    return (r?.entries ?? []).slice().reverse();
  } catch { return []; }
}
export async function clearThreatLog() {
  if (!guardianAvailable()) return;
  await native.clearThreatLog();
}
export async function scanUrlNative(url: string): Promise<UrlVerdict | null> {
  if (!guardianAvailable()) return null;
  try { return await native.scanUrl({ url }); } catch { return null; }
}
export async function openNotificationAccess() {
  if (guardianAvailable()) await native.openNotificationAccessSettings();
}
export async function openAccessibility() {
  if (guardianAvailable()) await native.openAccessibilitySettings();
}
export async function openOverlay() {
  if (guardianAvailable()) await native.openOverlaySettings();
}

export function onGuardianAlert(cb: (a: GuardianAlert) => void) {
  if (!guardianAvailable()) return () => {};
  let handle: PluginListenerHandle | null = null;
  native.addListener("guardianAlert", cb).then((h) => (handle = h));
  return () => { handle?.remove(); };
}
