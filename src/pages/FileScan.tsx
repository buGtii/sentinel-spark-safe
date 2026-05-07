import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runScan, persistScan } from "@/lib/scans";
import { VerdictBadge } from "@/components/VerdictBadge";
import { Loader2, FileSearch, Upload } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

async function fileToSha256(file: File) {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export default function FileScan() {
  const [hash, setHash] = useState("");
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setFilename(f.name);
    if (f.size > 25 * 1024 * 1024) { toast.error("File too large; max 25MB for hashing in browser."); return; }
    const h = await fileToSha256(f);
    setHash(h);
    toast.success("SHA-256 computed");
  }

  async function go() {
    if (!hash) return;
    setBusy(true); setResult(null);
    try {
      const r = await runScan("file", { sha256: hash, filename });
      setResult(r);
      await persistScan({ type: "file", target: filename || hash, verdict: r.verdict || "unknown", risk_score: r.risk_score || 0, details: r });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-center gap-2 mb-2"><FileSearch className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">File Scanner</h2></div>
        <p className="text-sm text-muted-foreground">Hash file locally → check VirusTotal database.</p>
      </header>

      <div className="glass rounded-2xl p-4 space-y-3">
        <label className="block">
          <input type="file" onChange={pickFile} className="hidden" id="filepick" />
          <div className="border-2 border-dashed border-primary/30 rounded-xl p-6 text-center cursor-pointer hover:border-primary/60 transition-colors"
            onClick={() => document.getElementById("filepick")?.click()}>
            <Upload className="h-8 w-8 mx-auto mb-2 text-primary" />
            <div className="text-sm font-medium">{filename || "Pick a file"}</div>
            <div className="text-xs text-muted-foreground mt-1">Hashed locally — file never leaves your device</div>
          </div>
        </label>
        <Input placeholder="...or paste SHA-256 hash" value={hash}
          onChange={e => setHash(e.target.value.trim())} className="font-mono text-xs" />
        <Button onClick={go} disabled={busy || hash.length !== 64} className="w-full gradient-primary text-primary-foreground font-semibold glow">
          {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Checking...</> : "Check hash"}
        </Button>
      </div>

      {result && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          <VerdictBadge verdict={result.verdict} score={result.risk_score} />
          {result.message && <div className="glass rounded-xl p-4 text-sm">{result.message}</div>}
          {result.virustotal && (
            <div className="glass rounded-xl p-4">
              <div className="text-xs font-mono text-primary mb-2">VIRUSTOTAL</div>
              <div className="text-sm">Malicious: <b className="text-destructive">{result.virustotal.malicious}</b> · Suspicious: <b className="text-warning">{result.virustotal.suspicious}</b> · Harmless: <b className="text-success">{result.virustotal.harmless}</b></div>
              {result.type && <div className="text-xs text-muted-foreground mt-2">Type: {result.type}</div>}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
