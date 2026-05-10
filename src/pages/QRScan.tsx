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

async function decodeFromImage(
  img: HTMLImageElement,
  attempts: DecodeAttempt[],
): Promise<{ payload: string; engine: "zxing" | "jsqr" } | null> {
  const sourceWidth = img.naturalWidth || img.width;
  const sourceHeight = img.naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || !sourceWidth || !sourceHeight) return null;

  const directStart = performance.now();
  try {
    const direct = await zxingReader.decodeFromImageElement(img);
    const text = direct?.getText?.() || direct?.toString?.();
    const dur = performance.now() - directStart;
    attempts.push({ pass: "direct", engine: "zxing", durationMs: dur, success: !!text, width: sourceWidth, height: sourceHeight });
    if (text) return { payload: text, engine: "zxing" };
  } catch {
    attempts.push({ pass: "direct", engine: "zxing", durationMs: performance.now() - directStart, success: false, width: sourceWidth, height: sourceHeight });
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

    const passLabel = `s${variant.scale.toFixed(2)}·c${variant.crop.toFixed(2)}·k${variant.contrast.toFixed(2)}`;
    const imageData = ctx.getImageData(0, 0, w, h);

    const jsStart = performance.now();
    const jsQrResult = jsQR(imageData.data, w, h, { inversionAttempts: "attemptBoth" });
    attempts.push({ pass: passLabel, engine: "jsqr", durationMs: performance.now() - jsStart, success: !!jsQrResult?.data, width: w, height: h });
    if (jsQrResult?.data) return { payload: jsQrResult.data, engine: "jsqr" };

    const zxStart = performance.now();
    const zxingResult = await decodeWithZxingFromCanvas(canvas);
    attempts.push({ pass: passLabel, engine: "zxing", durationMs: performance.now() - zxStart, success: !!zxingResult, width: w, height: h });
    if (zxingResult) return { payload: zxingResult, engine: "zxing" };
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
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
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
    setDiagnostics(null);
    setStatus("reading");
    setBusy(true);

    const attempts: DecodeAttempt[] = [];
    const startedAt = new Date().toISOString();
    const overallStart = performance.now();

    let objectUrl: string | null = null;
    try {
      const loaded = await loadImageFromFile(file);
      objectUrl = loaded.url;
      const decodedResult = await decodeFromImage(loaded.img, attempts);
      const totalMs = performance.now() - overallStart;
      const baseDiag: Diagnostics = {
        source: "image",
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        imageWidth: loaded.img.naturalWidth,
        imageHeight: loaded.img.naturalHeight,
        totalMs,
        attempts,
        startedAt,
        payloadType: "unknown",
        payloadLength: 0,
        decodedBy: decodedResult?.engine,
      };

      if (!decodedResult) {
        setDiagnostics(baseDiag);
        setStatus("not-found");
        setLastError("No QR code was detected in this image. Try a sharper image with the full QR visible and not cropped.");
        toast.error("No QR code detected", { description: "See diagnostics below for what was tried." });
        return;
      }

      setDiagnostics({
        ...baseDiag,
        payloadType: classifyPayload(decodedResult.payload),
        payloadLength: decodedResult.payload.length,
      });
      await analyzePayload(decodedResult.payload);
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
    setDiagnostics(null);
    setCameraOn(true);
    setStatus("reading");

    const cameraStart = performance.now();
    const startedAt = new Date().toISOString();

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
              const text = scanResult.getText();
              const totalMs = performance.now() - cameraStart;
              controlsHandle.stop();
              setCameraOn(false);
              setDiagnostics({
                source: "camera",
                imageWidth: video.videoWidth,
                imageHeight: video.videoHeight,
                totalMs,
                attempts: [{ pass: "live-stream", engine: "zxing", durationMs: totalMs, success: true, width: video.videoWidth, height: video.videoHeight }],
                decodedBy: "camera-zxing",
                payloadType: classifyPayload(text),
                payloadLength: text.length,
                startedAt,
              });
              analyzePayload(text);
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
            <div className="flex items-center gap-2">
              {diagnostics && (
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  {diagnostics.payloadType}
                </span>
              )}
              {hasDecodedUrl && <span className="text-[10px] font-mono text-primary uppercase">URL</span>}
            </div>
          </div>
          <code className="block max-h-40 overflow-auto break-all text-xs font-mono bg-secondary/40 p-3 rounded-lg ring-1 ring-border">{decoded}</code>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard?.writeText(decoded); toast.success("Copied"); }}>
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
            </Button>
            {hasDecodedUrl && (
              <Button size="sm" variant="outline" asChild>
                <a href={decoded} target="_blank" rel="noopener noreferrer nofollow">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open in new tab
                </a>
              </Button>
            )}
          </div>
          {busy && <p className="text-sm text-muted-foreground"><Loader2 className="h-4 w-4 mr-2 inline animate-spin" />Scanning URL intelligence…</p>}
        </div>
      )}

      {diagnostics && (
        <DiagnosticsCard diagnostics={diagnostics} />
      )}

      {result && (
        <ScanReport result={result} decoded={decoded} diagnostics={diagnostics} />
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

function formatBytes(bytes?: number) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function DiagnosticsCard({ diagnostics }: { diagnostics: Diagnostics }) {
  const successAttempt = diagnostics.attempts.find(a => a.success);
  const totalAttempts = diagnostics.attempts.length;
  const failedAttempts = diagnostics.attempts.filter(a => !a.success).length;

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4 text-primary" /> Scan diagnostics
        </div>
        <span className="text-[10px] font-mono uppercase text-muted-foreground">{diagnostics.source}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <Stat label="Total time" value={`${diagnostics.totalMs.toFixed(0)} ms`} />
        <Stat label="Decoder" value={diagnostics.decodedBy ?? "none"} />
        <Stat label="Attempts" value={`${totalAttempts}`} sub={`${failedAttempts} skipped`} />
        <Stat label="Resolution" value={diagnostics.imageWidth ? `${diagnostics.imageWidth}×${diagnostics.imageHeight}` : "—"} />
        {diagnostics.source === "image" && (
          <>
            <Stat label="File" value={diagnostics.fileName || "—"} />
            <Stat label="Size" value={formatBytes(diagnostics.fileSize)} />
            <Stat label="MIME" value={diagnostics.fileType || "—"} />
            <Stat label="Payload" value={`${diagnostics.payloadLength} chars`} />
          </>
        )}
      </div>

      {successAttempt && (
        <div className="text-[11px] font-mono text-success/90">
          ✓ Solved on pass <span className="text-success">{successAttempt.pass}</span> via {successAttempt.engine} in {successAttempt.durationMs.toFixed(0)} ms
        </div>
      )}

      {diagnostics.attempts.length > 1 && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition">
            Show all decode passes ({diagnostics.attempts.length})
          </summary>
          <div className="mt-2 max-h-48 overflow-auto rounded-lg ring-1 ring-border">
            <table className="w-full text-[11px] font-mono">
              <thead className="bg-secondary/40 text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-1">#</th>
                  <th className="text-left px-2 py-1">Pass</th>
                  <th className="text-left px-2 py-1">Engine</th>
                  <th className="text-right px-2 py-1">Time</th>
                  <th className="text-right px-2 py-1">Result</th>
                </tr>
              </thead>
              <tbody>
                {diagnostics.attempts.map((a, i) => (
                  <tr key={i} className="border-t border-border/40">
                    <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                    <td className="px-2 py-1">{a.pass}</td>
                    <td className="px-2 py-1">{a.engine}</td>
                    <td className="px-2 py-1 text-right">{a.durationMs.toFixed(0)} ms</td>
                    <td className={`px-2 py-1 text-right ${a.success ? "text-success" : "text-muted-foreground"}`}>
                      {a.success ? "hit" : "miss"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <p className="text-[10px] text-muted-foreground">Started {new Date(diagnostics.startedAt).toLocaleTimeString()}</p>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-secondary/30 ring-1 ring-border px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xs font-semibold truncate" title={value}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function safeHostname(url?: string | null) {
  if (!url) return null;
  try { return new URL(url).hostname; } catch { return null; }
}

function ScanReport({ result, decoded, diagnostics }: { result: any; decoded: string | null; diagnostics: Diagnostics | null }) {
  const host = safeHostname(decoded);
  const vt = result.virustotal || result.vt || result.details?.virustotal;
  const sources: string[] = result.sources || result.providers || [];
  const recommendation = result.recommendation || (
    result.verdict === "malicious" ? "Do not visit this link. Delete the QR or report it." :
    result.verdict === "suspicious" ? "Avoid sharing data with this destination until verified." :
    result.verdict === "safe" ? "No threats found. Continue with normal caution." :
    "Verdict unavailable — proceed with caution."
  );

  return (
    <div className="glass rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <ShieldCheck className="h-4 w-4" /> QR destination report
        </div>
        <span className="text-[10px] font-mono uppercase text-muted-foreground">
          <FileSearch className="h-3 w-3 inline mr-1" />
          report
        </span>
      </div>

      <VerdictBadge verdict={result.verdict} score={result.risk_score} />

      {host && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Stat label="Host" value={host} />
          <Stat label="Risk score" value={`${result.risk_score ?? "—"} / 100`} />
        </div>
      )}

      {result.explanation && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Summary</div>
          <p className="text-sm leading-relaxed">{result.explanation}</p>
        </div>
      )}

      {result.red_flags?.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Red flags</div>
          <ul className="text-xs space-y-1">
            {result.red_flags.map((flag: string, index: number) => (
              <li key={index} className="flex gap-2"><span className="text-destructive">•</span><span>{flag}</span></li>
            ))}
          </ul>
        </div>
      )}

      {vt && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">VirusTotal</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <Stat label="Malicious" value={`${vt.malicious ?? vt.stats?.malicious ?? 0}`} />
            <Stat label="Suspicious" value={`${vt.suspicious ?? vt.stats?.suspicious ?? 0}`} />
            <Stat label="Harmless" value={`${vt.harmless ?? vt.stats?.harmless ?? 0}`} />
            <Stat label="Undetected" value={`${vt.undetected ?? vt.stats?.undetected ?? 0}`} />
          </div>
        </div>
      )}

      {sources.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Sources</div>
          <div className="flex flex-wrap gap-1.5">
            {sources.map((s, i) => (
              <span key={i} className="text-[10px] font-mono bg-secondary/40 ring-1 ring-border px-2 py-0.5 rounded">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg bg-primary/5 ring-1 ring-primary/20 p-3">
        <div className="text-[10px] uppercase tracking-wider text-primary mb-1">Recommendation</div>
        <p className="text-xs leading-relaxed">{recommendation}</p>
      </div>

      {diagnostics && (
        <p className="text-[10px] text-muted-foreground font-mono">
          Decoded by {diagnostics.decodedBy} in {diagnostics.totalMs.toFixed(0)} ms · {diagnostics.attempts.length} pass(es)
        </p>
      )}
    </div>
  );
}
