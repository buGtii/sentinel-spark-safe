import { useEffect, useState } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { supabase } from "@/integrations/supabase/client";
import {
  registerDevice, listMyDevices, createPairingCode, claimPairingCode,
  listPairedDevices, listIntruderEvents, signedSelfieUrl,
  setStolenMode, startTracking, stopTracking, recordIntruderEvent,
} from "@/lib/antitheft";
import { Pin } from "@/lib/pin";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Shield, ShieldAlert, MapPin, Smartphone, QrCode, Link2,
  KeyRound, Camera, Radar, Trash2, RefreshCw,
} from "lucide-react";

export default function AntiTheft() {
  const [myDeviceId, setMyDeviceId] = useState<string | null>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [paired, setPaired] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [claimInput, setClaimInput] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [threshold, setThreshold] = useState(Pin.failedThreshold());
  const [pinEnabled, setPinEnabled] = useState(Pin.isEnabled());
  const [stolen, setStolen] = useState(false);

  async function refresh() {
    const id = await registerDevice();
    setMyDeviceId(id);
    const [all, p, ev] = await Promise.all([
      listMyDevices(), listPairedDevices(id), listIntruderEvents(20),
    ]);
    setDevices(all);
    setPaired(p);
    setEvents(ev);
    const me = all.find((d) => d.id === id);
    setStolen(!!me?.stolen_mode);
  }

  useEffect(() => { refresh().catch((e) => toast.error(e.message)); }, []);

  // Realtime: new intruder events from any device on this account
  useEffect(() => {
    const ch = supabase
      .channel("intruder-feed")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "intruder_events" },
        (payload) => {
          setEvents((prev) => [payload.new as any, ...prev].slice(0, 20));
          if ((payload.new as any).device_id !== myDeviceId) {
            toast.error("⚠ Intruder alert on a paired device", { duration: 8000 });
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [myDeviceId]);

  async function genCode() {
    if (!myDeviceId) return;
    const p = await createPairingCode(myDeviceId);
    setCode(p.code);
    setQrDataUrl(await QRCode.toDataURL(`cybersmart-pair:${p.code}`, { width: 220, margin: 1 }));
    toast.success(`Pairing code ${p.code} — valid 10 min`);
  }

  async function claim() {
    if (!myDeviceId) return;
    try {
      const raw = claimInput.replace(/^cybersmart-pair:/, "").trim();
      await claimPairingCode(raw, myDeviceId);
      toast.success("Devices paired");
      setClaimInput("");
      refresh();
    } catch (e: any) { toast.error(e.message); }
  }

  async function scanQrFromImage(file: File) {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await new Promise((r) => (img.onload = r));
    const cv = document.createElement("canvas");
    cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext("2d")!;
    cx.drawImage(img, 0, 0);
    const data = cx.getImageData(0, 0, cv.width, cv.height);
    const res = jsQR(data.data, cv.width, cv.height);
    if (res?.data) setClaimInput(res.data);
    else toast.error("No QR code detected");
  }

  async function savePin() {
    try {
      await Pin.setPin(pinInput);
      setPinEnabled(true);
      setPinInput("");
      toast.success("PIN saved. Will be required on next launch.");
    } catch (e: any) { toast.error(e.message); }
  }

  async function toggleStolen(v: boolean) {
    if (!myDeviceId) return;
    setStolen(v);
    await setStolenMode(myDeviceId, v);
    if (v) await startTracking(true); else await stopTracking();
    toast.success(v ? "Stolen Mode active" : "Stolen Mode off");
  }

  async function testIntruder() {
    if (!myDeviceId) return;
    try {
      await recordIntruderEvent({ deviceId: myDeviceId, failedAttempts: Pin.failedThreshold() });
      toast.success("Test intruder event recorded");
      refresh();
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-6 pb-6">
      <header className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl gradient-cyber grid place-items-center glow">
          <Shield className="h-5 w-5 text-background" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gradient-cyber">Anti-Theft</h1>
          <p className="text-xs text-muted-foreground">Pair, track, and catch intruders</p>
        </div>
      </header>

      {/* This device */}
      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-2 font-semibold"><Smartphone className="h-4 w-4" /> This device</div>
        {devices.filter(d => d.id === myDeviceId).map(d => (
          <div key={d.id} className="text-sm space-y-1">
            <div>{d.name}</div>
            <div className="text-xs text-muted-foreground font-mono">{d.device_uid.slice(0, 12)}…</div>
            <div className="text-xs text-muted-foreground">Platform: {d.platform}</div>
          </div>
        ))}
      </Card>

      {/* PIN gate */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4" /> In-app PIN</div>
        <p className="text-xs text-muted-foreground">
          A wrong PIN entered {threshold}× silently captures a front-camera selfie and
          alerts your paired device. Camera and location are only used after you grant
          permission, while CyberSmart is on screen.
        </p>
        {pinEnabled ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-success">PIN protection enabled</span>
            <Button variant="ghost" size="sm" onClick={() => { Pin.disable(); setPinEnabled(false); }}>
              Disable
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              type="password" inputMode="numeric" placeholder="4–8 digit PIN"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 8))}
            />
            <Button onClick={savePin}>Set PIN</Button>
          </div>
        )}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Selfie at attempt #</span>
          <Input type="number" min={2} max={10} value={threshold}
            onChange={(e) => { const n = Number(e.target.value); setThreshold(n); Pin.setThreshold(n); }}
            className="w-16 h-7 text-xs" />
        </div>
        <Button variant="outline" size="sm" onClick={testIntruder}>
          <Camera className="h-4 w-4 mr-1" /> Test intruder capture now
        </Button>
      </Card>

      {/* Pairing */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 font-semibold"><Link2 className="h-4 w-4" /> Pair a second device</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">On this device — generate a code</div>
            <Button onClick={genCode} className="w-full"><QrCode className="h-4 w-4 mr-1" /> Generate QR + code</Button>
            {code && (
              <div className="text-center space-y-2">
                {qrDataUrl && <img src={qrDataUrl} alt="pair qr" className="mx-auto rounded-lg bg-white p-2" />}
                <div className="font-mono text-2xl tracking-widest">{code}</div>
                <div className="text-[10px] text-muted-foreground">Expires in 10 min</div>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">On the second device — enter or scan</div>
            <Input placeholder="6-char code" value={claimInput}
              onChange={(e) => setClaimInput(e.target.value.toUpperCase())} />
            <div className="flex gap-2">
              <Button onClick={claim} className="flex-1">Pair</Button>
              <label className="flex-1">
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => e.target.files?.[0] && scanQrFromImage(e.target.files[0])} />
                <span className="block text-center text-xs py-2 rounded-md border border-primary/30 cursor-pointer">
                  Scan QR
                </span>
              </label>
            </div>
          </div>
        </div>

        {paired.length > 0 && (
          <div className="pt-2 border-t border-border/40 space-y-1">
            <div className="text-xs text-muted-foreground">Paired devices ({paired.length})</div>
            {paired.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-sm">
                <span>{d.name}</span>
                <span className="text-xs text-muted-foreground">{d.stolen_mode ? "STOLEN" : "ok"}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Stolen mode */}
      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold"><Radar className="h-4 w-4" /> Stolen Mode</div>
          <Switch checked={stolen} onCheckedChange={toggleStolen} />
        </div>
        <p className="text-xs text-muted-foreground">
          Increases location update frequency to every 30 seconds and shows a persistent
          tracking notification. Disable any time.
        </p>
      </Card>

      {/* Intruder feed */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldAlert className="h-4 w-4" /> Intruder feed
          </div>
          <Button variant="ghost" size="sm" onClick={refresh}><RefreshCw className="h-4 w-4" /></Button>
        </div>
        {events.length === 0 && (
          <div className="text-xs text-muted-foreground">No intruder events yet. You're safe.</div>
        )}
        <div className="space-y-3">
          {events.map((ev) => <IntruderRow key={ev.id} ev={ev} />)}
        </div>
      </Card>
    </div>
  );
}

function IntruderRow({ ev }: { ev: any }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (ev.image_path) signedSelfieUrl(ev.image_path).then(setUrl);
  }, [ev.image_path]);
  return (
    <div className="flex gap-3 p-2 rounded-lg bg-secondary/40">
      {url ? (
        <img src={url} className="h-16 w-16 rounded-lg object-cover" alt="intruder" />
      ) : (
        <div className="h-16 w-16 rounded-lg bg-muted grid place-items-center text-[10px] text-muted-foreground">
          {ev.image_path ? "loading…" : "no img"}
        </div>
      )}
      <div className="flex-1 text-xs space-y-0.5">
        <div className="font-semibold text-warning">⚠ Intruder detected</div>
        <div className="text-muted-foreground">
          {new Date(ev.captured_at).toLocaleString()} · {ev.failed_attempts} attempt{ev.failed_attempts > 1 ? "s" : ""}
        </div>
        {ev.lat != null && ev.lng != null && (
          <a className="text-primary inline-flex items-center gap-1"
             href={`https://www.google.com/maps?q=${ev.lat},${ev.lng}`}
             target="_blank" rel="noreferrer">
            <MapPin className="h-3 w-3" /> {ev.lat.toFixed(4)}, {ev.lng.toFixed(4)}
          </a>
        )}
        <div className="text-muted-foreground">
          {ev.device_info?.manufacturer} {ev.device_info?.model}
        </div>
      </div>
    </div>
  );
}
