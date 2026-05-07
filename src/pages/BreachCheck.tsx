import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, Loader2 } from "lucide-react";

export default function BreachCheck() {
  const [pwd, setPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const run = async () => {
    if (!pwd) return;
    setLoading(true); setData(null);
    const { data: r } = await supabase.functions.invoke("intel-breach", { body: { type: "password", value: pwd } });
    setLoading(false); setData(r);
  };

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3"><ShieldAlert className="h-5 w-5 text-primary" /><h2 className="font-bold">Password Breach Check</h2></div>
        <p className="text-xs text-muted-foreground mb-2">Uses k-anonymity (HIBP). Your password never leaves your device — only the first 5 chars of its SHA-1 hash are sent.</p>
        <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Enter password to check"
          className="w-full bg-background/40 border border-border rounded-xl px-3 py-2 text-sm" />
        <button onClick={run} disabled={loading}
          className="mt-3 w-full py-2 rounded-xl gradient-cyber text-background font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Check
        </button>
      </div>
      {data && (
        <div className="glass rounded-2xl p-5 text-center">
          <div className={`text-3xl font-bold ${data.breached ? "text-destructive" : "text-success"}`}>
            {data.breached ? "BREACHED" : "SAFE"}
          </div>
          <div className="text-sm text-muted-foreground mt-2">{data.message}</div>
        </div>
      )}
    </div>
  );
}
