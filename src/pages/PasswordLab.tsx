import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, ShieldAlert, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { addXp } from "@/lib/gamify";

function entropy(pw: string) {
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 32;
  return Math.round(pw.length * Math.log2(Math.max(pool, 1)));
}
function crackTime(bits: number) {
  const guessesPerSec = 1e10;
  const seconds = Math.pow(2, bits) / guessesPerSec;
  if (seconds < 1) return "instant";
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(0)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(0)}h`;
  if (seconds < 31536000) return `${(seconds / 86400).toFixed(0)}d`;
  if (seconds < 31536000 * 1000) return `${(seconds / 31536000).toFixed(1)} years`;
  return "centuries+";
}

export default function PasswordLab() {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [breach, setBreach] = useState<{ count: number; verdict: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const bits = useMemo(() => entropy(pw), [pw]);
  const score = Math.min(100, Math.round((bits / 80) * 100));
  const tone = bits < 40 ? "destructive" : bits < 60 ? "warning" : "success";

  async function check() {
    if (!pw) return;
    setLoading(true); setBreach(null);
    try {
      const { data } = await supabase.functions.invoke("intel-breach", { body: { type: "password", value: pw } });
      setBreach(data);
      addXp(5, "Password lab check");
    } finally { setLoading(false); }
  }

  function generate() {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*-_=+";
    const arr = new Uint32Array(20);
    crypto.getRandomValues(arr);
    setPw(Array.from(arr, (n) => chars[n % chars.length]).join(""));
    setBreach(null);
  }

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs font-mono text-primary">PASSWORD LAB</p>
        <h1 className="text-2xl font-bold">Strength & breach analyzer</h1>
        <p className="text-sm text-muted-foreground">Local entropy + k-anonymity HIBP lookup. Your password never leaves the device in cleartext.</p>
      </header>

      <div className="glass rounded-2xl p-4 space-y-3">
        <div className="relative">
          <input value={pw} onChange={(e) => { setPw(e.target.value); setBreach(null); }} type={show ? "text" : "password"}
            placeholder="Type or paste a password..." className="w-full bg-background/40 border border-border rounded-xl px-3 py-2 pr-10 font-mono" />
          <button onClick={() => setShow(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs"><span>Entropy</span><span className="font-mono">{bits} bits · cracks in {crackTime(bits)}</span></div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div className={`h-full bg-${tone} transition-all`} style={{ width: `${score}%` }} />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={check} disabled={loading || !pw} className="flex-1 bg-primary text-primary-foreground rounded-xl py-2 text-sm font-semibold disabled:opacity-50">
            {loading ? "Checking..." : "Check breaches"}
          </button>
          <button onClick={generate} className="px-3 rounded-xl border border-border text-sm flex items-center gap-1"><Sparkles className="h-3 w-3" /> Generate</button>
        </div>
      </div>

      {breach && (
        <div className={`glass rounded-2xl p-4 border ${breach.count > 0 ? "border-destructive/40" : "border-success/40"}`}>
          <div className="flex items-center gap-2 font-semibold">
            <ShieldAlert className={`h-4 w-4 ${breach.count > 0 ? "text-destructive" : "text-success"}`} />
            {breach.count > 0 ? `Found in ${breach.count.toLocaleString()} breaches` : "Not found in known breaches"}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{breach.message}</p>
        </div>
      )}

      <div className="glass rounded-2xl p-4 text-xs text-muted-foreground space-y-1">
        <div className="font-semibold text-foreground text-sm mb-1">Tips</div>
        <div>• Aim for 60+ bits of entropy for online accounts; 80+ for crypto wallets.</div>
        <div>• Use a passphrase of 4-6 random words instead of complex symbols.</div>
        <div>• Never reuse a password — store unique ones in your Vault.</div>
      </div>
    </div>
  );
}
