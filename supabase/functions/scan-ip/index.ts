import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const VT = Deno.env.get("VIRUSTOTAL_API_KEY");

function isValidIP(ip: string) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || /^([0-9a-fA-F:]+)$/.test(ip);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { ip, _prefs } = body || {};
    const prefs = { useVirusTotal: true, ..._prefs };
    if (!ip || !isValidIP(ip)) {
      return new Response(JSON.stringify({ error: "valid ip required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    let stats: any = null;
    let country: string | null = null;
    let asn: string | null = null;
    if (VT && prefs.useVirusTotal) {
      const r = await fetch(`https://www.virustotal.com/api/v3/ip_addresses/${ip}`, { headers: { "x-apikey": VT } });
      if (r.ok) {
        const d = await r.json();
        stats = d?.data?.attributes?.last_analysis_stats || null;
        country = d?.data?.attributes?.country || null;
        asn = d?.data?.attributes?.as_owner || null;
      }
    }
    let score = 0;
    if (stats) score = Math.min(100, (stats.malicious || 0) * 20 + (stats.suspicious || 0) * 8);
    const verdict = score >= 60 ? "malicious" : score >= 30 ? "suspicious" : score > 0 ? "unknown" : "safe";
    return new Response(JSON.stringify({ verdict, risk_score: score, virustotal: stats, country, asn }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
