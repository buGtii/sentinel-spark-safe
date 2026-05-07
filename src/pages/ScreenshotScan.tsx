import { useRef, useState } from "react";
import { Image as ImageIcon, Upload, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { VerdictBadge } from "@/components/VerdictBadge";
import { persistScan } from "@/lib/scans";

export default function ScreenshotScan() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(f: File) {
    setResult(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
      setBusy(true);
      try {
        const base64 = dataUrl.split(",")[1];
        const { data, error } = await supabase.functions.invoke("scan-screenshot", {
          body: { imageBase64: base64, mimeType: f.type || "image/png" },
        });
        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);
        setResult(data);
        await persistScan({
          type: "file", target: `screenshot:${f.name}`, verdict: data.verdict,
          risk_score: data.risk_score, details: { ...data, source: "screenshot" },
        });
      } catch (e: any) { toast.error(e.message); }
      finally { setBusy(false); }
    };
    reader.readAsDataURL(f);
  }

  return (
    <div className="space-y-4">
      <header>
        <div className="flex items-center gap-2 mb-1">
          <Eye className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">Screenshot Phishing Detection</h2>
        </div>
        <p className="text-sm text-muted-foreground">AI vision analysis of phishing pages, fake login forms, scam SMS/email screenshots.</p>
      </header>

      <div className="glass rounded-xl p-6 text-center">
        <input ref={inputRef} type="file" accept="image/*" hidden
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        <ImageIcon className="h-16 w-16 mx-auto text-primary opacity-50 mb-3" />
        <Button onClick={() => inputRef.current?.click()} className="gradient-cyber text-background">
          <Upload className="h-4 w-4 mr-2" /> Upload screenshot
        </Button>
      </div>

      {preview && (
        <div className="glass rounded-xl p-2">
          <img src={preview} alt="preview" className="rounded-lg max-h-80 mx-auto" />
        </div>
      )}

      {busy && <div className="glass rounded-xl p-4 text-sm text-muted-foreground text-center">Analyzing image with Gemini Vision…</div>}

      {result && (
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <VerdictBadge verdict={result.verdict} score={result.risk_score} />
            {result.impersonated_brand && (
              <span className="text-xs font-mono px-2 py-1 rounded bg-warning/15 text-warning">
                Impersonates: {result.impersonated_brand}
              </span>
            )}
          </div>
          {result.explanation && <p className="text-sm">{result.explanation}</p>}
          {result.red_flags?.length > 0 && (
            <div>
              <div className="text-xs font-bold text-muted-foreground mb-1">Red flags</div>
              <ul className="text-xs space-y-1">
                {result.red_flags.map((f: string, i: number) => <li key={i}>• {f}</li>)}
              </ul>
            </div>
          )}
          {result.recommendation && (
            <div className="border-t border-primary/15 pt-2">
              <div className="text-xs font-bold text-muted-foreground mb-1">Recommendation</div>
              <p className="text-sm">{result.recommendation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
