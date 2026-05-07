import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, ThumbsUp, ThumbsDown, AlertTriangle, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import { toast } from "sonner";

type Report = {
  id: string; user_id: string; target: string; threat_type: string;
  category: string; description: string | null; severity: string;
  upvotes: number; downvotes: number; created_at: string;
};

const SEV_COLORS: Record<string, string> = {
  low: "text-muted-foreground bg-secondary/40",
  medium: "text-warning bg-warning/15",
  high: "text-destructive bg-destructive/15",
  critical: "text-destructive bg-destructive/25",
};

export default function Community() {
  const [rows, setRows] = useState<Report[]>([]);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [type, setType] = useState("phishing-url");
  const [severity, setSeverity] = useState("medium");
  const [desc, setDesc] = useState("");
  const [myVotes, setMyVotes] = useState<Record<string, number>>({});

  async function load() {
    const { data } = await supabase.from("threat_reports").select("*").order("created_at", { ascending: false }).limit(100);
    setRows((data || []) as Report[]);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: v } = await supabase.from("threat_report_votes").select("report_id, value").eq("user_id", user.id);
      setMyVotes(Object.fromEntries((v || []).map(x => [x.report_id, x.value])));
    }
  }
  useEffect(() => { load(); }, []);

  async function submit() {
    if (!target.trim()) return toast.error("Target required");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return toast.error("Sign in first");
    const { error } = await supabase.from("threat_reports").insert({
      user_id: user.id, target: target.trim(), threat_type: type, severity,
      category: type.split("-")[0], description: desc.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Report submitted to community feed");
    setOpen(false); setTarget(""); setDesc("");
    load();
  }

  async function vote(report: Report, value: 1 | -1) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return toast.error("Sign in first");
    const current = myVotes[report.id];
    if (current === value) {
      await supabase.from("threat_report_votes").delete().eq("report_id", report.id).eq("user_id", user.id);
    } else {
      await supabase.from("threat_report_votes").upsert(
        { report_id: report.id, user_id: user.id, value },
        { onConflict: "report_id,user_id" }
      );
    }
    load();
  }

  return (
    <div className="space-y-4">
      <header>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold">Community Threats</h2>
          </div>
          <Button size="sm" onClick={() => setOpen(true)} className="gradient-cyber text-background">
            <Plus className="h-4 w-4 mr-1" /> Report
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">Decentralized threat intelligence shared by users. Vote to verify legitimacy.</p>
      </header>

      {open && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">New threat report</h3>
            <button onClick={() => setOpen(false)}><X className="h-4 w-4" /></button>
          </div>
          <Input placeholder="URL, domain, IP, hash, phone…" value={target} onChange={e => setTarget(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="phishing-url">Phishing URL</SelectItem>
                <SelectItem value="phishing-email">Phishing email</SelectItem>
                <SelectItem value="phishing-sms">Smishing</SelectItem>
                <SelectItem value="malware-hash">Malware hash</SelectItem>
                <SelectItem value="malicious-ip">Malicious IP</SelectItem>
                <SelectItem value="scam-call">Scam call</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea placeholder="Optional context: what happened, who was targeted…" value={desc} onChange={e => setDesc(e.target.value)} rows={2} />
          <Button onClick={submit} className="w-full gradient-cyber text-background">Submit</Button>
        </motion.div>
      )}

      {rows.length === 0 && (
        <div className="glass rounded-xl p-8 text-center text-sm text-muted-foreground">
          No reports yet. Be the first to alert the community.
        </div>
      )}

      <div className="space-y-2">
        {rows.map((r, i) => {
          const myVote = myVotes[r.id];
          return (
            <motion.div key={r.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.02 }}
              className="glass rounded-xl p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium break-all">{r.target}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-secondary/60 text-primary">{r.threat_type}</span>
                    <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${SEV_COLORS[r.severity]}`}>{r.severity}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                  {r.description && <p className="text-xs text-muted-foreground mt-1">{r.description}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => vote(r, 1)}
                    className={`p-1.5 rounded ${myVote === 1 ? "bg-success/25 text-success" : "hover:bg-secondary/60 text-muted-foreground"}`}>
                    <ThumbsUp className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-xs font-mono w-6 text-center">{r.upvotes - r.downvotes}</span>
                  <button onClick={() => vote(r, -1)}
                    className={`p-1.5 rounded ${myVote === -1 ? "bg-destructive/25 text-destructive" : "hover:bg-secondary/60 text-muted-foreground"}`}>
                    <ThumbsDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
