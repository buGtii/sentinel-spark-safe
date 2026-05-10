import { useState, useRef, useEffect, useCallback } from "react";
import { QrCode, Upload, Camera, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import jsQR from "jsqr";
import { toast } from "sonner";
import { runScan, persistScan } from "@/lib/scans";
import { VerdictBadge } from "@/components/VerdictBadge";

/** Try to decode a QR by scanning the image at multiple scales + with color inversion. */
function decodeFromImage(img: HTMLImageElement): string | null {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  // Try original size first, then downscale (helps very large photos), then upscale (small thumbnails).
  const maxSide = Math.max(img.width, img.height);
  const scales: number[] = [1];
  if (maxSide > 1600) scales.push(1600 / maxSide);
  if (maxSide > 2400) scales.push(1200 / maxSide);
  if (maxSide < 600) scales.push(800 / maxSide);

  for (const s of scales) {
    const w = Math.max(1, Math.round(img.width * s));
    const h = Math.max(1, Math.round(img.height * s));
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const a = jsQR(data.data, w, h, { inversionAttempts: "attemptBoth" });
    if (a?.data) return a.data;
  }
  return null;
}

export default function QRScan() {
  const [decoded, setDecoded] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [scanning, setScanning] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraFileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraOn(false);
    setScanning(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  async function analyzeUrl(url: string) {
    setDecoded(url);
    if (!/^https?:\/\//i.test(url)) {
      toast.message("Decoded non-URL payload", { description: url.slice(0, 120) });
      return;
    }
    try {
      setBusy(true);
      const r = await runScan("url", { url });
      setResult(r);
      await persistScan({ type: "url", target: url, verdict: r.verdict, risk_score: r.risk_score, details: { ...r, source: "qr" } });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function handleFile(file: File) {
    setResult(null); setDecoded(null);
    const img = new Image();
    img.src = URL.createObjectURL(file);
    try {
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    } catch { toast.error("Could not read image."); return; }
    const payload = decodeFromImage(img);
    URL.revokeObjectURL(img.src);
    if (!payload) {
      toast.error("No QR code detected. Try a clearer, closer photo with the QR centered and well-lit.");
      return;
    }
    await analyzeUrl(payload);
  }

  async function startCamera() {
    setResult(null); setDecoded(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      setScanning(true);
      // Wait for video element to mount
      requestAnimationFrame(() => {
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        v.setAttribute("playsinline", "true");
        v.play().catch(() => {});
        scanLoop();
      });
    } catch (e: any) {
      toast.error("Camera unavailable. Use 'Upload' instead.", { description: e?.message });
    }
  }

  function scanLoop() {
    const v = videoRef.current;
    if (!v || !streamRef.current) return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    const tick = () => {
      if (!streamRef.current || !videoRef.current) return;
      if (v.readyState >= 2 && v.videoWidth > 0) {
        const w = v.videoWidth, h = v.videoHeight;
        canvas.width = w; canvas.height = h;
        ctx.drawImage(v, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        const code = jsQR(data.data, w, h, { inversionAttempts: "attemptBoth" });
        if (code?.data) {
          stopCamera();
          analyzeUrl(code.data);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  return (
    <div className="space-y-4">
      <header>
        <div className="flex items-center gap-2 mb-1">
          <QrCode className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">QR Code Scanner</h2>
        </div>
        <p className="text-sm text-muted-foreground">Decode and analyze hidden URLs in QR codes for phishing or malware.</p>
      </header>

      {!cameraOn && (
        <div className="glass rounded-xl p-6 text-center space-y-3">
          <input ref={galleryRef} type="file" accept="image/*" hidden
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <input ref={cameraFileRef} type="file" accept="image/*" capture="environment" hidden
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <QrCode className="h-16 w-16 mx-auto text-primary opacity-50" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button onClick={startCamera} className="gradient-cyber text-background">
              <Camera className="h-4 w-4 mr-2" /> Live scan
            </Button>
            <Button onClick={() => galleryRef.current?.click()} variant="secondary">
              <ImageIcon className="h-4 w-4 mr-2" /> From gallery
            </Button>
            <Button onClick={() => cameraFileRef.current?.click()} variant="outline">
              <Upload className="h-4 w-4 mr-2" /> Take photo
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground font-mono">Decoded locally · URL scanned via AI + VirusTotal</p>
        </div>
      )}

      {cameraOn && (
        <div className="glass rounded-xl p-2 relative overflow-hidden">
          <video ref={videoRef} className="w-full rounded-lg bg-black aspect-[3/4] object-cover" muted playsInline />
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="border-2 border-primary/70 rounded-xl w-2/3 aspect-square shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
          <div className="absolute top-3 right-3">
            <Button size="sm" variant="secondary" onClick={stopCamera}>
              <X className="h-4 w-4 mr-1" /> Stop
            </Button>
          </div>
          <div className="absolute bottom-3 left-0 right-0 text-center">
            <span className="text-xs font-mono px-2 py-1 rounded bg-background/70 text-primary">
              {scanning ? "Scanning…" : "Initializing camera"}
            </span>
          </div>
        </div>
      )}

      {decoded && (
        <div className="glass rounded-xl p-4 space-y-2">
          <div className="text-xs text-muted-foreground">Decoded payload</div>
          <code className="block break-all text-xs font-mono bg-secondary/40 p-2 rounded">{decoded}</code>
          {busy && <p className="text-sm text-muted-foreground">Scanning URL…</p>}
        </div>
      )}

      {result && (
        <div className="glass rounded-xl p-4 space-y-2">
          <VerdictBadge verdict={result.verdict} score={result.risk_score} />
          {result.explanation && <p className="text-sm">{result.explanation}</p>}
          {result.red_flags?.length > 0 && (
            <ul className="text-xs space-y-1 text-muted-foreground">
              {result.red_flags.map((f: string, i: number) => <li key={i}>• {f}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
