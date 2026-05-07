import { useEffect, useState } from "react";
import { Plus, Trash2, Copy, KeyRound } from "lucide-react";
import { totp, secondsLeft } from "@/lib/totp";
import { vaultEncrypt, vaultDecrypt } from "@/lib/vault";
import { toast } from "sonner";

type Item = { id: string; label: string; ct: string; iv: string };

export default function Totp() {
  const [pass, setPass] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [tick, setTick] = useState(secondsLeft());
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState("");

  useEffect(() => {
    try { setItems(JSON.parse(localStorage.getItem("cs_totp_v1") || "[]")); } catch {}
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    const update = async () => {
      setTick(secondsLeft());
      const next: Record<string, string> = {};
      for (const it of items) {
        try {
          const sec = await vaultDecrypt(pass, it.ct, it.iv);
          next[it.id] = await totp(sec);
        } catch { next[it.id] = "------"; }
      }
      setCodes(next);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [items, pass, unlocked]);

  async function unlock() {
    if (!pass) return;
    if (items.length === 0) { setUnlocked(true); return; }
    try { await vaultDecrypt(pass, items[0].ct, items[0].iv); setUnlocked(true); }
    catch { toast.error("Wrong passphrase"); }
  }

  async function add() {
    if (!label || !secret) return;
    try {
      await totp(secret); // validate
      const enc = await vaultEncrypt(pass, secret.replace(/\s+/g, ""));
      const next = [...items, { id: crypto.randomUUID(), label, ct: enc.ciphertext, iv: enc.iv }];
      setItems(next); localStorage.setItem("cs_totp_v1", JSON.stringify(next));
      setLabel(""); setSecret(""); setAdding(false);
      toast.success("Token added");
    } catch { toast.error("Invalid Base32 secret"); }
  }

  function remove(id: string) {
    const next = items.filter(i => i.id !== id);
    setItems(next); localStorage.setItem("cs_totp_v1", JSON.stringify(next));
  }

  if (!unlocked) {
    return (
      <div className="space-y-4">
        <header>
          <p className="text-xs font-mono text-primary">2FA AUTHENTICATOR</p>
          <h1 className="text-2xl font-bold">Encrypted TOTP vault</h1>
          <p className="text-sm text-muted-foreground">RFC 6238 codes generated locally; secrets encrypted with AES-256.</p>
        </header>
        <div className="glass rounded-2xl p-4 space-y-3">
          <input type="password" value={pass} onChange={e => setPass(e.target.value)}
            placeholder="Vault passphrase" className="w-full bg-background/40 border border-border rounded-xl px-3 py-2" />
          <button onClick={unlock} className="w-full bg-primary text-primary-foreground rounded-xl py-2 font-semibold">
            {items.length === 0 ? "Set up" : "Unlock"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-mono text-primary">2FA AUTHENTICATOR</p>
          <h1 className="text-2xl font-bold">Your codes</h1>
        </div>
        <button onClick={() => setAdding(a => !a)} className="bg-primary text-primary-foreground rounded-xl px-3 py-2 text-sm font-semibold flex items-center gap-1">
          <Plus className="h-4 w-4" /> Add
        </button>
      </header>

      {adding && (
        <div className="glass rounded-2xl p-4 space-y-2">
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (e.g. GitHub)" className="w-full bg-background/40 border border-border rounded-xl px-3 py-2" />
          <input value={secret} onChange={e => setSecret(e.target.value)} placeholder="Base32 secret (e.g. JBSWY3DPEHPK3PXP)" className="w-full bg-background/40 border border-border rounded-xl px-3 py-2 font-mono" />
          <button onClick={add} className="w-full bg-primary text-primary-foreground rounded-xl py-2 font-semibold">Save</button>
        </div>
      )}

      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No tokens yet. Add your first one.</p>}
        {items.map(it => (
          <div key={it.id} className="glass rounded-2xl p-4 flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground truncate">{it.label}</div>
              <div className="text-3xl font-mono tracking-widest text-primary">{codes[it.id]?.replace(/(\d{3})(\d{3})/, "$1 $2") || "•••• ••"}</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative h-10 w-10">
                <svg className="h-10 w-10 -rotate-90"><circle cx="20" cy="20" r="16" strokeWidth="3" className="stroke-secondary fill-none" /><circle cx="20" cy="20" r="16" strokeWidth="3" className="stroke-primary fill-none" strokeDasharray={2 * Math.PI * 16} strokeDashoffset={2 * Math.PI * 16 * (1 - tick / 30)} /></svg>
                <div className="absolute inset-0 grid place-items-center text-[10px] font-mono">{tick}</div>
              </div>
              <button onClick={() => { navigator.clipboard.writeText(codes[it.id] || ""); toast.success("Copied"); }} className="p-2 rounded-lg hover:bg-secondary/60"><Copy className="h-4 w-4" /></button>
              <button onClick={() => remove(it.id)} className="p-2 rounded-lg hover:bg-secondary/60"><Trash2 className="h-4 w-4 text-destructive" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
