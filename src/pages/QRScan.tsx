import { useState, useRef, useEffect, useCallback } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import jsQR from "jsqr";
import { Activity, Camera, CheckCircle2, Copy, ExternalLink, FileSearch, Image as ImageIcon, Loader2, QrCode, RotateCcw, ShieldCheck, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runScan, persistScan } from "@/lib/scans";
import { VerdictBadge } from "@/components/VerdictBadge";

type ScanStatus = "idle" | "reading" | "found" | "scanning" | "not-found" | "camera-error";

type DecodeAttempt = {
  pass: string;
  engine: "zxing" | "jsqr";
  durationMs: number;
  success: boolean;
  width?: number;
  height?: number;
};

type Diagnostics = {
  source: "image" | "camera";
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  imageWidth?: number;
  imageHeight?: number;
  totalMs: number;
  attempts: DecodeAttempt[];
  decodedBy?: "zxing" | "jsqr" | "camera-zxing";
  payloadType: "url" | "text" | "wifi" | "tel" | "sms" | "email" | "geo" | "vcard" | "unknown";
  payloadLength: number;
  startedAt: string;
};

function classifyPayload(payload: string): Diagnostics["payloadType"] {
  const p = payload.trim();
  if (/^https?:\/\//i.test(p)) return "url";
  if (/^WIFI:/i.test(p)) return "wifi";
  if (/^tel:/i.test(p)) return "tel";
  if (/^sms(to)?:/i.test(p)) return "sms";
  if (/^mailto:/i.test(p)) return "email";
  if (/^geo:/i.test(p)) return "geo";
  if (/^BEGIN:VCARD/i.test(p)) return "vcard";
  if (/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(p)) return "url";
  return "text";
}

const qrHints = new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]],
  [DecodeHintType.TRY_HARDER, true],
]);

const zxingReader = new BrowserQRCodeReader(qrHints, {
  delayBetweenScanAttempts: 90,
  delayBetweenScanSuccess: 400,
  tryPlayVideoTimeout: 5000,
});

function normalizePayload(payload: string) {
  const trimmed = payload.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

async function loadImageFromFile(file: File): Promise<{ img: HTMLImageElement; url: string }> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not read this image file."));
  });
  return { img, url };
}

function canvasToImage(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not prepare image for QR decoding."));
    img.src = canvas.toDataURL("image/png");
  });
}

function buildImageVariants(img: HTMLImageElement) {
  const maxSide = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const scales = Array.from(new Set([
    1,
    maxSide > 2800 ? 1800 / maxSide : 1,
    maxSide > 1800 ? 1300 / maxSide : 1,
    maxSide < 900 ? 1200 / maxSide : 1,
    maxSide < 500 ? 1600 / maxSide : 1,
  ].filter(scale => scale > 0 && Number.isFinite(scale))));

  return scales.flatMap(scale => [
    { scale, crop: 0, contrast: 1 },
    { scale, crop: 0.08, contrast: 1.18 },
    { scale, crop: 0.16, contrast: 1.32 },
  ]);
}

async function decodeWithZxingFromCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  try {
    const prepared = await canvasToImage(canvas);
    const result = await zxingReader.decodeFromImageElement(prepared);
    return result?.getText?.() || result?.toString?.() || null;
  } catch {
    return null;
  }
}

async function decodeFromImage(img: HTMLImageElement): Promise<string | null> {
  const sourceWidth = img.naturalWidth || img.width;
  const sourceHeight = img.naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || !sourceWidth || !sourceHeight) return null;

  try {
    const direct = await zxingReader.decodeFromImageElement(img);
    const text = direct?.getText?.() || direct?.toString?.();
    if (text) return text;
  } catch {
    // Fall through to enhanced decoding passes.
  }

  for (const variant of buildImageVariants(img)) {
    const cropX = Math.round(sourceWidth * variant.crop);
    const cropY = Math.round(sourceHeight * variant.crop);
    const cropW = Math.max(1, sourceWidth - cropX * 2);
    const cropH = Math.max(1, sourceHeight - cropY * 2);
    const w = Math.max(320, Math.round(cropW * variant.scale));
    const h = Math.max(320, Math.round(cropH * variant.scale));

    canvas.width = w;
    canvas.height = h;
    ctx.filter = `contrast(${variant.contrast}) saturate(0)`;
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, w, h);
    ctx.filter = "none";

    const imageData = ctx.getImageData(0, 0, w, h);
    const jsQrResult = jsQR(imageData.data, w, h, { inversionAttempts: "attemptBoth" });
    if (jsQrResult?.data) return jsQrResult.data;

    const zxingResult = await decodeWithZxingFromCanvas(canvas);
    if (zxingResult) return zxingResult;
  }

  return null;
}

export default function QRScan() {
  const [decoded, setDecoded] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraFileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const analyzingRef = useRef(false);

  const resetInputs = () => {
    if (galleryRef.current) galleryRef.current.value = "";
    if (cameraFileRef.current) cameraFileRef.current.value = "";
  };

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
    if (!analyzingRef.current) setStatus("idle");
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  async function analyzePayload(payload: string) {
    const normalized = normalizePayload(payload);
    analyzingRef.current = true;
    setDecoded(normalized);
    setStatus("found");
    setLastError(null);

    if (!/^https?:\/\//i.test(normalized)) {
      setBusy(false);
      analyzingRef.current = false;
      toast.message("QR decoded", { description: "This QR does not contain a web URL, so no threat scan was started." });
      return;
    }

    try {
      setBusy(true);
      setStatus("scanning");
      const scanResult = await runScan("url", { url: normalized });
      setResult(scanResult);
      await persistScan({
        type: "url",
        target: normalized,
        verdict: scanResult.verdict,
        risk_score: scanResult.risk_score,
        details: { ...scanResult, source: "qr" },
      });
      setStatus("found");
    } catch (e: any) {
      setLastError(e?.message || "The URL scan failed after the QR was decoded.");
      toast.error(e?.message || "The URL scan failed after the QR was decoded.");
    } finally {
      setBusy(false);
      analyzingRef.current = false;
    }
  }

  async function handleFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file that contains a QR code.");
      resetInputs();
      return;
    }

    setResult(null);
    setDecoded(null);
    setLastError(null);
    setStatus("reading");
    setBusy(true);

    let objectUrl: string | null = null;
    try {
      const loaded = await loadImageFromFile(file);
      objectUrl = loaded.url;
      const payload = await decodeFromImage(loaded.img);
      if (!payload) {
        setStatus("not-found");
        setLastError("No QR code was detected in this image. Try a sharper image with the full QR visible and not cropped.");
        toast.error("No QR code detected", { description: "Use a sharper photo with the full QR centered and visible." });
        return;
      }
      await analyzePayload(payload);
    } catch (e: any) {
      setStatus("not-found");
      setLastError(e?.message || "Could not read this image.");
      toast.error(e?.message || "Could not read this image.");
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resetInputs();
      setBusy(false);
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("camera-error");
      setLastError("Camera scanning is not available in this browser. Upload a QR image instead.");
      toast.error("Camera unavailable", { description: "Upload a QR image instead." });
      return;
    }

    stopCamera();
    setResult(null);
    setDecoded(null);
    setLastError(null);
    setCameraOn(true);
    setStatus("reading");

    requestAnimationFrame(async () => {
      const video = videoRef.current;
      if (!video) return;

      try {
        const controls = await zxingReader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              aspectRatio: { ideal: 1 },
            },
          },
          video,
          (scanResult, error, controlsHandle) => {
            controlsRef.current = controlsHandle;
            if (scanResult?.getText()) {
              controlsHandle.stop();
              setCameraOn(false);
              analyzePayload(scanResult.getText());
              return;
            }
            if (error && error.name !== "NotFoundException") {
              setLastError("Camera is active, but the QR is not clear enough yet.");
            }
          },
        );
        controlsRef.current = controls;
      } catch (e: any) {
        setCameraOn(false);
        setStatus("camera-error");
        setLastError(e?.message || "Camera permission was blocked or no camera was found.");
        toast.error("Camera unavailable", { description: "Use gallery upload or take a photo instead." });
      }
    });
  }

  const hasDecodedUrl = decoded && /^https?:\/\//i.test(decoded);

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-center gap-2 mb-1">
          <QrCode className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">QR Code Scanner</h2>
        </div>
        <p className="text-sm text-muted-foreground">Decode QR codes locally, then analyze hidden URLs for phishing or malware.</p>
      </header>

      {!cameraOn && (
        <div className="glass rounded-xl p-5 text-center space-y-4">
          <input
            ref={galleryRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/*"
            hidden
            onChange={e => handleFile(e.target.files?.[0])}
          />
          <input
            ref={cameraFileRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={e => handleFile(e.target.files?.[0])}
          />

          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/25">
            {busy ? <Loader2 className="h-10 w-10 animate-spin text-primary" /> : <QrCode className="h-10 w-10 text-primary" />}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button onClick={startCamera} disabled={busy} className="gradient-cyber text-background font-semibold">
              <Camera className="h-4 w-4 mr-2" /> Live scan
            </Button>
            <Button onClick={() => galleryRef.current?.click()} disabled={busy} variant="secondary">
              <ImageIcon className="h-4 w-4 mr-2" /> Upload image
            </Button>
            <Button onClick={() => cameraFileRef.current?.click()} disabled={busy} variant="outline">
              <Upload className="h-4 w-4 mr-2" /> Take photo
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-left text-[11px] text-muted-foreground">
            <StatusPill active={status === "reading" || cameraOn} label="Detect" />
            <StatusPill active={status === "found" || status === "scanning"} label="Decode" />
            <StatusPill active={status === "scanning" || !!result} label="Analyze" />
          </div>
        </div>
      )}

      {cameraOn && (
        <div className="glass rounded-xl p-2 relative overflow-hidden">
          <video ref={videoRef} className="w-full rounded-lg bg-background aspect-[3/4] object-cover" muted playsInline />
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-2/3 max-w-80 aspect-square rounded-2xl border-2 border-primary shadow-[0_0_0_9999px_hsl(var(--background)/0.55)]" />
          </div>
          <div className="absolute top-3 right-3 flex gap-2">
            <Button size="sm" variant="secondary" onClick={stopCamera}>
              <X className="h-4 w-4 mr-1" /> Stop
            </Button>
          </div>
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 rounded-lg bg-background/85 px-3 py-2 text-xs font-mono text-primary ring-1 ring-border">
            <span className="inline-flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning camera</span>
            <span className="text-muted-foreground">Center the QR</span>
          </div>
        </div>
      )}

      {lastError && !cameraOn && (
        <div className="glass rounded-xl p-4 space-y-3 border border-destructive/30">
          <div className="flex items-start gap-3">
            <RotateCcw className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1 text-left">
              <div className="text-sm font-semibold">QR not readable yet</div>
              <p className="text-xs text-muted-foreground leading-relaxed">{lastError}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => galleryRef.current?.click()} disabled={busy}>Upload another</Button>
            <Button variant="outline" onClick={startCamera} disabled={busy}>Try live scan</Button>
          </div>
        </div>
      )}

      {decoded && (
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="h-4 w-4 text-success" /> Decoded payload
            </div>
            {hasDecodedUrl && <span className="text-[10px] font-mono text-primary uppercase">URL</span>}
          </div>
          <code className="block max-h-40 overflow-auto break-all text-xs font-mono bg-secondary/40 p-3 rounded-lg ring-1 ring-border">{decoded}</code>
          {busy && <p className="text-sm text-muted-foreground"><Loader2 className="h-4 w-4 mr-2 inline animate-spin" />Scanning URL intelligence…</p>}
        </div>
      )}

      {result && (
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <ShieldCheck className="h-4 w-4" /> QR destination analysis
          </div>
          <VerdictBadge verdict={result.verdict} score={result.risk_score} />
          {result.explanation && <p className="text-sm leading-relaxed">{result.explanation}</p>}
          {result.red_flags?.length > 0 && (
            <ul className="text-xs space-y-1 text-muted-foreground">
              {result.red_flags.map((flag: string, index: number) => <li key={index}>• {flag}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <div className={`rounded-lg px-3 py-2 ring-1 ${active ? "bg-primary/10 text-primary ring-primary/30" : "bg-secondary/30 ring-border"}`}>
      <div className="font-mono uppercase tracking-normal">{label}</div>
    </div>
  );
}
