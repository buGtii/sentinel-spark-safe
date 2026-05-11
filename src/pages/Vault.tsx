import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lock, Plus, Trash2, Eye, EyeOff, Loader2, KeyRound, Upload, FileText, Image as ImageIcon, Search, Download, ShieldCheck } from "lucide-react";
import { vaultEncrypt, vaultDecrypt } from "@/lib/vault";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

const CATEGORIES = ["general", "evidence", "documents", "images", "recovery"] as const;
type Category = typeof CATEGORIES[number];

async function encryptBytes(pass: string, bytes: Uint8Array) {
  const enc = new TextEncoder();
  const salt = enc.encode("cybersmart-vault-v1");
  const km = await crypto.subtle.importKey("raw", enc.encode(pass) as BufferSource, "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 200_000, hash: "SHA-256" },
    km, { name: "AES-GCM", length: 256 }, false, ["encrypt","decrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, bytes as BufferSource);
  return { ct: new Uint8Array(ct), iv };
}
async function decryptBytes(pass: string, ct: Uint8Array, iv: Uint8Array) {
  const enc = new TextEncoder();
  const salt = enc.encode("cybersmart-vault-v1");
  const km = await crypto.subtle.importKey("raw", enc.encode(pass) as BufferSource, "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 200_000, hash: "SHA-256" },
    km, { name: "AES-GCM", length: 256 }, false, ["encrypt","decrypt"],
  );
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ct as BufferSource));
}

export default function Vault() {
  const [pass, setPass] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [reveal, setReveal] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<Category>("general");
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("vault_items").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setItems(data || []);
  };
  useEffect(() => { if (unlocked) load(); }, [unlocked]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(i => !q || i.title?.toLowerCase().includes(q) || i.category?.toLowerCase().includes(q));
  }, [items, search]);

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const it of filtered) {
      const k = it.category || "general";
      (g[k] ||= []).push(it);
    }
    return g;
  }, [filtered]);

  const add = async () => {
    if (!title || !body || !pass) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const enc = await vaultEncrypt(pass, body);
      await supabase.from("vault_items").insert({ user_id: user.id, title, ciphertext: enc.ciphertext, iv: enc.iv, kind: "note", category });
      setTitle(""); setBody("");
      await load();
      toast({ title: "Encrypted & saved" });
    } finally { setLoading(false); }
  };

  const uploadFile = async (file: File) => {
    if (!pass) { toast({ title: "Unlock vault first", variant: "destructive" }); return; }
    if (file.size > 15 * 1024 * 1024) { toast({ title: "File too large", description: "Max 15 MB", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { ct, iv } = await encryptBytes(pass, bytes);
      const path = `${user.id}/${crypto.randomUUID()}.bin`;
      const { error: upErr } = await supabase.storage.from("vault").upload(path, ct, { contentType: "application/octet-stream" });
      if (upErr) throw upErr;
      const ivB64 = btoa(String.fromCharCode(...iv));
      const guessed: Category = file.type.startsWith("image/") ? "images" : "documents";
      await supabase.from("vault_items").insert({
        user_id: user.id, title: file.name, ciphertext: "", iv: ivB64,
        kind: file.type.startsWith("image/") ? "image" : "file",
        category: guessed, mime_type: file.type, size_bytes: file.size, storage_path: path,
      });
      await load();
      toast({ title: "File encrypted & uploaded" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message || String(e), variant: "destructive" });
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const view = async (it: any) => {
    if (reveal[it.id]) { const c = { ...reveal }; delete c[it.id]; setReveal(c); return; }
    if (it.storage_path) {
      try {
        const { data, error } = await supabase.storage.from("vault").download(it.storage_path);
        if (error || !data) throw error || new Error("download failed");
        const ct = new Uint8Array(await data.arrayBuffer());
        const iv = Uint8Array.from(atob(it.iv), c => c.charCodeAt(0));
        const pt = await decryptBytes(pass, ct, iv);
        const blob = new Blob([pt as unknown as ArrayBuffer], { type: it.mime_type || "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = it.title; a.click();
        URL.revokeObjectURL(url);
      } catch { toast({ title: "Wrong passphrase or download failed", variant: "destructive" }); }
      return;
    }
    try {
      const pt = await vaultDecrypt(pass, it.ciphertext, it.iv);
      setReveal({ ...reveal, [it.id]: pt });
    } catch { toast({ title: "Wrong passphrase", variant: "destructive" }); }
  };

  const del = async (it: any) => {
    if (it.storage_path) {
      await supabase.storage.from("vault").remove([it.storage_path]);
    }
    await supabase.from("vault_items").delete().eq("id", it.id);
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
          <div className="mt-3 text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Zero-knowledge: keys derived on your device
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2"><Lock className="h-5 w-5 text-primary" /><h2 className="font-bold">Add to vault</h2></div>
        <div className="grid grid-cols-2 gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title"
            className="bg-background/40 border border-border rounded-xl px-3 py-2 text-sm" />
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)}
            className="bg-background/40 border border-border rounded-xl px-3 py-2 text-sm">
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Sensitive content (notes, codes, evidence text)"
          className="w-full bg-background/40 border border-border rounded-xl px-3 py-2 text-sm" />
        <div className="flex gap-2">
          <Button onClick={add} disabled={loading || !title || !body} className="flex-1 gradient-cyber text-background font-semibold">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />} Encrypt note
          </Button>
          <input ref={fileRef} type="file" hidden onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0])} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />} File
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-emerald-400" /> Encrypted with AES-256-GCM on this device before upload</p>
      </div>

      <div className="glass rounded-xl p-2 flex items-center gap-2">
        <Search className="h-4 w-4 ml-2 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vault" className="flex-1 bg-transparent text-sm py-2 outline-none" />
      </div>

      {Object.entries(grouped).map(([cat, list]) => (
        <div key={cat} className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground px-1">{cat} · {list.length}</div>
          {list.map(it => {
            const isFile = !!it.storage_path;
            const Icon = it.kind === "image" ? ImageIcon : isFile ? FileText : Lock;
            return (
              <div key={it.id} className="glass rounded-2xl p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{it.title}</div>
                      {it.size_bytes && <div className="text-[11px] text-muted-foreground">{(it.size_bytes/1024).toFixed(1)} KB · {it.mime_type}</div>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => view(it)} className="p-1.5 hover:bg-secondary/60 rounded-lg" aria-label={isFile ? "Download" : "Reveal"}>
                      {isFile ? <Download className="h-4 w-4" /> : (reveal[it.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />)}
                    </button>
                    <button onClick={() => del(it)} className="p-1.5 hover:bg-destructive/20 rounded-lg" aria-label="Delete">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </button>
                  </div>
                </div>
                {reveal[it.id] && <div className="mt-2 text-xs font-mono bg-background/40 p-2 rounded-lg break-all whitespace-pre-wrap">{reveal[it.id]}</div>}
              </div>
            );
          })}
        </div>
      ))}
      {!filtered.length && <div className="text-center text-xs text-muted-foreground py-8">Vault is empty</div>}
    </div>
  );
}
