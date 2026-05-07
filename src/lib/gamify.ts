// Local-first XP, level, streak tracking for engagement.
const KEY = "cs_gamify_v1";
type State = { xp: number; lastDay: string; streak: number; bestStreak: number };

function read(): State {
  try { return JSON.parse(localStorage.getItem(KEY) || ""); } catch { return { xp: 0, lastDay: "", streak: 0, bestStreak: 0 }; }
}
function write(s: State) { localStorage.setItem(KEY, JSON.stringify(s)); }

export function getStats() {
  const s = read();
  const level = Math.floor(Math.sqrt(s.xp / 25)) + 1;
  const nextXp = (level * level) * 25;
  return { ...s, level, nextXp };
}

export function addXp(amount: number, reason?: string) {
  const s = read();
  const today = new Date().toISOString().slice(0, 10);
  if (s.lastDay !== today) {
    const yest = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    s.streak = s.lastDay === yest ? s.streak + 1 : 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    s.lastDay = today;
  }
  s.xp += amount;
  write(s);
  if (reason) {
    try {
      const log = JSON.parse(localStorage.getItem("cs_xp_log") || "[]");
      log.unshift({ ts: Date.now(), amount, reason });
      localStorage.setItem("cs_xp_log", JSON.stringify(log.slice(0, 50)));
    } catch {}
  }
  return getStats();
}

export function getLog(): { ts: number; amount: number; reason: string }[] {
  try { return JSON.parse(localStorage.getItem("cs_xp_log") || "[]"); } catch { return []; }
}
