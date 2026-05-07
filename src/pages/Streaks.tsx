import { useEffect, useState } from "react";
import { Flame, Trophy, Zap } from "lucide-react";
import { getStats, getLog } from "@/lib/gamify";

export default function Streaks() {
  const [stats, setStats] = useState(getStats());
  const [log, setLog] = useState(getLog());
  useEffect(() => { setStats(getStats()); setLog(getLog()); }, []);

  const pct = Math.round(((stats.xp - ((stats.level - 1) ** 2) * 25) / (stats.nextXp - ((stats.level - 1) ** 2) * 25)) * 100);

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs font-mono text-primary">PROGRESSION</p>
        <h1 className="text-2xl font-bold">Streaks & XP</h1>
        <p className="text-sm text-muted-foreground">Build daily security habits. Earn XP from scans, lessons, and simulations.</p>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <div className="glass rounded-2xl p-4 text-center">
          <Flame className="h-6 w-6 text-warning mx-auto mb-1" />
          <div className="text-2xl font-bold font-mono">{stats.streak}</div>
          <div className="text-[10px] text-muted-foreground">DAY STREAK</div>
        </div>
        <div className="glass rounded-2xl p-4 text-center">
          <Trophy className="h-6 w-6 text-primary mx-auto mb-1" />
          <div className="text-2xl font-bold font-mono">L{stats.level}</div>
          <div className="text-[10px] text-muted-foreground">LEVEL</div>
        </div>
        <div className="glass rounded-2xl p-4 text-center">
          <Zap className="h-6 w-6 text-accent mx-auto mb-1" />
          <div className="text-2xl font-bold font-mono">{stats.xp}</div>
          <div className="text-[10px] text-muted-foreground">XP</div>
        </div>
      </div>

      <div className="glass rounded-2xl p-4 space-y-2">
        <div className="flex justify-between text-xs"><span>Progress to L{stats.level + 1}</span><span className="font-mono">{stats.xp} / {stats.nextXp}</span></div>
        <div className="h-2 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-gradient-to-r from-primary to-accent" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>
        <div className="text-xs text-muted-foreground">Best streak: {stats.bestStreak} days</div>
      </div>

      <div className="glass rounded-2xl p-4">
        <h3 className="font-semibold mb-2">Recent activity</h3>
        {log.length === 0 && <p className="text-sm text-muted-foreground">Run scans, complete lessons, or check passwords to start earning XP.</p>}
        <div className="space-y-1">
          {log.slice(0, 15).map((e, i) => (
            <div key={i} className="flex justify-between text-xs border-b border-border/40 py-1.5">
              <span>{e.reason}</span>
              <span className="font-mono text-primary">+{e.amount} XP</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
