import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Shield, Link2, MessageSquare, FileSearch, Globe, History, Settings, LogOut, Menu, X, Sparkles, QrCode, Eye, Users, Activity, GraduationCap, Target, Lock, Mail, ShieldAlert, Coins, ShieldCheck, KeyRound, KeySquare, Bookmark, Flame, BookOpen, Search, FileCode, Radio } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { getChainStatus, type ChainStatus } from "@/lib/blockchain";

const tabs = [
  { to: "/", icon: Shield, label: "Home" },
  { to: "/url", icon: Link2, label: "URL" },
  { to: "/message", icon: MessageSquare, label: "Msg" },
  { to: "/file", icon: FileSearch, label: "File" },
  { to: "/ip", icon: Globe, label: "IP" },
  { to: "/history", icon: History, label: "Log" },
];

const moreItems = [
  { to: "/safe-link", icon: ShieldCheck, label: "Safe Link Guard", desc: "Scan any link before opening" },
  { to: "/copilot", icon: Sparkles, label: "AI Copilot", desc: "Conversational security expert" },
  { to: "/learn", icon: GraduationCap, label: "Learn Cybersecurity", desc: "AI lessons + quizzes" },
  { to: "/phishing-sim", icon: Target, label: "Phishing Simulator", desc: "Train your detection skills" },
  { to: "/risk", icon: ShieldCheck, label: "Human Risk Score", desc: "Your personal cyber score" },
  { to: "/soc", icon: Activity, label: "SOC Dashboard", desc: "Live telemetry & charts" },
  { to: "/qr", icon: QrCode, label: "QR Scanner", desc: "Decode & analyze QR codes" },
  { to: "/screenshot", icon: Eye, label: "Screenshot Scan", desc: "AI vision phishing detection" },
  { to: "/domain", icon: Globe, label: "DNS / WHOIS", desc: "Domain intelligence" },
  { to: "/email-headers", icon: Mail, label: "Email Headers", desc: "SPF / DKIM / DMARC analyzer" },
  { to: "/breach", icon: ShieldAlert, label: "Breach Check", desc: "Pwned password lookup" },
  { to: "/crypto", icon: Coins, label: "Crypto Scanner", desc: "Wallet address risk" },
  { to: "/vault", icon: Lock, label: "Encrypted Vault", desc: "AES-256 secret storage" },
  { to: "/community", icon: Users, label: "Community", desc: "Shared threat intelligence" },
  { to: "/password-lab", icon: KeyRound, label: "Password Lab", desc: "Entropy + breach analyzer" },
  { to: "/totp", icon: KeySquare, label: "2FA Authenticator", desc: "Encrypted TOTP vault" },
  { to: "/watchlist", icon: Bookmark, label: "URL Watchlist", desc: "Pinned domain monitoring" },
  { to: "/streaks", icon: Flame, label: "Streaks & XP", desc: "Daily security habit tracker" },
  { to: "/scam-story", icon: BookOpen, label: "Scam Story", desc: "Daily AI threat briefing" },
  { to: "/ioc-hunter", icon: Search, label: "IOC Hunter", desc: "Extract indicators from logs" },
  { to: "/yara", icon: FileCode, label: "YARA Builder", desc: "Generate detection rules" },
  { to: "/threat-feeds", icon: Radio, label: "Threat Feeds", desc: "Live URLhaus & OpenPhish" },
  { to: "/settings", icon: Settings, label: "Settings", desc: "Preferences & blockchain" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [chain, setChain] = useState<ChainStatus | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    getChainStatus().then(setChain);
    const t = setInterval(() => getChainStatus().then(setChain), 15000);
    return () => clearInterval(t);
  }, [loc.pathname]);

  useEffect(() => { setMenuOpen(false); }, [loc.pathname]);

  return (
    <div className="min-h-screen flex flex-col text-foreground">
      <header
        className="glass sticky top-0 z-30 px-4 flex items-center justify-between"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
          paddingBottom: "0.75rem",
          paddingLeft: "calc(env(safe-area-inset-left, 0px) + 1rem)",
          paddingRight: "calc(env(safe-area-inset-right, 0px) + 1rem)",
        }}
      >
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg gradient-cyber grid place-items-center glow">
            <Shield className="h-5 w-5 text-background" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none text-gradient-cyber">CyberSmart</h1>
            <p className="text-[10px] text-muted-foreground font-mono">AI · BLOCKCHAIN · SECURITY</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {chain && (
            <NavLink
              to="/settings"
              title={chain.reason}
              className={`hidden sm:flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-full ${
                chain.ready ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${chain.ready ? "bg-success" : "bg-warning"} animate-pulse`} />
              {chain.mode === "real" ? "ON-CHAIN" : "MOCK"}
            </NavLink>
          )}
          <button onClick={() => setMenuOpen(true)} className="p-2 rounded-lg hover:bg-secondary/60" title="More features">
            <Menu className="h-4 w-4 text-muted-foreground" />
          </button>
          {user && (
            <button onClick={() => signOut()} className="p-2 rounded-lg hover:bg-secondary/60">
              <LogOut className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
              onClick={() => setMenuOpen(false)} />
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="fixed top-0 right-0 bottom-0 w-[85%] max-w-sm glass z-50 overflow-y-auto"
              style={{
                paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem)",
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
              }}
            >
              <div className="px-4 flex items-center justify-between mb-4">
                <h2 className="font-bold text-gradient-cyber">All Features</h2>
                <button onClick={() => setMenuOpen(false)} className="p-2"><X className="h-4 w-4" /></button>
              </div>
              {chain && (
                <div className="px-4 mb-3">
                  <div className={`text-[10px] font-mono px-2 py-1 rounded-full inline-flex items-center gap-1 ${
                    chain.ready ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${chain.ready ? "bg-success" : "bg-warning"} animate-pulse`} />
                    {chain.mode === "real" ? "ON-CHAIN ACTIVE" : "MOCK LEDGER"}
                  </div>
                </div>
              )}
              <div className="px-2 space-y-1">
                {moreItems.map(it => {
                  const Icon = it.icon;
                  return (
                    <button key={it.to} onClick={() => nav(it.to)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/50 text-left">
                      <div className="h-9 w-9 rounded-lg gradient-cyber grid place-items-center glow shrink-0">
                        <Icon className="h-4 w-4 text-background" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{it.label}</div>
                        <div className="text-[10px] text-muted-foreground">{it.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main
        className="flex-1 p-4 max-w-2xl w-full mx-auto"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6rem)" }}
      >
        <motion.div
          key={loc.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >{children}</motion.div>
      </main>

      <nav
        className="fixed bottom-0 inset-x-0 glass border-t border-primary/20 z-30"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="max-w-2xl mx-auto grid grid-cols-6">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.to === "/"}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`
                }
              >
                <Icon className="h-5 w-5" />
                <span>{t.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
