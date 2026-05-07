import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runScan, persistScan } from "@/lib/scans";
import { VerdictBadge } from "@/components/VerdictBadge";
import { Loader2, Globe } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

export default function IpScan() {
  const [ip, setIp] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function go() {
    setBusy(true); setResult(null);
    try {
      const r = await runScan("ip", { ip });
      setResult(r);
      await persistScan({ type: "ip", target: ip, verdict: r.verdict, risk_score: r.risk_score, details: r });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-center gap-2 mb-2"><Globe className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">IP Reputation</h2></div>
        <p className="text-sm text-muted-foreground">VirusTotal IP reputation lookup.</p>
      </header>

      <div className="glass rounded-2xl p-4 space-y-3">
        <Input placeholder="8.8.8.8" value={ip}
          onChange={e => setIp(e.target.value)} className="font-mono text-sm" />
        <Button onClick={go} disabled={busy || !ip} className="w-full gradient-primary text-primary-foreground font-semibold glow">
          {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Looking up...</> : "Check IP"}
        </Button>
      </div>

      {result && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          <VerdictBadge verdict={result.verdict} score={result.risk_score} />
          <div className="glass rounded-xl p-4 text-sm space-y-1">
            {result.country && <div>Country: <b>{result.country}</b></div>}
            {result.asn && <div>ASN owner: <b>{result.asn}</b></div>}
            {result.virustotal && (
              <div className="text-xs font-mono text-muted-foreground mt-2">
                M:{result.virustotal.malicious} S:{result.virustotal.suspicious} H:{result.virustotal.harmless}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
