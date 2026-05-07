import { useState, useRef } from "react";
import { QrCode, Upload, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import jsQR from "jsqr";
import { toast } from "sonner";
import { runScan, persistScan } from "@/lib/scans";
import { VerdictBadge } from "@/components/VerdictBadge";

export default function QRScan() {
  const [decoded, setDecoded] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setResult(null); setDecoded(null);
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await new Promise(r => { img.onload = r; });
    const canvas = document.createElement("canvas");
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(data.data, data.width, data.height);
    if (!code) { toast.error("No QR code found in the image."); return; }
    setDecoded(code.data);
    if (/^https?:\/\//i.test(code.data)) {
      try {
        setBusy(true);
        const r = await runScan("url", { url: code.data });
        setResult(r);
        await persistScan({ type: "url", target: code.data, verdict: r.verdict, risk_score: r.risk_score, details: { ...r, source: "qr" } });
      } catch (e: any) { toast.error(e.message); }
      finally { setBusy(false); }
    }
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

      <div className="glass rounded-xl p-6 text-center">
        <input ref={inputRef} type="file" accept="image/*" capture="environment" hidden
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        <QrCode className="h-16 w-16 mx-auto text-primary opacity-50 mb-3" />
        <div className="flex gap-2 justify-center">
          <Button onClick={() => inputRef.current?.click()} className="gradient-cyber text-background">
            <Upload className="h-4 w-4 mr-2" /> Upload QR image
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 font-mono">Decoded locally · URL scanned via AI + VirusTotal</p>
      </div>

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
