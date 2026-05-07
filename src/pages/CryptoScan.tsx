import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Coins, Loader2 } from "lucide-react";

export default function CryptoScan() {
  const [addr, setAddr] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const run = async () => {
    if (!addr.trim()) return;
    setLoading(true); setData(null);
    const { data: r } = await supabase.functions.invoke("intel-crypto", { body: { address: addr.trim() } });
    setLoading(false); setData(r);
  };

  const c = data?.verdict === "malicious" ? "text-destructive" : data?.verdict === "suspicious" ? "text-warning" : data?.verdict === "safe" ? "text-success" : "text-muted-foreground";

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3"><Coins className="h-5 w-5 text-primary" /><h2 className="font-bold">Crypto / Web3 Address Scanner</h2></div>
        <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="0x... / bc1... / T... / Solana"
          className="w-full bg-background/40 border border-border rounded-xl px-3 py-2 text-sm font-mono" />
        <button onClick={run} disabled={loading}
          className="mt-3 w-full py-2 rounded-xl gradient-cyber text-background font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Analyze
        </button>
      </div>
      {data && (
        <div className="space-y-3">
          <div className="glass rounded-2xl p-4">
            <div className="text-xs text-muted-foreground">CHAIN</div>
            <div className="font-bold">{data.chain}</div>
            <div className={`text-2xl font-bold mt-2 ${c}`}>{data.verdict?.toUpperCase()} · {data.risk_score}</div>
          </div>
          <div className="glass rounded-2xl p-4">
            <div className="text-xs font-bold text-primary mb-2">REASONS</div>
            <ul className="text-xs space-y-1 list-disc list-inside text-muted-foreground">
              {data.reasons?.map((r: string, i: number) => <li key={i}>{r}</li>)}
            </ul>
          </div>
          <div className="glass rounded-2xl p-4">
            <div className="text-xs font-bold text-accent mb-2">RECOMMENDATIONS</div>
            <ul className="text-xs space-y-1 list-disc list-inside text-muted-foreground">
              {data.recommendations?.map((r: string, i: number) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
