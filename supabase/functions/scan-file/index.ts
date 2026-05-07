import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const VT = Deno.env.get("VIRUSTOTAL_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { sha256, filename, _prefs } = body || {};
    const prefs = { useVirusTotal: true, ..._prefs };
    if (!sha256 || typeof sha256 !== "string" || sha256.length !== 64) {
      return new Response(JSON.stringify({ error: "valid sha256 required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    let stats: any = null;
    let typeDesc: string | null = null;
    if (VT && prefs.useVirusTotal) {
      const r = await fetch(`https://www.virustotal.com/api/v3/files/${sha256}`, { headers: { "x-apikey": VT } });
      if (r.ok) {
        const d = await r.json();
        stats = d?.data?.attributes?.last_analysis_stats || null;
        typeDesc = d?.data?.attributes?.type_description || null;
      } else if (r.status === 404) {
        return new Response(JSON.stringify({ verdict: "unknown", risk_score: 0, virustotal: null, message: "File not found in VirusTotal database. Upload to virustotal.com to scan." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    let score = 0;
    if (stats) score = Math.min(100, (stats.malicious || 0) * 10 + (stats.suspicious || 0) * 5);
    const verdict = score >= 50 ? "malicious" : score >= 20 ? "suspicious" : score > 0 ? "unknown" : "safe";
    return new Response(JSON.stringify({ verdict, risk_score: score, virustotal: stats, type: typeDesc, filename }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
