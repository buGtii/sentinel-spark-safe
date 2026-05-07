import { useMemo, useState } from "react";
import { Copy, Search } from "lucide-react";
import { toast } from "sonner";
import { addXp } from "@/lib/gamify";

const RX = {
  ipv4: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
  ipv6: /\b(?:[A-F0-9]{1,4}:){7}[A-F0-9]{1,4}\b/gi,
  domain: /\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|app|dev|xyz|info|biz|us|uk|ru|cn|tk|gq|ml|ga|cf|top|club|site|online)\b/gi,
  url: /\bhttps?:\/\/[^\s<>"']+/gi,
  email: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g,
  md5: /\b[a-f0-9]{32}\b/gi,
  sha1: /\b[a-f0-9]{40}\b/gi,
  sha256: /\b[a-f0-9]{64}\b/gi,
  btc: /\b(?:bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}\b/g,
  eth: /\b0x[a-fA-F0-9]{40}\b/g,
  cve: /\bCVE-\d{4}-\d{4,7}\b/gi,
  bearer: /\bBearer\s+[A-Za-z0-9._-]+/gi,
};

export default function IocHunter() {
  const [text, setText] = useState("");

  const results = useMemo(() => {
    const r: Record<string, string[]> = {};
    for (const [k, rx] of Object.entries(RX)) {
      const m = Array.from(new Set((text.match(rx) || []).map(s => s.trim())));
      if (m.length) r[k] = m;
    }
    return r;
  }, [text]);

  const total = Object.values(results).reduce((s, a) => s + a.length, 0);

  function copyAll() {
    const lines = Object.entries(results).flatMap(([k, v]) => v.map(x => `${k}\t${x}`));
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Copied IOCs as TSV");
    addXp(8, "Extracted IOCs");
  }

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs font-mono text-primary">IOC HUNTER</p>
        <h1 className="text-2xl font-bold">Log & artifact parser</h1>
        <p className="text-sm text-muted-foreground">Paste any log, email, or alert. We extract IPs, hashes, URLs, wallets, CVEs and more.</p>
      </header>

      <textarea value={text} onChange={e => setText(e.target.value)} rows={10}
        placeholder="Paste raw text, JSON, syslog, email body..."
        className="w-full bg-background/40 border border-border rounded-xl px-3 py-2 font-mono text-xs" />

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2"><Search className="h-4 w-4 text-primary" /> {total} IOC{total !== 1 ? "s" : ""} extracted</div>
        {total > 0 && <button onClick={copyAll} className="flex items-center gap-1 text-primary"><Copy className="h-3 w-3" /> Copy TSV</button>}
      </div>

      <div className="space-y-2">
        {Object.entries(results).map(([k, v]) => (
          <div key={k} className="glass rounded-2xl p-3">
            <div className="text-xs font-mono text-accent mb-1">{k.toUpperCase()} · {v.length}</div>
            <div className="space-y-1">
              {v.map(x => (
                <div key={x} className="flex items-center justify-between text-xs font-mono">
                  <span className="truncate">{x}</span>
                  <button onClick={() => { navigator.clipboard.writeText(x); toast.success("Copied"); }} className="text-muted-foreground hover:text-primary"><Copy className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
