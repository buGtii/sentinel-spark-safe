import jsPDF from "jspdf";

type ScanRow = {
  id: string;
  scan_type: string;
  target: string;
  verdict: string;
  risk_score: number;
  blockchain_tx?: string | null;
  created_at: string;
  details?: any;
};

const COLORS = {
  safe: [34, 197, 94],
  suspicious: [234, 179, 8],
  malicious: [239, 68, 68],
  unknown: [148, 163, 184],
} as const;

function header(doc: jsPDF, title: string) {
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 28, "F");
  doc.setTextColor(56, 189, 248);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("CyberSmart", 14, 14);
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text("AI · BLOCKCHAIN · SECURITY", 14, 20);
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(title, 196, 18, { align: "right" });
  doc.setTextColor(0, 0, 0);
}

function footer(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Generated ${new Date().toLocaleString()}  ·  Page ${i}/${pages}`, 105, 290, { align: "center" });
  }
}

function verdictBadge(doc: jsPDF, x: number, y: number, verdict: string, score: number) {
  const c = (COLORS as any)[verdict] || COLORS.unknown;
  doc.setFillColor(c[0], c[1], c[2]);
  doc.roundedRect(x, y - 5, 38, 8, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`${verdict.toUpperCase()} · ${score}`, x + 19, y + 0.5, { align: "center" });
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
}

export function exportSingleScanPdf(r: ScanRow) {
  const doc = new jsPDF();
  header(doc, "Scan Report");

  let y = 42;
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(`${r.scan_type.toUpperCase()} scan`, 14, y);
  verdictBadge(doc, 158, y, r.verdict, r.risk_score);

  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`Date: ${new Date(r.created_at).toLocaleString()}`, 14, y);
  y += 6;
  doc.text(`Scan ID: ${r.id}`, 14, y);
  y += 10;

  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text("Target", 14, y); y += 6;
  doc.setFont("courier", "normal");
  doc.setFontSize(9);
  const target = doc.splitTextToSize(r.target, 180);
  doc.text(target, 14, y);
  y += target.length * 5 + 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Blockchain Anchor", 14, y); y += 6;
  doc.setFont("courier", "normal");
  doc.setFontSize(9);
  doc.text(r.blockchain_tx ? r.blockchain_tx : "Local mock ledger (not on-chain)", 14, y);
  y += 10;

  const d = r.details || {};
  if (d.heuristics?.reasons?.length) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("Heuristic Findings", 14, y); y += 6;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    for (const reason of d.heuristics.reasons) {
      const lines = doc.splitTextToSize(`• ${reason}`, 180);
      doc.text(lines, 14, y); y += lines.length * 5;
    }
    y += 4;
  }
  if (d.virustotal) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("VirusTotal", 14, y); y += 6;
    doc.setFont("courier", "normal"); doc.setFontSize(9);
    const txt = doc.splitTextToSize(JSON.stringify(d.virustotal, null, 2), 180);
    doc.text(txt, 14, y); y += txt.length * 4 + 4;
  }
  if (d.ai_analysis || d.explanation) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("AI Analysis (Gemini)", 14, y); y += 6;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    const lines = doc.splitTextToSize(d.ai_analysis || d.explanation, 180);
    doc.text(lines, 14, y); y += lines.length * 5 + 4;
  }
  if (d.red_flags?.length) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("Red Flags", 14, y); y += 6;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    for (const f of d.red_flags) {
      const lines = doc.splitTextToSize(`• ${f}`, 180);
      doc.text(lines, 14, y); y += lines.length * 5;
    }
    y += 4;
  }
  if (d.recommendation) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("Recommendation", 14, y); y += 6;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    const lines = doc.splitTextToSize(d.recommendation, 180);
    doc.text(lines, 14, y);
  }

  footer(doc);
  doc.save(`cybersmart-scan-${r.scan_type}-${r.id.slice(0, 8)}.pdf`);
}

export function exportHistoryPdf(rows: ScanRow[]) {
  const doc = new jsPDF();
  header(doc, "Scan History");

  let y = 40;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`${rows.length} scans`, 14, y);
  y += 8;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setFillColor(241, 245, 249);
  doc.rect(10, y - 5, 190, 7, "F");
  doc.text("Date", 12, y);
  doc.text("Type", 50, y);
  doc.text("Target", 68, y);
  doc.text("Verdict", 158, y);
  doc.text("Risk", 188, y);
  y += 6;
  doc.setFont("helvetica", "normal");

  for (const r of rows) {
    if (y > 280) { doc.addPage(); header(doc, "Scan History"); y = 40; }
    const c = (COLORS as any)[r.verdict] || COLORS.unknown;
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text(new Date(r.created_at).toLocaleDateString(), 12, y);
    doc.setTextColor(0);
    doc.text(r.scan_type, 50, y);
    const target = (r.target || "").slice(0, 55);
    doc.text(target, 68, y);
    doc.setTextColor(c[0], c[1], c[2]);
    doc.setFont("helvetica", "bold");
    doc.text(r.verdict, 158, y);
    doc.text(String(r.risk_score), 188, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);
    y += 6;
  }

  footer(doc);
  doc.save(`cybersmart-history-${Date.now()}.pdf`);
}
