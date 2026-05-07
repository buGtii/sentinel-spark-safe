import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Activity, ShieldAlert, ShieldCheck, ShieldX, Users, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { ResponsiveContainer, LineChart, Line, XAxis, Tooltip, BarChart, Bar, Cell } from "recharts";

export default function SOC() {
  const [scans, setScans] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [s, r] = await Promise.all([
        supabase.from("scans").select("*").order("created_at", { ascending: false }).limit(500),
        supabase.from("threat_reports").select("*").order("created_at", { ascending: false }).limit(200),
      ]);
      setScans(s.data || []); setReports(r.data || []);
    })();
  }, []);

  const stats = useMemo(() => {
    const total = scans.length;
    const malicious = scans.filter(x => x.verdict === "malicious").length;
    const suspicious = scans.filter(x => x.verdict === "suspicious").length;
    const safe = scans.filter(x => x.verdict === "safe").length;
    const avgRisk = total ? Math.round(scans.reduce((a, x) => a + (x.risk_score || 0), 0) / total) : 0;
    return { total, malicious, suspicious, safe, avgRisk };
  }, [scans]);

  const timeline = useMemo(() => {
    const days: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days[d.toISOString().slice(0, 10)] = 0;
    }
    scans.forEach(s => {
      const k = s.created_at?.slice(0, 10);
      if (k in days) days[k]++;
    });
    return Object.entries(days).map(([date, count]) => ({ date: date.slice(5), count }));
  }, [scans]);

  const byType = useMemo(() => {
    const map: Record<string, number> = { url: 0, ip: 0, file: 0, message: 0 };
    scans.forEach(s => { map[s.scan_type] = (map[s.scan_type] || 0) + 1; });
    return Object.entries(map).map(([type, count]) => ({ type, count }));
  }, [scans]);

  const TYPE_COLORS = ["hsl(174 100% 50%)", "hsl(195 100% 55%)", "hsl(270 95% 65%)", "hsl(38 95% 55%)"];

  return (
    <div className="space-y-4">
      <header>
        <div className="flex items-center gap-2 mb-1">
          <Activity className="h-5 w-5 text-primary animate-pulse" />
          <h2 className="text-xl font-bold">SOC Dashboard</h2>
        </div>
        <p className="text-sm text-muted-foreground">Live telemetry across your scans & community feed.</p>
      </header>

      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Total scans", value: stats.total, icon: TrendingUp, cls: "text-primary" },
          { label: "Malicious", value: stats.malicious, icon: ShieldX, cls: "text-destructive" },
          { label: "Suspicious", value: stats.suspicious, icon: ShieldAlert, cls: "text-warning" },
          { label: "Safe", value: stats.safe, icon: ShieldCheck, cls: "text-success" },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="glass rounded-xl p-3 flex items-center gap-3">
              <Icon className={`h-5 w-5 ${s.cls}`} />
              <div>
                <div className={`text-2xl font-bold ${s.cls}`}>{s.value}</div>
                <div className="text-[10px] uppercase font-mono text-muted-foreground">{s.label}</div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="glass rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold">7-day scan activity</h3>
          <span className="text-xs font-mono text-muted-foreground">avg risk {stats.avgRisk}/100</span>
        </div>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={timeline}>
            <XAxis dataKey="date" tick={{ fill: "hsl(215 20% 65%)", fontSize: 10 }} />
            <Tooltip contentStyle={{ background: "hsl(222 47% 8%)", border: "1px solid hsl(174 100% 50% / 0.3)", borderRadius: 8 }} />
            <Line type="monotone" dataKey="count" stroke="hsl(174 100% 50%)" strokeWidth={2} dot={{ fill: "hsl(174 100% 50%)" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="glass rounded-xl p-3">
        <h3 className="text-sm font-bold mb-2">Scans by type</h3>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={byType}>
            <XAxis dataKey="type" tick={{ fill: "hsl(215 20% 65%)", fontSize: 10 }} />
            <Tooltip contentStyle={{ background: "hsl(222 47% 8%)", border: "1px solid hsl(174 100% 50% / 0.3)", borderRadius: 8 }} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {byType.map((_, i) => <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="glass rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <Users className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-bold">Latest community reports</h3>
        </div>
        {reports.length === 0 ? (
          <p className="text-xs text-muted-foreground">No community reports yet.</p>
        ) : (
          <div className="space-y-1.5">
            {reports.slice(0, 5).map(r => (
              <div key={r.id} className="text-xs flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${
                  r.severity === "critical" || r.severity === "high" ? "bg-destructive" :
                  r.severity === "medium" ? "bg-warning" : "bg-muted-foreground"
                }`} />
                <span className="truncate flex-1">{r.target}</span>
                <span className="font-mono text-muted-foreground">{r.threat_type}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
