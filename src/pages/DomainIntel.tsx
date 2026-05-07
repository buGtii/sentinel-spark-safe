import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Globe, Search, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export default function DomainIntel() {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const run = async () => {
    if (!domain.trim()) return;
    setLoading(true); setData(null);
    const { data: r, error } = await supabase.functions.invoke("intel-domain", { body: { domain } });
    setLoading(false);
    if (error) return;
    setData(r);
  };

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="h-5 w-5 text-primary" />
          <h2 className="font-bold">DNS / WHOIS Intelligence</h2>
        </div>
        <div className="flex gap-2">
          <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com"
            className="flex-1 bg-background/40 border border-border rounded-xl px-3 py-2 text-sm" />
          <button onClick={run} disabled={loading}
            className="px-4 py-2 rounded-xl gradient-cyber text-background font-semibold text-sm flex items-center gap-1 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Lookup
          </button>
        </div>
      </div>

      {data && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="glass rounded-2xl p-4">
            <div className="text-xs text-muted-foreground mb-1">VERDICT</div>
            <div className={`font-bold ${data.risk === "suspicious" ? "text-warning" : "text-success"}`}>
              {data.risk.toUpperCase()} {data.ageDays !== null && `· ${data.ageDays} days old`}
            </div>
          </div>
          <Section title="WHOIS">
            {data.whois ? (
              <div className="text-xs space-y-1 font-mono">
                <Row k="Registrar" v={data.whois.registrar} />
                <Row k="Registered" v={data.whois.registered?.slice(0, 10)} />
                <Row k="Expires" v={data.whois.expires?.slice(0, 10)} />
                <Row k="Status" v={data.whois.status?.join(", ")} />
                <Row k="Nameservers" v={data.whois.nameservers?.join(", ")} />
              </div>
            ) : <div className="text-xs text-muted-foreground">No WHOIS data</div>}
          </Section>
          <Section title="DNS Records">
            <div className="text-xs space-y-1 font-mono">
              <Row k="A" v={data.dns.a.join(", ")} />
              <Row k="AAAA" v={data.dns.aaaa.join(", ")} />
              <Row k="MX" v={data.dns.mx.join(", ")} />
              <Row k="NS" v={data.dns.ns.join(", ")} />
              <Row k="TXT" v={data.dns.txt.slice(0, 3).join(" | ")} />
            </div>
          </Section>
        </motion.div>
      )}
    </div>
  );
}

function Section({ title, children }: any) {
  return <div className="glass rounded-2xl p-4"><div className="text-xs font-bold text-primary mb-2">{title}</div>{children}</div>;
}
function Row({ k, v }: { k: string; v: any }) {
  return <div className="flex gap-2"><span className="text-muted-foreground w-24 shrink-0">{k}:</span><span className="break-all">{v || "—"}</span></div>;
}
