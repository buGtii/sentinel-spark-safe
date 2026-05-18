import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runScan, persistScan } from "@/lib/scans";
import { VerdictBadge } from "@/components/VerdictBadge";
import { ShieldCheck, Loader2, ExternalLink, ArrowLeft, Link2, AlertTriangle, Eye } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { addXp } from "@/lib/gamify";
import { scoreUrl } from "@/lib/detector";

const CACHE_KEY = "cybersmart.linkguard.cache";
type CacheEntry = { verdict: string; risk_score: number; confidence?: number; at: number };
const TTL = 1000 * 60 * 30; // 30 min

function readCache(): Record<string, CacheEntry> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { return {}; }
}
function writeCache(c: Record<string, CacheEntry>) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(c));
}

export default function SafeLink() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [url, setUrl] = useState(params.get("url") || "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const ranFor = useRef<string>("");

  async function check(target = url) {
    if (!target) return;
    let normalized = target.trim();
    if (!/^https?:\/\//i.test(normalized)) normalized = "https://" + normalized;
    setBusy(true); setResult(null); setCountdown(null);
    try {
      const cache = readCache();
      const cached = cache[normalized];
      if (cached && Date.now() - cached.at < TTL) {
        setResult({ verdict: cached.verdict, risk_score: cached.risk_score, confidence: cached.confidence, _cached: true });
        maybeAutoOpen(normalized, cached.verdict, cached.risk_score, cached.confidence ?? 0);
        return;
      }
      const r = await runScan("url", { url: normalized });
      setResult(r);
      cache[normalized] = { verdict: r.verdict, risk_score: r.risk_score, confidence: r.confidence, at: Date.now() };
      writeCache(cache);
      await persistScan({ type: "url", target: normalized, verdict: r.verdict, risk_score: r.risk_score, details: r });
      addXp(5, "link-guard");
      maybeAutoOpen(normalized, r.verdict, r.risk_score, r.confidence ?? 0);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  function maybeAutoOpen(target: string, verdict: string, score = 0, confidence = 0) {
    // Only auto-open when the link is clearly safe — verdict safe, low risk, decent confidence.
    if (verdict === "safe" && score <= 15 && confidence >= 50) {
      let s = 3;
      setCountdown(s);
      const t = setInterval(() => {
        s -= 1;
        if (s <= 0) { clearInterval(t); setCountdown(null); openLink(target); }
        else setCountdown(s);
      }, 1000);
    }
  }

  function openLink(target = url) {
    let normalized = target.trim();
    if (!/^https?:\/\//i.test(normalized)) normalized = "https://" + normalized;
    window.open(normalized, "_blank", "noopener,noreferrer");
  }

  // Auto-run when arrived via deep link
  useEffect(() => {
    const u = params.get("url");
    if (u && ranFor.current !== u) {
      ranFor.current = u;
      setUrl(u);
      check(u);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const verdict = result?.verdict;
  const isDanger = verdict === "malicious" || verdict === "suspicious";

  // On-device, instant pre-scan so the user sees *why* a link is risky
  // even before the cloud verdict comes back.
  const preScan = useMemo(() => {
    const candidate = (params.get("url") || url || "").trim();
    if (!candidate) return null;
    const normalized = /^https?:\/\//i.test(candidate) ? candidate : "https://" + candidate;
    return scoreUrl(normalized);
  }, [url, params]);

  const reasons = useMemo(() => {
    const out: string[] = [];
    const cloud = (result?.details?.reasons || result?.reasons) as string[] | undefined;
    if (Array.isArray(cloud)) for (const r of cloud) out.push(r);
    if (preScan?.reasons) for (const r of preScan.reasons) if (!out.includes(r)) out.push(r);
    return out.slice(0, 6);
  }, [result, preScan]);

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <button onClick={() => nav(-1)} className="p-2 rounded-lg hover:bg-secondary/60 mt-0.5">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold">Safe Link Guard</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Every link is checked through heuristics + VirusTotal + AI before opening.
          </p>
        </div>
      </header>

      <div className="glass rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-mono text-primary">
          <Link2 className="h-3.5 w-3.5" /> URL TO INSPECT
        </div>
        <Input
          placeholder="paste or share any link…"
          value={url}
          onChange={e => setUrl(e.target.value)}
          className="font-mono text-sm break-all"
          onKeyDown={e => e.key === "Enter" && check()}
        />
        {preScan && busy && (
          <div className="rounded-lg bg-secondary/40 p-2.5 text-[11px] space-y-1">
            <div className="flex items-center gap-1.5 font-mono text-primary">
              <Eye className="h-3 w-3" /> ON-DEVICE PRE-SCAN
              <span className="ml-auto opacity-70">{preScan.score}/100 · {preScan.verdict}</span>
            </div>
            {preScan.reasons.length > 0 && (
              <ul className="list-disc pl-4 text-muted-foreground space-y-0.5">
                {preScan.reasons.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
          </div>
        )}
        <Button
          onClick={() => check()}
          disabled={busy || !url}
          className="w-full gradient-primary text-primary-foreground font-semibold glow"
        >
          {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Inspecting…</> : "Check link"}
        </Button>
      </div>

      {result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <VerdictBadge verdict={result.verdict} score={result.risk_score} />

          {result._cached && (
            <div className="text-[10px] font-mono text-muted-foreground text-center">
              ✓ cached verdict (re-checked within 30 min)
            </div>
          )}

          {(isDanger || reasons.length > 0) && (
            <div className={`glass rounded-xl p-4 border ${
              isDanger ? "border-destructive/40 bg-destructive/5" : "border-warning/40 bg-warning/5"
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className={`h-4 w-4 ${isDanger ? "text-destructive" : "text-warning"}`} />
                <div className={`text-sm font-semibold ${isDanger ? "text-destructive" : "text-warning"}`}>
                  {isDanger
                    ? `This link looks ${verdict}.`
                    : "Open with caution — review the reasons below."}
                </div>
              </div>
              {reasons.length > 0 ? (
                <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                  {reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Opening it could expose you to phishing, malware, or credential theft.
                </p>
              )}
              <div className="mt-2 text-[10px] font-mono break-all text-muted-foreground/80">
                {url}
              </div>
            </div>
          )}

          {verdict === "safe" && countdown !== null && (
            <div className="text-center text-sm text-success font-mono">
              Opening safely in {countdown}…
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => { setCountdown(null); setResult(null); setUrl(""); }}>
              Cancel
            </Button>
            <Button
              onClick={() => { setCountdown(null); openLink(); }}
              data-skip-guard
              className={isDanger
                ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                : "gradient-primary text-primary-foreground glow"}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              {isDanger ? "Open anyway" : "Open now"}
            </Button>
          </div>
        </motion.div>
      )}

      <div className="glass rounded-2xl p-4 text-xs text-muted-foreground space-y-2">
        <div className="font-mono text-primary">HOW TO USE</div>
        <div>
          <strong className="text-foreground">On phone (Android):</strong> after building with Capacitor,
          long-press any link → <em>Open with</em> → <em>CyberSmart</em>. Set as default browser to scan
          every tap automatically.
        </div>
        <div>
          <strong className="text-foreground">Anywhere:</strong> share any link → <em>CyberSmart</em>,
          or paste here. Verdicts are cached for 30 minutes.
        </div>
        <div>
          <strong className="text-foreground">Quick share URL:</strong>{" "}
          <code className="text-[10px]">/safe-link?url=https://…</code>
        </div>
      </div>
    </div>
  );
}
