import { Capacitor, registerPlugin } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export interface DeviceInfo {
  deviceUid: string;
  model: string;
  manufacturer: string;
  androidVersion: string;
  sdkInt: number;
}

interface AntiTheftPlugin {
  getDeviceInfo(): Promise<DeviceInfo>;
  captureIntruderSelfie(): Promise<{ base64: string; mimeType: string; width: number; height: number }>;
  startLocationService(opts: { stolenMode: boolean }): Promise<void>;
  stopLocationService(): Promise<void>;
}

const Native = registerPlugin<AntiTheftPlugin>("AntiTheft");

const LS_DEVICE_UID = "cybersmart.antitheft.deviceUid";

/** Get a stable per-install device UID. Native on Android, random UUID on web. */
export async function getDeviceUid(): Promise<DeviceInfo> {
  if (Capacitor.getPlatform() === "android") {
    try { return await Native.getDeviceInfo(); } catch { /* fall through */ }
  }
  let uid = localStorage.getItem(LS_DEVICE_UID);
  if (!uid) { uid = crypto.randomUUID(); localStorage.setItem(LS_DEVICE_UID, uid); }
  return {
    deviceUid: uid,
    model: navigator.userAgent.slice(0, 60),
    manufacturer: "web",
    androidVersion: "n/a",
    sdkInt: 0,
  };
}

/** Register / refresh this device row in Supabase. Returns devices.id. */
export async function registerDevice(name?: string): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");
  const info = await getDeviceUid();
  const platform = Capacitor.getPlatform();
  const { data, error } = await supabase
    .from("devices")
    .upsert(
      {
        user_id: u.user.id,
        device_uid: info.deviceUid,
        name: name ?? `${info.manufacturer} ${info.model}`.trim(),
        platform,
        last_seen: new Date().toISOString(),
      },
      { onConflict: "user_id,device_uid" }
    )
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function listMyDevices() {
  const { data, error } = await supabase
    .from("devices")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

/** Generate a 6-character pairing code on the initiator device. */
export async function createPairingCode(initiatorDeviceId: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");
  const code = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32])
    .join("");
  const { data, error } = await supabase
    .from("device_pairings")
    .insert({
      user_id: u.user.id,
      code,
      initiator_device: initiatorDeviceId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** Claim a code on the second device, creating the bidirectional link. */
export async function claimPairingCode(code: string, claimerDeviceId: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");

  const { data: pairing, error: pErr } = await supabase
    .from("device_pairings")
    .select("*")
    .eq("code", code.toUpperCase().trim())
    .eq("user_id", u.user.id)
    .is("claimed_by_device", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (pErr) throw pErr;
  if (!pairing) throw new Error("Invalid or expired pairing code");
  if (pairing.initiator_device === claimerDeviceId)
    throw new Error("Cannot pair a device with itself");

  await supabase
    .from("device_pairings")
    .update({ claimed_by_device: claimerDeviceId, claimed_at: new Date().toISOString() })
    .eq("id", pairing.id);

  const a = pairing.initiator_device < claimerDeviceId ? pairing.initiator_device : claimerDeviceId;
  const b = pairing.initiator_device < claimerDeviceId ? claimerDeviceId : pairing.initiator_device;
  const { data: link, error: lErr } = await supabase
    .from("device_links")
    .upsert({ user_id: u.user.id, device_a: a, device_b: b }, { onConflict: "device_a,device_b" })
    .select("*")
    .single();
  if (lErr) throw lErr;
  return link;
}

export async function listPairedDevices(myDeviceId: string) {
  const { data: links } = await supabase
    .from("device_links")
    .select("*")
    .or(`device_a.eq.${myDeviceId},device_b.eq.${myDeviceId}`);
  const ids = (links ?? []).map((l) => (l.device_a === myDeviceId ? l.device_b : l.device_a));
  if (!ids.length) return [];
  const { data } = await supabase.from("devices").select("*").in("id", ids);
  return data ?? [];
}

/** Set stolen-mode flag and restart the foreground location service. */
export async function setStolenMode(deviceId: string, stolen: boolean) {
  await supabase.from("devices").update({ stolen_mode: stolen }).eq("id", deviceId);
  if (Capacitor.getPlatform() === "android") {
    try { await Native.startLocationService({ stolenMode: stolen }); } catch {}
  }
}

export async function startTracking(stolen = false) {
  if (Capacitor.getPlatform() !== "android") return;
  try { await Native.startLocationService({ stolenMode: stolen }); } catch {}
}
export async function stopTracking() {
  if (Capacitor.getPlatform() !== "android") return;
  try { await Native.stopLocationService(); } catch {}
}

export async function pushLocation(deviceId: string, lat: number, lng: number, accuracy?: number) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from("locations").insert({
    user_id: u.user.id,
    device_id: deviceId,
    lat,
    lng,
    accuracy: accuracy ?? null,
  });
}

/**
 * Capture an intruder selfie (Android only). Uploads JPEG to storage and
 * inserts an intruder_events row.
 */
export async function recordIntruderEvent(opts: {
  deviceId: string;
  failedAttempts: number;
  lat?: number;
  lng?: number;
}) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");

  let imagePath: string | null = null;
  if (Capacitor.getPlatform() === "android") {
    try {
      const shot = await Native.captureIntruderSelfie();
      const bin = Uint8Array.from(atob(shot.base64), (c) => c.charCodeAt(0));
      imagePath = `${u.user.id}/${opts.deviceId}/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("intruder-selfies")
        .upload(imagePath, bin, { contentType: "image/jpeg", upsert: false });
      if (upErr) { console.warn("upload failed", upErr); imagePath = null; }
    } catch (e) {
      console.warn("selfie capture failed", e);
    }
  }

  const info = await getDeviceUid();
  const { data, error } = await supabase
    .from("intruder_events")
    .insert({
      user_id: u.user.id,
      device_id: opts.deviceId,
      image_path: imagePath,
      failed_attempts: opts.failedAttempts,
      lat: opts.lat ?? null,
      lng: opts.lng ?? null,
      device_info: {
        model: info.model,
        manufacturer: info.manufacturer,
        androidVersion: info.androidVersion,
        userAgent: navigator.userAgent,
      },
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listIntruderEvents(limit = 50) {
  const { data, error } = await supabase
    .from("intruder_events")
    .select("*")
    .order("captured_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function signedSelfieUrl(path: string) {
  const { data } = await supabase.storage
    .from("intruder-selfies")
    .createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}
