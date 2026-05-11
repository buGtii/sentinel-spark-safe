import { AlertTriangle, CheckCircle2, HelpCircle, ShieldAlert, ShieldCheck, Info } from "lucide-react";

type Layer = { name: string; score: number; weight: number; evidence: string[]; status: "ok"|"warn"|"bad"|"unknown" };

export type VerdictPanelProps = {
  verdict_level?: string;
  verdict?: "safe"|"suspicious"|"malicious"|"unknown";
  risk_score?: number;
  confidence?: number;
  recommendation?: string;
  explanation?: string;
  red_flags?: string[];
  layers?: Layer[];
};

const levelColor: Record<string, string> = {
  Trusted: "from-emerald-500/20 to-emerald-500/5 text-emerald-300 border-emerald-500/30",
  "Likely Safe": "from-emerald-500/20 to-emerald-500/5 text-emerald-300 border-emerald-500/30",
  Unknown: "from-amber-500/20 to-amber-500/5 text-amber-300 border-amber-500/30",
  Suspicious: "from-orange-500/20 to-orange-500/5 text-orange-300 border-orange-500/30",
  "High Risk": "from-rose-500/20 to-rose-500/5 text-rose-300 border-rose-500/30",
  Malicious: "from-red-600/30 to-red-600/5 text-red-200 border-red-600/40",
};

function statusIcon(s: Layer["status"]) {
  if (s === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (s === "warn") return <AlertTriangle className="h-4 w-4 text-amber-400" />;
  if (s === "bad") return <ShieldAlert className="h-4 w-4 text-rose-400" />;
  return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
}

export function VerdictPanel({ verdict_level, verdict, risk_score = 0, confidence = 0, recommendation, explanation, red_flags = [], layers = [] }: VerdictPanelProps) {
  const level = verdict_level || (verdict === "malicious" ? "Malicious" : verdict === "suspicious" ? "Suspicious" : verdict === "safe" ? "Likely Safe" : "Unknown");
  const color = levelColor[level] || levelColor.Unknown;
  const isSafe = verdict === "safe";

  return (
    <div className="space-y-3">
      <div className={`rounded-2xl border bg-gradient-to-br ${color} p-4`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider opacity-70">Verdict</div>
            <div className="text-2xl font-bold flex items-center gap-2">
              {isSafe ? <ShieldCheck className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
              {level}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider opacity-70">Risk score</div>
            <div className="text-2xl font-bold tabular-nums">{risk_score}<span className="text-sm opacity-60">/100</span></div>
          </div>
        </div>

        <div className="mt-3">
          <div className="flex justify-between text-[11px] opacity-80 mb-1">
            <span>AI confidence</span>
            <span className="tabular-nums">{confidence}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-background/40 overflow-hidden">
            <div className="h-full bg-current opacity-80" style={{ width: `${confidence}%` }} />
          </div>
        </div>
      </div>

      {explanation && (
        <div className="glass rounded-xl p-3 text-xs leading-relaxed">
          <div className="flex items-center gap-2 mb-1 font-semibold text-foreground"><Info className="h-3.5 w-3.5 text-primary" /> Why this verdict</div>
          <p className="text-muted-foreground">{explanation}</p>
        </div>
      )}

      {!!red_flags.length && (
        <div className="glass rounded-xl p-3">
          <div className="text-xs font-semibold mb-2">Evidence used</div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {red_flags.slice(0, 8).map((f, i) => <li key={i} className="flex gap-2"><span className="text-amber-400">•</span><span>{f}</span></li>)}
          </ul>
        </div>
      )}

      {recommendation && (
        <div className="glass rounded-xl p-3 text-xs">
          <div className="font-semibold mb-1">What you should do</div>
          <p className="text-muted-foreground leading-relaxed">{recommendation}</p>
        </div>
      )}

      {!!layers.length && (
        <details className="glass rounded-xl p-3 text-xs">
          <summary className="cursor-pointer font-semibold">Detection layers ({layers.length})</summary>
          <div className="mt-2 space-y-2">
            {layers.map((l, i) => (
              <div key={i} className="rounded-lg bg-background/30 p-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium">{statusIcon(l.status)} {l.name}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">{l.score}/100 · w{Math.round(l.weight*100)}%</div>
                </div>
                {!!l.evidence.length && (
                  <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                    {l.evidence.slice(0,4).map((e, j) => <li key={j}>— {e}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
