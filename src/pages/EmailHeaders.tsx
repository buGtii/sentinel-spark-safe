import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Loader2 } from "lucide-react";

export default function EmailHeaders() {
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const run = async () => {
    if (!raw.trim()) return;
    setLoading(true); setData(null);
    const { data: r } = await supabase.functions.invoke("intel-email", { body: { headers: raw } });
    setLoading(false);
    setData(r);
  };

  const verdictColor = data?.verdict === "malicious" ? "text-destructive" : data?.verdict === "suspicious" ? "text-warning" : "text-success";

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3"><Mail className="h-5 w-5 text-primary" /><h2 className="font-bold">Email Header Analyzer</h2></div>
        <p className="text-xs text-muted-foreground mb-2">Paste raw email headers (View source / Show original).</p>
        <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={8}
          placeholder="Received: from ...&#10;From: ...&#10;Authentication-Results: ..."
          className="w-full bg-background/40 border border-border rounded-xl px-3 py-2 text-xs font-mono" />
        <button onClick={run} disabled={loading}
          className="mt-3 w-full py-2 rounded-xl gradient-cyber text-background font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Analyze
        </button>
      </div>

      {data && (
        <div className="space-y-3">
          <div className="glass rounded-2xl p-4">
            <div className="text-xs text-muted-foreground">VERDICT</div>
            <div className={`text-2xl font-bold ${verdictColor}`}>{data.verdict?.toUpperCase()} · {data.score}</div>
          </div>
          <div className="glass rounded-2xl p-4 grid grid-cols-3 gap-3 text-center text-xs">
            {(["spf", "dkim", "dmarc"] as const).map(k => (
              <div key={k}>
                <div className="text-muted-foreground uppercase">{k}</div>
                <div className={`font-bold mt-1 ${data[k] === "pass" ? "text-success" : data[k] === "fail" ? "text-destructive" : "text-warning"}`}>{data[k]}</div>
              </div>
            ))}
          </div>
          <div className="glass rounded-2xl p-4 text-xs space-y-1 font-mono">
            <div><span className="text-muted-foreground">From:</span> {data.from}</div>
            <div><span className="text-muted-foreground">Return-Path:</span> {data.returnPath}</div>
            <div><span className="text-muted-foreground">Reply-To:</span> {data.replyTo}</div>
            {data.mismatch && <div className="text-warning">⚠ From / Return-Path domain mismatch</div>}
          </div>
          <div className="glass rounded-2xl p-4">
            <div className="text-xs font-bold text-primary mb-2">RELAY HOPS ({data.hops.length})</div>
            <div className="space-y-2 text-[11px] font-mono">
              {data.hops.map((h: any, i: number) => (
                <div key={i} className="bg-background/40 p-2 rounded-lg">
                  <div>#{i + 1} {h.from} {h.ip && `[${h.ip}]`}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
