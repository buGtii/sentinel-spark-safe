import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { History as HistoryIcon, ExternalLink, Download, FileJson, FileText, FileDown } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { exportHistoryPdf, exportSingleScanPdf } from "@/lib/pdf";

function downloadBlob(filename: string, data: string, mime: string) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toCSV(rows: any[]) {
  const headers = ["created_at", "scan_type", "target", "verdict", "risk_score", "blockchain_tx"];
  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))].join("\n");
}

export default function History() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("scans").select("*").order("created_at", { ascending: false }).limit(100);
      setRows(data || []);
    })();
  }, []);

  const colors: Record<string, string> = {
    safe: "text-success", suspicious: "text-warning", malicious: "text-destructive", unknown: "text-muted-foreground",
  };

  function exportJSON() {
    if (!rows.length) return toast.error("No scans to export");
    downloadBlob(`cybersmart-scans-${Date.now()}.json`, JSON.stringify(rows, null, 2), "application/json");
    toast.success("Exported JSON");
  }
  function exportCSV() {
    if (!rows.length) return toast.error("No scans to export");
    downloadBlob(`cybersmart-scans-${Date.now()}.csv`, toCSV(rows), "text/csv");
    toast.success("Exported CSV");
  }

  return (
    <div className="space-y-4">
      <header>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <HistoryIcon className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold">Scan History</h2>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => {
              if (!rows.length) return toast.error("No scans to export");
              exportHistoryPdf(rows); toast.success("Exported PDF");
            }} className="h-8 px-2">
              <FileDown className="h-3.5 w-3.5 mr-1" /> PDF
            </Button>
            <Button size="sm" variant="outline" onClick={exportCSV} className="h-8 px-2">
              <FileText className="h-3.5 w-3.5 mr-1" /> CSV
            </Button>
            <Button size="sm" variant="outline" onClick={exportJSON} className="h-8 px-2">
              <FileJson className="h-3.5 w-3.5 mr-1" /> JSON
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Blockchain-anchored ledger of your scans.</p>
      </header>

      {rows.length === 0 && (
        <div className="glass rounded-xl p-8 text-center text-sm text-muted-foreground">No scans yet.</div>
      )}

      <div className="space-y-2">
        {rows.map((r, i) => (
          <motion.div key={r.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.02 }}
            className="glass rounded-xl p-3 flex items-center gap-3">
            <div className="text-xs font-mono uppercase px-2 py-1 rounded bg-secondary/60 text-primary">{r.scan_type}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{r.target}</div>
              <div className="text-[10px] text-muted-foreground font-mono">
                {new Date(r.created_at).toLocaleString()}
                {r.blockchain_tx && (
                  <a href={`https://sepolia.etherscan.io/tx/${r.blockchain_tx}`} target="_blank" rel="noreferrer"
                    className="ml-2 text-accent hover:underline inline-flex items-center gap-0.5">
                    on-chain <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
            </div>
            <div className={`text-xs font-bold ${colors[r.verdict] || ""}`}>{r.verdict}</div>
            <div className="text-xs font-mono text-muted-foreground">{r.risk_score}</div>
            <button
              title="Download PDF report"
              onClick={() => { exportSingleScanPdf(r); toast.success("PDF saved"); }}
              className="p-1 rounded hover:bg-secondary/60 text-muted-foreground hover:text-primary"
            >
              <FileDown className="h-3.5 w-3.5" />
            </button>
            <button
              title="Download JSON"
              onClick={() => downloadBlob(
                `scan-${r.scan_type}-${r.id.slice(0,8)}.json`,
                JSON.stringify(r, null, 2),
                "application/json"
              )}
              className="p-1 rounded hover:bg-secondary/60 text-muted-foreground hover:text-primary"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
