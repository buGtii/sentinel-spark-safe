import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lock, Plus, Trash2, Eye, EyeOff, Loader2, KeyRound } from "lucide-react";
import { vaultEncrypt, vaultDecrypt } from "@/lib/vault";
import { toast } from "@/hooks/use-toast";

export default function Vault() {
  const [pass, setPass] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [reveal, setReveal] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("vault_items").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setItems(data || []);
  };

  useEffect(() => { if (unlocked) load(); }, [unlocked]);

  const add = async () => {
    if (!title || !body || !pass) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const enc = await vaultEncrypt(pass, body);
      await supabase.from("vault_items").insert({ user_id: user.id, title, ciphertext: enc.ciphertext, iv: enc.iv, kind: "note" });
      setTitle(""); setBody("");
      await load();
      toast({ title: "Saved to vault" });
    } finally { setLoading(false); }
  };

  const view = async (it: any) => {
    if (reveal[it.id]) { const c = { ...reveal }; delete c[it.id]; setReveal(c); return; }
    try {
      const pt = await vaultDecrypt(pass, it.ciphertext, it.iv);
      setReveal({ ...reveal, [it.id]: pt });
    } catch { toast({ title: "Wrong passphrase", variant: "destructive" }); }
  };

  const del = async (id: string) => {
    await supabase.from("vault_items").delete().eq("id", id);
    await load();
  };

  if (!unlocked) {
    return (
      <div className="space-y-4">
        <div className="glass rounded-2xl p-6 text-center">
          <Lock className="h-10 w-10 text-primary mx-auto mb-3" />
          <h2 className="font-bold text-lg mb-1">Encrypted Cyber Vault</h2>
          <p className="text-xs text-muted-foreground mb-4">AES-256-GCM. Passphrase never leaves your device. Lose it = data gone forever.</p>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Enter vault passphrase"
            className="w-full bg-background/40 border border-border rounded-xl px-3 py-2 text-sm mb-3" />
          <button onClick={() => pass && setUnlocked(true)}
            className="w-full py-2 rounded-xl gradient-cyber text-background font-semibold text-sm flex items-center justify-center gap-2">
            <KeyRound className="h-4 w-4" /> Unlock Vault
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3"><Lock className="h-5 w-5 text-primary" /><h2 className="font-bold">Add Secret</h2></div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Bank PIN)"
          className="w-full bg-background/40 border border-border rounded-xl px-3 py-2 text-sm mb-2" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Sensitive content"
          className="w-full bg-background/40 border border-border rounded-xl px-3 py-2 text-sm" />
        <button onClick={add} disabled={loading}
          className="mt-3 w-full py-2 rounded-xl gradient-cyber text-background font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Encrypt & Save
        </button>
      </div>

      <div className="space-y-2">
        {items.map(it => (
          <div key={it.id} className="glass rounded-2xl p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium text-sm">{it.title}</div>
              <div className="flex gap-1">
                <button onClick={() => view(it)} className="p-1.5 hover:bg-secondary/60 rounded-lg">
                  {reveal[it.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button onClick={() => del(it.id)} className="p-1.5 hover:bg-destructive/20 rounded-lg">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </button>
              </div>
            </div>
            {reveal[it.id] && <div className="mt-2 text-xs font-mono bg-background/40 p-2 rounded-lg break-all">{reveal[it.id]}</div>}
          </div>
        ))}
        {!items.length && <div className="text-center text-xs text-muted-foreground py-8">No secrets yet</div>}
      </div>
    </div>
  );
}
