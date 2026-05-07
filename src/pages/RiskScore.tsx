import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Activity, TrendingUp, TrendingDown, ShieldCheck } from "lucide-react";

export default function RiskScore() {
  const [score, setScore] = useState(70);
  const [events, setEvents] = useState<any[]>([]);
  const [scans, setScans] = useState({ safe: 0, bad: 0, total: 0 });
  const [sims, setSims] = useState({ correct: 0, total: 0 });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: ev }, { data: sc }, { data: si }] = await Promise.all([
        supabase.from("risk_events").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("scans").select("verdict").eq("user_id", user.id),
        supabase.from("phishing_sim_results").select("correct").eq("user_id", user.id),
      ]);
      setEvents(ev || []);
      const safe = (sc || []).filter(s => s.verdict === "safe").length;
      const bad = (sc || []).filter(s => s.verdict === "malicious" || s.verdict === "suspicious").length;
      setScans({ safe, bad, total: (sc || []).length });
      const corr = (si || []).filter(s => s.correct).length;
      setSims({ correct: corr, total: (si || []).length });

      // Score: base 50 + scans engagement + sim accuracy + risk events delta
      let s = 50;
      s += Math.min(20, (sc?.length || 0));
      s += Math.min(20, corr * 2 - ((si?.length || 0) - corr) * 3);
      s += (ev || []).reduce((a, e) => a + e.delta, 0);
      setScore(Math.max(0, Math.min(100, s)));
    })();
  }, []);

  const tier = score >= 80 ? { label: "Low Risk", color: "text-success", bg: "bg-success/15" }
    : score >= 50 ? { label: "Moderate", color: "text-warning", bg: "bg-warning/15" }
    : { label: "High Risk", color: "text-destructive", bg: "bg-destructive/15" };

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-6 text-center relative overflow-hidden">
        <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full gradient-cyber opacity-20 blur-3xl" />
        <ShieldCheck className="h-8 w-8 mx-auto text-primary mb-2" />
        <div className="text-xs font-mono text-muted-foreground">HUMAN RISK SCORE</div>
        <div className={`text-6xl font-black mt-2 ${tier.color}`}>{score}</div>
        <div className={`inline-block px-3 py-1 rounded-full text-xs font-bold mt-2 ${tier.bg} ${tier.color}`}>{tier.label}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="glass rounded-2xl p-4">
          <div className="text-xs text-muted-foreground">Scans run</div>
          <div className="text-2xl font-mono font-bold">{scans.total}</div>
          <div className="text-[10px] text-muted-foreground">{scans.bad} threats caught</div>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="text-xs text-muted-foreground">Phishing sim</div>
          <div className="text-2xl font-mono font-bold">{sims.correct}/{sims.total}</div>
          <div className="text-[10px] text-muted-foreground">accuracy</div>
        </div>
      </div>

      <div className="glass rounded-2xl p-4">
        <div className="text-xs font-bold text-primary mb-3 flex items-center gap-1"><Activity className="h-3 w-3" /> RECENT ACTIVITY</div>
        {events.length === 0 && <div className="text-xs text-muted-foreground">No activity yet — try the phishing simulator.</div>}
        <div className="space-y-2">
          {events.map(e => (
            <div key={e.id} className="flex items-center justify-between text-xs">
              <div className="font-mono text-muted-foreground">{e.reason}</div>
              <div className={`font-bold flex items-center gap-1 ${e.delta > 0 ? "text-success" : "text-destructive"}`}>
                {e.delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {e.delta > 0 ? "+" : ""}{e.delta}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
