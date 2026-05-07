import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { runScan, persistScan } from "@/lib/scans";
import { VerdictBadge } from "@/components/VerdictBadge";
import { MitreMapping } from "@/components/MitreMapping";
import { Loader2, MessageSquare, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

export default function MessageScan() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function go() {
    if (!msg.trim()) return;
    setBusy(true); setResult(null);
    try {
      const r = await runScan("message", { message: msg });
      setResult(r);
      await persistScan({ type: "message", target: msg.slice(0, 200), verdict: r.verdict, risk_score: r.risk_score, details: r });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-center gap-2 mb-2"><MessageSquare className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">Message Analyzer</h2></div>
        <p className="text-sm text-muted-foreground">Paste any SMS or email. Gemini AI flags scams.</p>
      </header>

      <div className="glass rounded-2xl p-4 space-y-3">
        <Textarea rows={6} placeholder="Paste suspicious message here..." value={msg}
          onChange={e => setMsg(e.target.value)} className="font-mono text-sm resize-none" />
        <Button onClick={go} disabled={busy || !msg.trim()} className="w-full gradient-primary text-primary-foreground font-semibold glow">
          {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing...</> :
            <><Sparkles className="h-4 w-4 mr-2" /> Analyze with Gemini</>}
        </Button>
      </div>

      {result && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          <VerdictBadge verdict={result.verdict} score={result.risk_score} />
          <div className="glass rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-mono text-accent">CATEGORY</div>
              <div className="text-xs font-mono uppercase text-primary">{result.category}</div>
            </div>
            <p className="text-sm leading-relaxed">{result.explanation}</p>
            {result.recommendation && (
              <div className="mt-3 p-3 rounded-lg bg-primary/10 border border-primary/30 text-sm">
                💡 {result.recommendation}
              </div>
            )}
          </div>
          {result.red_flags?.length > 0 && (
            <div className="glass rounded-xl p-4">
              <div className="text-xs font-mono text-warning mb-2">RED FLAGS</div>
              <ul className="space-y-1 text-sm">
                {result.red_flags.map((f: string, i: number) =>
                  <li key={i} className="flex gap-2"><span className="text-warning">⚠</span>{f}</li>)}
              </ul>
            </div>
          )}
          {result.urls_found?.length > 0 && (
            <div className="glass rounded-xl p-4">
              <div className="text-xs font-mono text-primary mb-2">URLS FOUND</div>
              <ul className="space-y-1 text-xs font-mono break-all">
                {result.urls_found.map((u: string, i: number) => <li key={i}>{u}</li>)}
              </ul>
            </div>
          )}
          <MitreMapping techniques={result.mitre_techniques} />
        </motion.div>
      )}
    </div>
  );
}
