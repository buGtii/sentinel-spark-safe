import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runScan, persistScan } from "@/lib/scans";
import { VerdictBadge } from "@/components/VerdictBadge";
import { VerdictPanel } from "@/components/VerdictPanel";
import { MitreMapping } from "@/components/MitreMapping";
import { Loader2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

export default function UrlScan() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function go() {
    if (!url) return;
    setBusy(true); setResult(null);
    try {
      const r = await runScan("url", { url });
      setResult(r);
      await persistScan({ type: "url", target: url, verdict: r.verdict, risk_score: r.risk_score, details: r });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-center gap-2 mb-2"><Link2 className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">URL Scanner</h2></div>
        <p className="text-sm text-muted-foreground">Heuristics + VirusTotal + Gemini.</p>
      </header>

      <div className="glass rounded-2xl p-4 space-y-3">
        <Input placeholder="https://suspicious-link.com" value={url}
          onChange={e => setUrl(e.target.value)} className="font-mono text-sm" />
        <Button onClick={go} disabled={busy || !url} className="w-full gradient-primary text-primary-foreground font-semibold glow">
          {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanning...</> : "Scan URL"}
        </Button>
      </div>

      {result && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          <VerdictPanel
            verdict={result.verdict}
            verdict_level={result.verdict_level}
            risk_score={result.risk_score}
            confidence={result.confidence}
            recommendation={result.recommendation}
            explanation={result.explanation || result.ai_analysis}
            red_flags={result.red_flags}
            layers={result.layers}
          />

          {(result.verdict_level || result.confidence != null || result.phishing_label) && (
            <div className="glass rounded-xl p-4 grid grid-cols-3 gap-2 text-center">
              {result.verdict_level && (
                <div><div className="text-xs text-muted-foreground uppercase">Risk Level</div>
                  <div className="text-sm font-bold mt-1">{result.verdict_level}</div></div>
              )}
              {result.confidence != null && (
                <div><div className="text-xs text-muted-foreground uppercase">Confidence</div>
                  <div className="text-sm font-bold mt-1">{result.confidence}%</div></div>
              )}
              {result.phishing_label && (
                <div><div className="text-xs text-muted-foreground uppercase">Phishing</div>
                  <div className={`text-sm font-bold mt-1 ${result.is_phishing ? "text-destructive" : "text-success"}`}>
                    {result.is_phishing ? "Yes" : "No"}
                  </div></div>
              )}
            </div>
          )}

          {result.virustotal && (
            <div className="glass rounded-xl p-4">
              <div className="text-xs font-mono text-primary mb-2">
                VIRUSTOTAL {result.vt_status && result.vt_status !== "ok" ? `· ${result.vt_status}` : ""}
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <Stat label="Malicious" value={result.virustotal.malicious || 0} cls="text-destructive" />
                <Stat label="Suspicious" value={result.virustotal.suspicious || 0} cls="text-warning" />
                <Stat label="Harmless" value={result.virustotal.harmless || 0} cls="text-success" />
                <Stat label="Undetected" value={result.virustotal.undetected || 0} cls="text-muted-foreground" />
              </div>
              {result.virustotal.pending && (
                <div className="text-xs text-warning mt-2">VirusTotal analysis is still pending — results may improve in a few minutes.</div>
              )}
            </div>
          )}
          {!result.virustotal && result.vt_status && (
            <div className="glass rounded-xl p-3 text-xs text-warning">
              VirusTotal lookup unavailable ({String(result.vt_status).replace(/_/g, " ")}). Result is based on heuristics and AI reasoning only.
            </div>
          )}
          <MitreMapping techniques={result.mitre_techniques} />
        </motion.div>
      )}
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div>
      <div className={`text-2xl font-mono font-bold ${cls}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
    </div>
  );
}
