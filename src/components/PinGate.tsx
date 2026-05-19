import { useEffect, useRef, useState } from "react";
import { Pin } from "@/lib/pin";
import { ShieldAlert, Lock } from "lucide-react";
import { recordIntruderEvent, registerDevice } from "@/lib/antitheft";
import { toast } from "sonner";

/**
 * PinGate
 *
 * Blocks the app behind a numeric PIN when the user has enabled it. After
 * `failedThreshold()` wrong attempts in a row, it silently captures a front-
 * camera selfie (on Android) and writes an intruder_events row that is
 * realtime-synced to any paired device.
 */
export function PinGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(!Pin.isEnabled());
  const [pin, setPin] = useState("");
  const [fails, setFails] = useState(0);
  const captured = useRef(false);

  useEffect(() => {
    if (!Pin.isEnabled()) setUnlocked(true);
  }, []);

  if (unlocked) return <>{children}</>;

  async function tryUnlock() {
    if (await Pin.verify(pin)) {
      setUnlocked(true);
      setFails(0);
      setPin("");
      captured.current = false;
      return;
    }
    const next = fails + 1;
    setFails(next);
    setPin("");
    if (next >= Pin.failedThreshold() && !captured.current) {
      captured.current = true;
      try {
        const deviceId = await registerDevice();
        let lat: number | undefined, lng: number | undefined;
        try {
          const pos = await new Promise<GeolocationPosition>((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000 }));
          lat = pos.coords.latitude; lng = pos.coords.longitude;
        } catch {}
        await recordIntruderEvent({ deviceId, failedAttempts: next, lat, lng });
        toast.error("Intruder alert sent to paired device", { duration: 5000 });
      } catch (e: any) {
        console.warn("intruder alert failed", e);
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col items-center justify-center p-6 gap-6">
      <div className="h-16 w-16 rounded-2xl gradient-cyber grid place-items-center glow">
        <Lock className="h-8 w-8 text-background" />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-bold">Enter CyberSmart PIN</h2>
        <p className="text-sm text-muted-foreground mt-1">Required to unlock the app</p>
      </div>
      <input
        type="password"
        inputMode="numeric"
        autoFocus
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
        onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
        className="w-48 text-center text-2xl tracking-[0.5em] bg-secondary/60 rounded-xl py-3 outline-none border border-primary/30 focus:border-primary"
        placeholder="••••"
      />
      <button onClick={tryUnlock}
        className="px-6 py-2 rounded-xl gradient-cyber text-background font-semibold">
        Unlock
      </button>
      {fails > 0 && (
        <div className="flex items-center gap-2 text-sm text-warning">
          <ShieldAlert className="h-4 w-4" />
          {fails} failed attempt{fails > 1 ? "s" : ""} — intruder selfie at {Pin.failedThreshold()}
        </div>
      )}
    </div>
  );
}
