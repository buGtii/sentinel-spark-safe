import { supabase } from "@/integrations/supabase/client";
import { logToChain } from "@/lib/blockchain";
import { getPrefs } from "@/lib/prefs";

export type ScanType = "url" | "ip" | "file" | "message";
export type Verdict = "safe" | "suspicious" | "malicious" | "unknown";

export async function runScan(type: ScanType, payload: any) {
  const fnMap: Record<ScanType, string> = {
    url: "scan-url",
    ip: "scan-ip",
    file: "scan-file",
    message: "analyze-message",
  };
  const prefs = getPrefs();
  const { data, error } = await supabase.functions.invoke(fnMap[type], {
    body: { ...payload, _prefs: prefs },
  });
  if (error) {
    try {
      const ctx: any = (error as any).context;
      if (ctx?.json) {
        const body = await ctx.json();
        if (body?.message) throw new Error(body.message);
        if (body?.error) throw new Error(body.error);
      }
    } catch (inner: any) {
      if (inner instanceof Error && inner.message) throw inner;
    }
    throw new Error("We couldn't reach the scan service. Please try again.");
  }
  if (data?.error && !data?.message) throw new Error(data.error);
  return data;
}

export async function persistScan(args: {
  type: ScanType;
  target: string;
  verdict: Verdict;
  risk_score: number;
  details: any;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const ledger = await logToChain({
    scanType: args.type, target: args.target, verdict: args.verdict, riskScore: args.risk_score,
  }).catch(() => null);
  const txHash = ledger && "txHash" in ledger ? (ledger as any).txHash : null;
  const { data, error } = await supabase.from("scans").insert({
    user_id: user.id,
    scan_type: args.type,
    target: args.target,
    verdict: args.verdict,
    risk_score: args.risk_score,
    details: { ...args.details, ledger },
    blockchain_tx: txHash,
  }).select().single();
  if (error) console.error(error);
  return data;
}
