import { useEffect, useState } from "react";
import { RefreshCw, Radio, ExternalLink, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Source = { name: string; count: number; items: { url: string; threat: string; date: string }[] };

export default function ThreatFeeds() {
  const [data, setData] = useState<{ sources: Source[]; fetchedAt: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");

  async function load() {
    setLoading(true);
    try {
      const { data: d } = await supabase.functions.invoke("threat-feeds");
      setData(d);
    } catch { toast.error("Feeds unavailable"); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-mono text-primary">LIVE THREAT FEEDS</p>
          <h1 className="text-2xl font-bold">Aggregated indicators</h1>
          <p className="text-sm text-muted-foreground">Public feeds from URLhaus & OpenPhish, refreshed on demand.</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg hover:bg-secondary/60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-primary" : ""}`} /></button>
      </header>

      <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by domain or keyword..." className="w-full bg-background/40 border border-border rounded-xl px-3 py-2 text-sm" />

      {!data && loading && <p className="text-sm text-muted-foreground text-center py-8">Pulling feeds...</p>}
      {data && (
        <div className="space-y-4">
          <div className="text-xs text-muted-foreground">Updated {new Date(data.fetchedAt).toLocaleString()}</div>
          {data.sources.map(s => {
            const items = s.items.filter(i => i.url.toLowerCase().includes(filter.toLowerCase()));
            return (
              <div key={s.name} className="glass rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2"><Radio className="h-4 w-4 text-primary" /><span className="font-semibold text-sm">{s.name}</span><span className="text-xs text-muted-foreground">· {items.length}/{s.count}</span></div>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {items.slice(0, 25).map((it, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs border-b border-border/40 py-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-destructive/15 text-destructive font-mono text-[9px] shrink-0">{it.threat}</span>
                      <span className="truncate font-mono flex-1">{it.url}</span>
                      <button onClick={() => { navigator.clipboard.writeText(it.url); toast.success("Copied"); }} className="text-muted-foreground hover:text-primary"><Copy className="h-3 w-3" /></button>
                      <a href={it.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary"><ExternalLink className="h-3 w-3" /></a>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
