import { useEffect, useState } from "react";
import { Plus, Trash2, RefreshCw, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { addXp } from "@/lib/gamify";

type Item = { id: string; url: string; lastVerdict?: string; lastChecked?: number; note?: string };

export default function Watchlist() {
  const [items, setItems] = useState<Item[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    try { setItems(JSON.parse(localStorage.getItem("cs_watchlist_v1") || "[]")); } catch {}
  }, []);
  function save(next: Item[]) { setItems(next); localStorage.setItem("cs_watchlist_v1", JSON.stringify(next)); }

  function add() {
    if (!url) return;
    save([...items, { id: crypto.randomUUID(), url }]);
    setUrl("");
  }

  async function rescan(it: Item) {
    setBusy(it.id);
    try {
      const { data } = await supabase.functions.invoke("scan-url", { body: { url: it.url } });
      const next = items.map(x => x.id === it.id ? { ...x, lastVerdict: data?.verdict || "unknown", lastChecked: Date.now() } : x);
      save(next);
      addXp(3, "Watchlist rescan");
    } catch { toast.error("Scan failed"); } finally { setBusy(null); }
  }

  async function rescanAll() {
    for (const it of items) await rescan(it);
    toast.success("Watchlist refreshed");
  }

  const tone = (v?: string) => v === "malicious" ? "text-destructive" : v === "suspicious" ? "text-warning" : v === "safe" ? "text-success" : "text-muted-foreground";

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs font-mono text-primary">REPUTATION WATCHLIST</p>
        <h1 className="text-2xl font-bold">Pinned URL monitoring</h1>
        <p className="text-sm text-muted-foreground">Re-scan saved domains on demand. Future: scheduled background checks.</p>
      </header>

      <div className="glass rounded-2xl p-4 space-y-2">
        <div className="flex gap-2">
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com" className="flex-1 bg-background/40 border border-border rounded-xl px-3 py-2" />
          <button onClick={add} className="bg-primary text-primary-foreground rounded-xl px-3 font-semibold flex items-center gap-1"><Plus className="h-4 w-4" /></button>
        </div>
        {items.length > 0 && (
          <button onClick={rescanAll} className="w-full text-sm border border-border rounded-xl py-2 flex items-center justify-center gap-1"><RefreshCw className="h-3 w-3" /> Re-scan all</button>
        )}
      </div>

      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No URLs pinned yet.</p>}
        {items.map(it => (
          <div key={it.id} className="glass rounded-2xl p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-mono truncate">{it.url}</div>
              <div className={`text-xs ${tone(it.lastVerdict)}`}>
                {it.lastVerdict ? `${it.lastVerdict.toUpperCase()} · ${new Date(it.lastChecked!).toLocaleString()}` : "Never scanned"}
              </div>
            </div>
            <a href={it.url} target="_blank" rel="noreferrer" className="p-2 rounded-lg hover:bg-secondary/60"><ExternalLink className="h-4 w-4" /></a>
            <button onClick={() => rescan(it)} disabled={busy === it.id} className="p-2 rounded-lg hover:bg-secondary/60"><RefreshCw className={`h-4 w-4 ${busy === it.id ? "animate-spin text-primary" : ""}`} /></button>
            <button onClick={() => save(items.filter(x => x.id !== it.id))} className="p-2 rounded-lg hover:bg-secondary/60"><Trash2 className="h-4 w-4 text-destructive" /></button>
          </div>
        ))}
      </div>
      <Link to="/url" className="block text-xs text-center text-primary">Run a one-off scan →</Link>
    </div>
  );
}
