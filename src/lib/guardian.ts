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

interface GuardianPlugin {
  getStatus(): Promise<GuardianStatus>;
  setEnabled(o: { enabled: boolean }): Promise<void>;
  setCallProtection(o: { enabled: boolean }): Promise<void>;
  setAccessibilityScan(o: { enabled: boolean }): Promise<void>;
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
