import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GraduationCap, BookOpen, Loader2, CheckCircle2, XCircle, Trophy, Sparkles, TrendingUp, TrendingDown, ThumbsUp, ThumbsDown, Brain, Target, Lightbulb, Flame, Award } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";

type Level = "beginner" | "intermediate" | "advanced";

const TOPICS = [
  "Phishing emails — how to spot them",
  "Strong passwords & MFA",
  "Smishing & vishing scams",
  "Public Wi-Fi safety",
  "Crypto wallet drainers",
  "Social engineering basics",
  "Mobile app permissions",
  "Ransomware survival guide",
];

const LEVELS: Level[] = ["beginner", "intermediate", "advanced"];
const FEEDBACK_KEY = "learn_feedback_v1";

const DAILY_TIPS = [
  { t: "Hover before you click", b: "On desktop, hover over a link to preview the real URL. On mobile, long-press to inspect — phishers love look-alike domains like paypa1.com." },
  { t: "Enable MFA on your email first", b: "Your email is the master key — password resets for every other account land there. Lock it down with an authenticator app, not SMS." },
  { t: "Never approve unexpected MFA prompts", b: "MFA fatigue attacks spam approvals hoping you tap one. If you didn't initiate it, deny it and rotate your password immediately." },
  { t: "Treat 'urgent' messages as suspicious", b: "Scammers manufacture panic to bypass your judgment. Pause, breathe, verify via a second channel before acting." },
  { t: "Use a passphrase, not a password", b: "Four random words ('plum-tractor-violin-92') beat 'P@ssw0rd!' in both strength and memorability." },
  { t: "Update apps weekly", b: "Most exploits target unpatched bugs that already have fixes. Auto-update is your cheapest defense." },
  { t: "Lock SIM swap by adding a carrier PIN", b: "Call your carrier and set a port-out PIN — it stops attackers from stealing your number to bypass SMS 2FA." },
  { t: "Verify crypto addresses character-by-character", b: "Clipboard hijackers swap addresses. Always check the first AND last 6 characters before sending." },
  { t: "Disable link previews in unknown chats", b: "Some preview servers leak your IP and metadata. Only allow them for trusted contacts." },
  { t: "Review app permissions monthly", b: "Flashlight apps don't need contacts. Audit Settings → Privacy and revoke anything that doesn't make sense." },
  { t: "Back up the 3-2-1 way", b: "3 copies, 2 different media, 1 offline. Ransomware can't encrypt what it can't reach." },
  { t: "Use unique emails per service", b: "Aliases (you+netflix@gmail.com) reveal which company leaked your address when spam starts arriving." },
  { t: "Beware QR codes in public", b: "'Quishing' attacks paste fake QR codes over real ones (parking meters, menus). Type the URL manually when stakes are high." },
];

function dailyTip() {
  const day = Math.floor(Date.now() / 86_400_000);
  return DAILY_TIPS[day % DAILY_TIPS.length];
}

function loadFeedback(): Record<string, { rating: 1 | -1; note?: string }> {
  try { return JSON.parse(localStorage.getItem(FEEDBACK_KEY) || "{}"); } catch { return {}; }
}
function saveFeedback(fb: Record<string, any>) { localStorage.setItem(FEEDBACK_KEY, JSON.stringify(fb)); }

export default function Learn() {
  const [topic, setTopic] = useState<string | null>(null);
  const [level, setLevel] = useState<Level>("beginner");
  const [lesson, setLesson] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [progress, setProgress] = useState<{ lesson_id: string; score: number }[]>([]);
  const [feedback, setFeedback] = useState<Record<string, { rating: 1 | -1; note?: string }>>(loadFeedback());
  const [feedbackNote, setFeedbackNote] = useState("");
  const [lastPct, setLastPct] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("learning_progress").select("lesson_id,score").eq("user_id", user.id);
      setProgress(data || []);
    })();
  }, []);

  const completedSet = useMemo(() => new Set(progress.map(p => p.lesson_id)), [progress]);

  // Adaptive engine: returns recommended level for a topic based on past scores
  const recommendLevelFor = (t: string): Level => {
    const history = LEVELS.map(l => {
      const rec = progress.find(p => p.lesson_id === `${l}:${t}`);
      return { l, score: rec?.score ?? null };
    });
    // walk upward — if beginner mastered ≥80% of 3, go intermediate; same to advanced
    let target: Level = "beginner";
    for (const h of history) {
      if (h.score === null) return target;
      const pct = (h.score / 3) * 100;
      if (pct >= 80 && h.l !== "advanced") {
        target = LEVELS[LEVELS.indexOf(h.l) + 1];
      } else if (pct < 50 && h.l !== "beginner") {
        target = LEVELS[LEVELS.indexOf(h.l) - 1];
        return target;
      } else {
        return h.l; // repeat current
      }
    }
    return target;
  };

  // Pick next best topic for the adaptive path
  const adaptiveNext = (): { topic: string; level: Level } => {
    // prefer topics not yet completed at recommended level
    for (const t of TOPICS) {
      const lv = recommendLevelFor(t);
      if (!completedSet.has(`${lv}:${t}`)) return { topic: t, level: lv };
    }
    // else pick weakest topic to retry harder
    const weakest = [...TOPICS].sort((a, b) => {
      const sa = progress.find(p => p.lesson_id.endsWith(`:${a}`))?.score ?? 0;
      const sb = progress.find(p => p.lesson_id.endsWith(`:${b}`))?.score ?? 0;
      return sa - sb;
    })[0];
    return { topic: weakest, level: recommendLevelFor(weakest) };
  };

  const start = async (t: string, lvl?: Level) => {
    const useLvl = lvl ?? level;
    setLevel(useLvl);
    setTopic(t); setLesson(null); setAnswers({}); setSubmitted(false); setLastPct(null); setFeedbackNote(""); setLoading(true);
    const { data, error } = await supabase.functions.invoke("learn-content", { body: { mode: "lesson", topic: t, level: useLvl } });
    setLoading(false);
    if (error) { toast({ title: "Failed to load", variant: "destructive" }); return; }
    setLesson(data);
  };

  const submit = async () => {
    if (!lesson || !topic) return;
    setSubmitted(true);
    const score = lesson.quiz.reduce((s: number, q: any, i: number) => s + (answers[i] === q.correct_index ? 1 : 0), 0);
    const pct = Math.round((score / lesson.quiz.length) * 100);
    setLastPct(pct);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const lid = `${level}:${topic}`;
    await supabase.from("learning_progress").upsert({ user_id: user.id, lesson_id: lid, score });
    setProgress(prev => {
      const others = prev.filter(p => p.lesson_id !== lid);
      return [...others, { lesson_id: lid, score }];
    });
    const next = pct >= 80 && level !== "advanced" ? "↑ Advancing difficulty"
      : pct < 50 && level !== "beginner" ? "↓ Stepping back to reinforce basics"
      : "→ Stay at this level — practice more";
    toast({ title: `${pct}% — ${next}` });
  };

  const submitFeedback = (rating: 1 | -1) => {
    if (!topic) return;
    const key = `${level}:${topic}`;
    const fb = { ...feedback, [key]: { rating, note: feedbackNote } };
    setFeedback(fb); saveFeedback(fb);
    toast({ title: "Thanks for the feedback" });
  };

  if (lesson) {
    const fbKey = `${level}:${topic}`;
    const recLvl = topic ? recommendLevelFor(topic) : level;
    return (
      <div className="space-y-4">
        <button onClick={() => { setLesson(null); setTopic(null); }} className="text-xs text-muted-foreground">← Back to topics</button>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-5">
          <div className="text-[10px] font-mono text-primary">{level.toUpperCase()} LESSON</div>
          <h2 className="text-xl font-bold mt-1">{lesson.title}</h2>
          <p className="text-sm text-muted-foreground mt-2">{lesson.summary}</p>
        </motion.div>

        {lesson.sections?.map((s: any, i: number) => (
          <div key={i} className="glass rounded-2xl p-4">
            <div className="font-bold text-sm mb-1 text-accent">{s.heading}</div>
            <div className="text-sm leading-relaxed">{s.body}</div>
          </div>
        ))}

        <div className="glass rounded-2xl p-4">
          <div className="text-xs font-bold text-primary mb-2 flex items-center gap-1"><Trophy className="h-3 w-3" /> KEY TAKEAWAYS</div>
          <ul className="text-sm space-y-1 list-disc list-inside">
            {lesson.key_takeaways?.map((k: string, i: number) => <li key={i}>{k}</li>)}
          </ul>
        </div>

        <div className="glass rounded-2xl p-4 space-y-4">
          <div className="font-bold text-sm">Quick Quiz</div>
          {lesson.quiz?.map((q: any, qi: number) => (
            <div key={qi}>
              <div className="text-sm font-medium mb-2">{qi + 1}. {q.question}</div>
              <div className="space-y-1.5">
                {q.options.map((o: string, oi: number) => {
                  const sel = answers[qi] === oi;
                  const correct = submitted && oi === q.correct_index;
                  const wrong = submitted && sel && oi !== q.correct_index;
                  return (
                    <button key={oi} disabled={submitted} onClick={() => setAnswers({ ...answers, [qi]: oi })}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm border transition-colors ${
                        correct ? "border-success bg-success/10" :
                        wrong ? "border-destructive bg-destructive/10" :
                        sel ? "border-primary bg-primary/10" : "border-border bg-background/30"
                      }`}>
                      <div className="flex items-center gap-2">
                        {submitted && correct && <CheckCircle2 className="h-4 w-4 text-success" />}
                        {submitted && wrong && <XCircle className="h-4 w-4 text-destructive" />}
                        {o}
                      </div>
                    </button>
                  );
                })}
              </div>
              {submitted && <div className="text-xs text-muted-foreground mt-2">{q.explanation}</div>}
            </div>
          ))}
          {!submitted && (
            <button onClick={submit} className="w-full py-2 rounded-xl gradient-cyber text-background font-semibold text-sm">Submit</button>
          )}
        </div>

        {submitted && lastPct !== null && (
          <div className="glass rounded-2xl p-4 space-y-3 border border-primary/30">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <div className="text-sm font-bold">Adaptive Path</div>
            </div>
            <div className="text-xs text-muted-foreground">
              You scored <span className="font-mono text-foreground">{lastPct}%</span>.{" "}
              {lastPct >= 80 ? "Strong grasp — leveling up next." :
               lastPct >= 50 ? "Solid — repeating same level to lock it in." :
               "Reinforcing fundamentals before moving on."}
            </div>
            <div className="flex items-center gap-2 text-xs">
              {lastPct >= 80 ? <TrendingUp className="h-3.5 w-3.5 text-success" /> :
               lastPct < 50 ? <TrendingDown className="h-3.5 w-3.5 text-destructive" /> :
               <Sparkles className="h-3.5 w-3.5 text-primary" />}
              <span>Recommended next: <b className="text-primary">{recLvl}</b></span>
            </div>
            <button onClick={() => { const n = adaptiveNext(); start(n.topic, n.level); }}
              className="w-full py-2 rounded-xl gradient-cyber text-background font-semibold text-sm">
              Continue adaptive path →
            </button>

            <div className="pt-3 border-t border-border/50">
              <div className="text-xs font-bold mb-2">Was this lesson helpful?</div>
              <textarea value={feedbackNote} onChange={(e) => setFeedbackNote(e.target.value)} rows={2}
                placeholder="Optional note: too easy / too hard / unclear / great…"
                className="w-full bg-background/40 border border-border rounded-xl px-3 py-2 text-xs mb-2" />
              <div className="flex gap-2">
                <button onClick={() => submitFeedback(1)}
                  className={`flex-1 py-1.5 rounded-lg text-xs flex items-center justify-center gap-1 border ${feedback[fbKey]?.rating === 1 ? "border-success bg-success/10 text-success" : "border-border"}`}>
                  <ThumbsUp className="h-3 w-3" /> Helpful
                </button>
                <button onClick={() => submitFeedback(-1)}
                  className={`flex-1 py-1.5 rounded-lg text-xs flex items-center justify-center gap-1 border ${feedback[fbKey]?.rating === -1 ? "border-destructive bg-destructive/10 text-destructive" : "border-border"}`}>
                  <ThumbsDown className="h-3 w-3" /> Improve
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const next = adaptiveNext();
  const masteredCount = progress.filter(p => p.score >= 2).length;
  const tip = dailyTip();

  // mastery: for each topic & level → score%, and overall mastery score 0-100
  const topicMastery = TOPICS.map(t => {
    const perLevel = LEVELS.map(l => {
      const rec = progress.find(p => p.lesson_id === `${l}:${t}`);
      return { level: l, pct: rec ? Math.round((rec.score / 3) * 100) : null };
    });
    // weighted: beginner 1x, intermediate 2x, advanced 3x
    const weights = { beginner: 1, intermediate: 2, advanced: 3 } as const;
    let num = 0, den = 0;
    perLevel.forEach(p => { if (p.pct !== null) { num += p.pct * weights[p.level]; den += 100 * weights[p.level]; } });
    const mastery = den ? Math.round((num / den) * 100) : 0;
    return { topic: t, perLevel, mastery };
  });
  const sorted = [...topicMastery].sort((a, b) => b.mastery - a.mastery);
  const strengths = sorted.filter(s => s.mastery >= 60).slice(0, 3);
  const weaknesses = sorted.filter(s => s.mastery < 60).slice(-3).reverse();
  const overall = topicMastery.length ? Math.round(topicMastery.reduce((s, t) => s + t.mastery, 0) / topicMastery.length) : 0;

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-5 relative overflow-hidden">
        <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full gradient-cyber opacity-20 blur-3xl" />
        <div className="flex items-center gap-2 mb-1"><GraduationCap className="h-5 w-5 text-primary" />
          <h2 className="font-bold text-lg">Learn Cybersecurity</h2></div>
        <p className="text-xs text-muted-foreground">AI-generated lessons that adapt to your performance.</p>
        <div className="flex gap-1 mt-3">
          {LEVELS.map(l => (
            <button key={l} onClick={() => setLevel(l)}
              className={`flex-1 py-1.5 text-xs rounded-lg ${level === l ? "gradient-cyber text-background font-bold" : "bg-background/40 text-muted-foreground"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="glass rounded-2xl p-4 border border-primary/30">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="h-4 w-4 text-primary" />
          <div className="text-sm font-bold">Your Adaptive Path</div>
        </div>
        <div className="text-xs text-muted-foreground mb-3">
          Mastered <span className="font-mono text-foreground">{masteredCount}</span> lesson(s). Next pick is tuned to your scores.
        </div>
        <div className="bg-background/40 rounded-xl p-3 mb-3">
          <div className="text-[10px] uppercase tracking-wider text-primary font-mono mb-0.5">Recommended next</div>
          <div className="text-sm font-medium">{next.topic}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Difficulty: <b>{next.level}</b></div>
        </div>
        <button onClick={() => start(next.topic, next.level)} disabled={loading}
          className="w-full py-2 rounded-xl gradient-cyber text-background font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
          <Sparkles className="h-4 w-4" /> Start adaptive lesson
        </button>
      </div>

      {/* Daily Tip */}
      <div className="glass rounded-2xl p-4 border border-accent/30 relative overflow-hidden">
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-accent/10 blur-3xl" />
        <div className="flex items-center gap-2 mb-1.5">
          <Lightbulb className="h-4 w-4 text-accent" />
          <div className="text-[10px] font-mono uppercase tracking-wider text-accent">Daily Safety Tip</div>
          <Flame className="h-3 w-3 text-orange-400 ml-auto" />
        </div>
        <div className="text-sm font-bold mb-1">{tip.t}</div>
        <div className="text-xs text-muted-foreground leading-relaxed">{tip.b}</div>
      </div>

      {/* Mastery Dashboard */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Target className="h-4 w-4 text-primary" />
          <div className="text-sm font-bold">Topic Mastery Dashboard</div>
          <div className="ml-auto flex items-center gap-1.5">
            <Award className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-mono">{overall}%</span>
          </div>
        </div>
        <div className="h-2 w-full rounded-full bg-background/40 overflow-hidden mb-4">
          <div className="h-full gradient-cyber" style={{ width: `${overall}%` }} />
        </div>

        {strengths.length > 0 && (
          <div className="mb-3">
            <div className="text-[10px] font-mono uppercase text-success mb-1.5 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Strengths</div>
            <div className="space-y-1">
              {strengths.map(s => (
                <div key={s.topic} className="flex items-center gap-2 text-xs">
                  <div className="flex-1 truncate">{s.topic}</div>
                  <div className="font-mono text-success">{s.mastery}%</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {weaknesses.length > 0 && (
          <div className="mb-3">
            <div className="text-[10px] font-mono uppercase text-destructive mb-1.5 flex items-center gap-1"><TrendingDown className="h-3 w-3" /> Needs work</div>
            <div className="space-y-1">
              {weaknesses.map(s => (
                <button key={s.topic} onClick={() => start(s.topic, recommendLevelFor(s.topic))}
                  className="w-full flex items-center gap-2 text-xs hover:bg-background/40 rounded-lg px-1.5 py-1 transition-colors">
                  <div className="flex-1 truncate text-left">{s.topic}</div>
                  <div className="font-mono text-destructive">{s.mastery}%</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1.5">All topics</div>
        <div className="space-y-2">
          {topicMastery.map(tm => (
            <div key={tm.topic}>
              <div className="flex items-center justify-between text-xs mb-1">
                <div className="truncate flex-1">{tm.topic}</div>
                <div className="font-mono text-muted-foreground">{tm.mastery}%</div>
              </div>
              <div className="flex gap-1">
                {tm.perLevel.map(pl => (
                  <div key={pl.level} className="flex-1">
                    <div className={`h-1.5 rounded-full ${
                      pl.pct === null ? "bg-background/40" :
                      pl.pct >= 80 ? "bg-success" :
                      pl.pct >= 50 ? "bg-yellow-500" : "bg-destructive"
                    }`} style={{ opacity: pl.pct === null ? 0.3 : 1 }} />
                    <div className="text-[9px] text-muted-foreground mt-0.5 text-center">{pl.level[0].toUpperCase()}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {loading && <div className="text-center py-6"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>}

      <div className="grid gap-2">
        {TOPICS.map(t => {
          const lid = `${level}:${t}`;
          const done = completedSet.has(lid);
          const rec = recommendLevelFor(t);
          const recommended = rec === level && !done;
          return (
            <button key={t} onClick={() => start(t)} disabled={loading}
              className={`glass rounded-xl p-3 flex items-center gap-3 text-left hover:ring-1 hover:ring-primary/50 disabled:opacity-50 ${recommended ? "ring-1 ring-primary/40" : ""}`}>
              <div className="h-9 w-9 rounded-lg gradient-cyber grid place-items-center shrink-0">
                <BookOpen className="h-4 w-4 text-background" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{t}</div>
                <div className="text-[10px] text-muted-foreground">Suggested: {rec}</div>
              </div>
              {done && <CheckCircle2 className="h-4 w-4 text-success shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
