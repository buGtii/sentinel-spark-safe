import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const VT = Deno.env.get("VIRUSTOTAL_API_KEY");

const IPV4 = /^(25[0-5]|2[0-4]\d|[01]?\d?\d)(\.(25[0-5]|2[0-4]\d|[01]?\d?\d)){3}$/;
const IPV6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::1|::|([0-9a-fA-F]{1,4}:){1,7}:|:(:[0-9a-fA-F]{1,4}){1,7})$/;

function classify(input: string) {
  const s = (input || "").trim();
  if (!s) return "empty";
  if (IPV4.test(s)) return "ipv4";
  if (IPV6.test(s)) return "ipv6";
  if (/^https?:\/\//i.test(s) || s.includes("/")) return "url";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "email";
  if (/^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(s)) return "domain";
  return "unknown";
}

function isPrivateOrReserved(ip: string) {
  if (!IPV4.test(ip)) return false;
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || a === 127 || a === 0 || a >= 224;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // Always respond 200 with a structured payload so the client never sees a generic "non-2xx" crash.
  const respond = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = await req.json().catch(() => ({}));
    const { ip, _prefs } = body || {};
    const prefs = { useVirusTotal: true, ..._prefs };
    const kind = classify(ip || "");

    if (kind === "empty") {
      return respond({ verdict: "unknown", risk_score: 0, error_type: "empty",
        message: "Please enter an IP address (e.g. 8.8.8.8)." });
    }
    if (kind === "url" || kind === "domain") {
      return respond({ verdict: "unknown", risk_score: 0, error_type: "wrong_scanner",
        detected_type: kind, suggested_scanner: "url",
        message: `This looks like a ${kind === "url" ? "URL" : "domain"}, not an IP address. Please use the URL Scanner instead.` });
    }
    if (kind === "email") {
      return respond({ verdict: "unknown", risk_score: 0, error_type: "wrong_scanner",
        detected_type: "email", suggested_scanner: "email_headers",
        message: "This looks like an email address. Please use the Email Headers tool." });
    }
    if (kind !== "ipv4" && kind !== "ipv6") {
      return respond({ verdict: "unknown", risk_score: 0, error_type: "invalid",
        message: "That doesn't look like a valid IP address. Example: 8.8.8.8 or 2001:4860:4860::8888." });
    }
    if (isPrivateOrReserved(ip)) {
      return respond({ verdict: "safe", risk_score: 0, note: "private_or_reserved",
        message: "This is a private/reserved IP — no public reputation data available.",
        country: null, asn: null, virustotal: null });
    }

    let stats: any = null;
    let country: string | null = null;
    let asn: string | null = null;
    let vt_status = "skipped";

    if (VT && prefs.useVirusTotal) {
      try {
        const r = await fetchWithTimeout(`https://www.virustotal.com/api/v3/ip_addresses/${encodeURIComponent(ip)}`,
          { headers: { "x-apikey": VT } }, 8000);
        if (r.ok) {
          const d = await r.json();
          stats = d?.data?.attributes?.last_analysis_stats || null;
          country = d?.data?.attributes?.country || null;
          asn = d?.data?.attributes?.as_owner || null;
          vt_status = "ok";
        } else if (r.status === 429) {
          vt_status = "rate_limited";
        } else {
          vt_status = `http_${r.status}`;
        }
      } catch { vt_status = "network_error"; }
    } else if (!VT) {
      vt_status = "no_api_key";
    }

    let score = 0;
    let noisyFp = false;
    if (stats) {
      const mal = stats.malicious || 0;
      const sus = stats.suspicious || 0;
      const harm = stats.harmless || 0;
      const total = mal + sus + harm + (stats.undetected || 0);
      noisyFp = mal === 1 && harm >= 20;
      if (noisyFp) score = 8;
      else if (mal >= 5) score = Math.min(100, 60 + mal * 5);
      else if (mal >= 2) score = Math.min(100, 30 + mal * 8 + sus * 3);
      else if (mal === 1) score = 18 + sus * 3;
      else score = Math.min(30, sus * 6);
      // hard cap when overwhelmingly clean
      if (mal === 0 && sus === 0 && harm >= 10) score = Math.min(score, 5);
    }
    const verdict = score >= 60 ? "malicious" : score >= 30 ? "suspicious" : score > 0 ? "suspicious" : "safe";
    const verdict_level =
      score >= 85 ? "Highly Malicious" :
      score >= 60 ? "Dangerous" :
      score >= 30 ? "Suspicious" :
      score > 0 ? "Low Risk" : (stats ? "Safe" : "Needs Review");

    return respond({ verdict, risk_score: score, verdict_level,
      virustotal: stats, country, asn, vt_status,
      confidence: stats ? 85 : 45,
      noisy_false_positive: noisyFp,
      message: stats
        ? (noisyFp ? `Only 1 of many vendors flagged this IP while ${stats.harmless} marked it harmless — likely a false positive.` : null)
        : "Reputation data is currently unavailable; the result is based on limited information." });

  } catch (e) {
    return respond({ verdict: "unknown", risk_score: 0, error_type: "internal",
      message: "We couldn't complete the scan. Please try again." });
  }
});
