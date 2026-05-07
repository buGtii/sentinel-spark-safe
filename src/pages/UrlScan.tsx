import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runScan, persistScan } from "@/lib/scans";
import { VerdictBadge } from "@/components/VerdictBadge";
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
          <VerdictBadge verdict={result.verdict} score={result.risk_score} />
          {result.heuristics?.reasons?.length > 0 && (
            <div className="glass rounded-xl p-4">
              <div className="text-xs font-mono text-primary mb-2">HEURISTIC FLAGS</div>
              <ul className="space-y-1 text-sm">
                {result.heuristics.reasons.map((r: string, i: number) =>
                  <li key={i} className="flex gap-2"><span className="text-warning">▸</span>{r}</li>)}
              </ul>
            </div>
          )}
          {result.virustotal && (
            <div className="glass rounded-xl p-4">
              <div className="text-xs font-mono text-primary mb-2">VIRUSTOTAL</div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <Stat label="Malicious" value={result.virustotal.malicious || 0} cls="text-destructive" />
                <Stat label="Suspicious" value={result.virustotal.suspicious || 0} cls="text-warning" />
                <Stat label="Harmless" value={result.virustotal.harmless || 0} cls="text-success" />
                <Stat label="Undetected" value={result.virustotal.undetected || 0} cls="text-muted-foreground" />
              </div>
            </div>
          )}
          {result.ai_analysis && (
            <div className="glass rounded-xl p-4">
              <div className="text-xs font-mono text-accent mb-2">✨ GEMINI AI</div>
              <p className="text-sm leading-relaxed">{result.ai_analysis}</p>
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
