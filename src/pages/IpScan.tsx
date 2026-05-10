import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runScan, persistScan } from "@/lib/scans";
import { VerdictBadge } from "@/components/VerdictBadge";
import { Loader2, Globe, AlertTriangle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { classifyInput } from "@/lib/inputType";

export default function IpScan() {
  const [ip, setIp] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function go() {
    const value = ip.trim();
    if (!value) return;
    // Client-side guard so we never even hit the backend with the wrong type.
    const kind = classifyInput(value);
    if (kind === "url" || kind === "domain") {
      setResult({ error_type: "wrong_scanner", detected_type: kind, suggested_scanner: "url",
        message: `This looks like a ${kind === "url" ? "URL" : "domain"}, not an IP address. Use the URL Scanner.` });
      return;
    }
    setBusy(true); setResult(null);
    try {
      const r = await runScan("ip", { ip: value });
      setResult(r);
      if (!r.error_type) {
        await persistScan({ type: "ip", target: value, verdict: r.verdict, risk_score: r.risk_score, details: r });
      }
    } catch (e: any) { toast.error(e.message || "Scan failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-center gap-2 mb-2"><Globe className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">IP Reputation</h2></div>
        <p className="text-sm text-muted-foreground">VirusTotal IP reputation lookup. Accepts IPv4 and IPv6.</p>
      </header>

      <div className="glass rounded-2xl p-4 space-y-3">
        <Input placeholder="8.8.8.8 or 2001:4860:4860::8888" value={ip}
          onChange={e => setIp(e.target.value)} className="font-mono text-sm" />
        <Button onClick={go} disabled={busy || !ip} className="w-full gradient-primary text-primary-foreground font-semibold glow">
          {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Looking up...</> : "Check IP"}
        </Button>
      </div>

      {result?.error_type && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="glass rounded-xl p-4 border border-warning/40 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div className="text-sm">{result.message}</div>
          </div>
          {result.suggested_scanner === "url" && (
            <Button asChild size="sm" variant="secondary" className="w-full">
              <Link to="/url">Open URL Scanner <ArrowRight className="h-4 w-4 ml-1" /></Link>
            </Button>
          )}
        </motion.div>
      )}

      {result && !result.error_type && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          <VerdictBadge verdict={result.verdict} score={result.risk_score} />
          <div className="glass rounded-xl p-4 text-sm space-y-1">
            {result.verdict_level && <div>Risk level: <b>{result.verdict_level}</b></div>}
            {result.country && <div>Country: <b>{result.country}</b></div>}
            {result.asn && <div>ASN owner: <b>{result.asn}</b></div>}
            {result.confidence != null && <div>Confidence: <b>{result.confidence}%</b></div>}
            {result.vt_status && result.vt_status !== "ok" && (
              <div className="text-xs text-warning mt-2">VirusTotal: {result.vt_status.replace(/_/g, " ")}</div>
            )}
            {result.virustotal && (
              <div className="text-xs font-mono text-muted-foreground mt-2">
                M:{result.virustotal.malicious} S:{result.virustotal.suspicious} H:{result.virustotal.harmless}
              </div>
            )}
            {result.message && <div className="text-xs text-muted-foreground mt-2">{result.message}</div>}
          </div>
        </motion.div>
      )}
    </div>
  );
}
