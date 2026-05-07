import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Target, Loader2, CheckCircle2, XCircle, Mail, MessageSquare, Globe, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";

export default function PhishingSim() {
  const [level, setLevel] = useState<"easy" | "medium" | "hard">("easy");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<boolean | null>(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });

  const loadStats = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("phishing_sim_results").select("correct").eq("user_id", user.id);
    if (data) setStats({ correct: data.filter(d => d.correct).length, total: data.length });
  };

  useEffect(() => { loadStats(); }, []);

  const next = async () => {
    setLoading(true); setData(null); setAnswer(null);
    const { data: r } = await supabase.functions.invoke("learn-content", { body: { mode: "phishing_sim", level } });
    setLoading(false); setData(r);
  };

  useEffect(() => { next(); /* eslint-disable-next-line */ }, [level]);

  const submit = async (guess: boolean) => {
    if (!data) return;
    setAnswer(guess);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const correct = guess === data.is_phishing;
    await supabase.from("phishing_sim_results").insert({
      user_id: user.id, scenario_id: crypto.randomUUID(), correct, difficulty: level,
    });
    await supabase.from("risk_events").insert({ user_id: user.id, delta: correct ? 2 : -3, reason: `phishing_sim_${level}` });
    loadStats();
  };

  const ChannelIcon = data?.scenario?.channel === "sms" ? MessageSquare : data?.scenario?.channel === "web" ? Globe : Mail;

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" /><h2 className="font-bold">Phishing Simulator</h2></div>
          <div className="text-xs text-muted-foreground">Score: <span className="font-bold text-success">{stats.correct}</span>/{stats.total}</div>
        </div>
        <div className="flex gap-1 mt-2">
          {(["easy", "medium", "hard"] as const).map(l => (
            <button key={l} onClick={() => setLevel(l)}
              className={`flex-1 py-1.5 text-xs rounded-lg capitalize ${level === l ? "gradient-cyber text-background font-bold" : "bg-background/40 text-muted-foreground"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="text-center py-12"><Loader2 className="h-7 w-7 animate-spin mx-auto text-primary" /></div>}

      {data && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="glass rounded-2xl p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <ChannelIcon className="h-3 w-3" />
              <span className="uppercase font-mono">{data.scenario.channel}</span>
            </div>
            <div className="text-xs"><span className="text-muted-foreground">From:</span> <span className="font-mono">{data.scenario.from}</span></div>
            <div className="text-sm font-bold mt-1">{data.scenario.subject}</div>
            <div className="text-sm mt-3 leading-relaxed whitespace-pre-wrap">{data.scenario.body}</div>
          </div>

          {answer === null ? (
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => submit(false)} className="py-3 rounded-2xl bg-success/15 text-success font-bold border border-success/30">✓ Legitimate</button>
              <button onClick={() => submit(true)} className="py-3 rounded-2xl bg-destructive/15 text-destructive font-bold border border-destructive/30">⚠ Phishing</button>
            </div>
          ) : (
            <>
              <div className={`glass rounded-2xl p-4 border-2 ${answer === data.is_phishing ? "border-success" : "border-destructive"}`}>
                <div className="flex items-center gap-2 font-bold">
                  {answer === data.is_phishing ? <><CheckCircle2 className="h-5 w-5 text-success" /> Correct!</> : <><XCircle className="h-5 w-5 text-destructive" /> Wrong</>}
                </div>
                <div className="text-xs mt-2">{data.explanation}</div>
              </div>
              <div className="glass rounded-2xl p-4">
                <div className="text-xs font-bold text-warning mb-2">RED FLAGS</div>
                <ul className="text-xs space-y-1 list-disc list-inside text-muted-foreground">
                  {data.red_flags?.map((f: string, i: number) => <li key={i}>{f}</li>)}
                </ul>
              </div>
              <button onClick={next} className="w-full py-3 rounded-2xl gradient-cyber text-background font-bold flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4" /> Next Scenario
              </button>
            </>
          )}
        </motion.div>
      )}
    </div>
  );
}
