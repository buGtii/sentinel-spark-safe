import { Verdict } from "@/lib/scans";
import { ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion } from "lucide-react";
import { motion } from "framer-motion";

const map: Record<Verdict, { label: string; icon: any; cls: string; ring: string }> = {
  safe: { label: "Safe", icon: ShieldCheck, cls: "text-success", ring: "ring-success/40" },
  suspicious: { label: "Suspicious", icon: ShieldAlert, cls: "text-warning", ring: "ring-warning/40" },
  malicious: { label: "Malicious", icon: ShieldX, cls: "text-destructive", ring: "ring-destructive/40" },
  unknown: { label: "Unknown", icon: ShieldQuestion, cls: "text-muted-foreground", ring: "ring-muted/40" },
};

export function VerdictBadge({ verdict, score }: { verdict: Verdict; score: number }) {
  const v = map[verdict];
  const Icon = v.icon;
  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`glass rounded-2xl p-6 ring-2 ${v.ring} flex items-center gap-4`}
    >
      <div className={`p-3 rounded-xl bg-background/40 ${v.cls}`}>
        <Icon className="h-8 w-8" />
      </div>
      <div className="flex-1">
        <div className={`text-2xl font-bold ${v.cls}`}>{v.label}</div>
        <div className="text-xs text-muted-foreground font-mono">Risk score: {score}/100</div>
      </div>
      <div className="text-right">
        <div className="text-3xl font-mono font-bold text-gradient-cyber">{score}</div>
      </div>
    </motion.div>
  );
}
