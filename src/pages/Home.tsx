import { Link } from "react-router-dom";
import { Link2, MessageSquare, FileSearch, Globe, Activity, Cpu, Sparkles, QrCode, Eye, Users, GraduationCap, Target, ShieldCheck, Lock, Mail, ShieldAlert, Coins, KeyRound, KeySquare, Bookmark, Flame, BookOpen, Search, FileCode, Radio } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const cards = [
  { to: "/url", icon: Link2, title: "URL Scanner", desc: "Detect phishing links", grad: "from-cyan-500/20 to-blue-500/20" },
  { to: "/message", icon: MessageSquare, title: "Message AI", desc: "Gemini analysis of SMS/email", grad: "from-purple-500/20 to-pink-500/20" },
  { to: "/file", icon: FileSearch, title: "File Hash", desc: "VirusTotal lookup", grad: "from-emerald-500/20 to-teal-500/20" },
  { to: "/ip", icon: Globe, title: "IP Lookup", desc: "Reputation check", grad: "from-amber-500/20 to-orange-500/20" },
];

export default function Home() {
  const [stats, setStats] = useState({ total: 0, malicious: 0 });
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("scans").select("verdict").eq("user_id", user.id);
      if (data) setStats({
        total: data.length,
        malicious: data.filter(d => d.verdict === "malicious" || d.verdict === "suspicious").length,
      });
    })();
  }, []);

  return (
    <div className="space-y-6">
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full gradient-cyber opacity-20 blur-3xl" />
        <p className="text-xs font-mono text-primary mb-1">SECURITY STATUS</p>
        <h2 className="text-3xl font-bold mb-1">All systems <span className="text-gradient-cyber">monitoring</span></h2>
        <p className="text-sm text-muted-foreground">Real-time AI + blockchain-verified scanning.</p>
        <div className="grid grid-cols-2 gap-3 mt-5">
          <div className="bg-background/40 rounded-xl p-3 border border-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Activity className="h-3 w-3" /> Total scans</div>
            <div className="text-2xl font-mono font-bold mt-1">{stats.total}</div>
          </div>
          <div className="bg-background/40 rounded-xl p-3 border border-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Cpu className="h-3 w-3" /> Threats blocked</div>
            <div className="text-2xl font-mono font-bold mt-1 text-warning">{stats.malicious}</div>
          </div>
        </div>
      </motion.section>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Link to="/safe-link"
          className="block glass rounded-2xl p-4 border border-primary/40 bg-gradient-to-r from-primary/15 to-accent/10 hover:ring-2 hover:ring-primary/50 transition-all">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl gradient-cyber grid place-items-center glow shrink-0">
              <ShieldCheck className="h-6 w-6 text-background" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold">Safe Link Guard</div>
              <div className="text-xs text-muted-foreground">Scan any link before opening — share or paste here.</div>
            </div>
            <span className="text-[10px] font-mono text-primary">OPEN →</span>
          </div>
        </Link>
      </motion.div>

      <section className="grid grid-cols-2 gap-3">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <motion.div key={c.to}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}>
              <Link to={c.to}
                className={`block glass rounded-2xl p-4 hover:ring-2 hover:ring-primary/50 transition-all bg-gradient-to-br ${c.grad}`}>
                <Icon className="h-6 w-6 text-primary mb-2" />
                <div className="font-semibold">{c.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{c.desc}</div>
              </Link>
            </motion.div>
          );
        })}
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold flex items-center gap-2"><GraduationCap className="h-4 w-4 text-primary" /> Learn & Train</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { to: "/learn", icon: GraduationCap, title: "Learn Mode", desc: "AI-guided lessons & quizzes", grad: "from-fuchsia-500/20 to-purple-500/20" },
            { to: "/phishing-sim", icon: Target, title: "Phishing Sim", desc: "Spot the scam challenges", grad: "from-rose-500/20 to-orange-500/20" },
            { to: "/risk", icon: ShieldCheck, title: "Risk Score", desc: "Your cyber posture", grad: "from-emerald-500/20 to-cyan-500/20" },
            { to: "/copilot", icon: Sparkles, title: "AI Copilot", desc: "Ask anything", grad: "from-blue-500/20 to-indigo-500/20" },
            { to: "/streaks", icon: Flame, title: "Streaks & XP", desc: "Daily progression", grad: "from-amber-500/20 to-red-500/20" },
            { to: "/scam-story", icon: BookOpen, title: "Scam Story", desc: "Daily briefing", grad: "from-violet-500/20 to-fuchsia-500/20" },
          ].map((c, i) => {
            const Icon = c.icon;
            return (
              <motion.div key={c.to} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Link to={c.to} className={`block glass rounded-2xl p-4 hover:ring-2 hover:ring-primary/50 transition-all bg-gradient-to-br ${c.grad}`}>
                  <Icon className="h-6 w-6 text-primary mb-2" />
                  <div className="font-semibold text-sm">{c.title}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{c.desc}</div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Advanced Tools</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { to: "/soc", icon: Activity, title: "SOC Dashboard", desc: "Live telemetry" },
            { to: "/qr", icon: QrCode, title: "QR Scanner", desc: "Decode hidden URLs" },
            { to: "/screenshot", icon: Eye, title: "Screenshot AI", desc: "Vision phishing" },
            { to: "/domain", icon: Globe, title: "Domain Intel", desc: "DNS / WHOIS" },
            { to: "/email-headers", icon: Mail, title: "Email Headers", desc: "SPF / DKIM / DMARC" },
            { to: "/breach", icon: ShieldAlert, title: "Breach Check", desc: "Password leaks" },
            { to: "/crypto", icon: Coins, title: "Crypto Scan", desc: "Wallet risk" },
            { to: "/vault", icon: Lock, title: "Vault", desc: "Encrypted secrets" },
            { to: "/community", icon: Users, title: "Community", desc: "Threat reports" },
            { to: "/password-lab", icon: KeyRound, title: "Password Lab", desc: "Strength + breach" },
            { to: "/totp", icon: KeySquare, title: "2FA Codes", desc: "Encrypted authenticator" },
            { to: "/watchlist", icon: Bookmark, title: "Watchlist", desc: "Pinned URL monitor" },
            { to: "/ioc-hunter", icon: Search, title: "IOC Hunter", desc: "Parse logs for IOCs" },
            { to: "/yara", icon: FileCode, title: "YARA Builder", desc: "Generate rules" },
            { to: "/threat-feeds", icon: Radio, title: "Threat Feeds", desc: "Live indicators" },
          ].map((c, i) => {
            const Icon = c.icon;
            return (
              <motion.div key={c.to} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Link to={c.to} className="block glass rounded-2xl p-4 hover:ring-2 hover:ring-primary/50 transition-all">
                  <Icon className="h-6 w-6 text-accent mb-2" />
                  <div className="font-semibold text-sm">{c.title}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{c.desc}</div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
