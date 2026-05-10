import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const VT = Deno.env.get("VIRUSTOTAL_API_KEY");

function b64url(s: string) {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Punycode / homograph detection: ASCII hostname containing similar-glyph chars from Cyrillic etc.
function looksHomograph(host: string): boolean {
  // If host contains punycode-encoded segments (xn--), it's IDN — flag for review
  return /(^|\.)xn--/.test(host);
}

// Well-known legitimate domains/suffixes — never auto-flag these from heuristics alone.
const TRUSTED_SUFFIXES = [
  "google.com","youtube.com","youtu.be","gmail.com","apple.com","icloud.com","microsoft.com","live.com","outlook.com",
  "office.com","bing.com","amazon.com","amazon.in","aws.amazon.com","facebook.com","fb.com","instagram.com","whatsapp.com",
  "twitter.com","x.com","linkedin.com","github.com","gitlab.com","stackoverflow.com","reddit.com","wikipedia.org",
  "netflix.com","spotify.com","paypal.com","stripe.com","cloudflare.com","openai.com","anthropic.com","lovable.app",
  "lovable.dev","supabase.co","supabase.com","vercel.app","netlify.app","github.io","wikipedia.org","mozilla.org",
  "yahoo.com","bing.com","duckduckgo.com","zoom.us","slack.com","discord.com","discord.gg","t.me","telegram.org",
  "drive.google.com","docs.google.com","maps.google.com","play.google.com",
];
function isTrusted(host: string) {
  return TRUSTED_SUFFIXES.some((d) => host === d || host.endsWith(`.${d}`));
}

function urlHeuristics(raw: string) {
  const reasons: string[] = [];
  let score = 0;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    const trusted = isTrusted(host);

    // Hard signals — these matter regardless.
    if (/^(\d+\.){3}\d+$/.test(host)) { score += 35; reasons.push("Hosted on raw IP address (no domain)"); }
    if (looksHomograph(host)) { score += 25; reasons.push("Internationalized/punycode domain (possible homograph)"); }
    if (/@/.test(raw)) { score += 30; reasons.push("Contains '@' symbol (URL credentials trick)"); }

    if (!trusted) {
      // Soft signals — only count for non-trusted hosts to avoid false positives on legit sites.
      if (u.protocol !== "https:" && u.protocol !== "http:") { /* skip */ }
      else if (u.protocol !== "https:") { score += 12; reasons.push("Insecure (no HTTPS)"); }

      if ((host.match(/-/g) || []).length >= 4) { score += 8; reasons.push("Excessive dashes in hostname"); }

      const suspiciousTlds = [".zip", ".mov", ".tk", ".gq", ".ml", ".cf", ".work", ".loan", ".country"];
      if (suspiciousTlds.some(t => host.endsWith(t))) { score += 22; reasons.push("Suspicious TLD"); }

      const subs = host.split(".");
      if (subs.length > 5) { score += 10; reasons.push("Excessive subdomains (subdomain abuse)"); }

      // Brand impersonation: brand keyword present but not on the official brand domain.
      const brands = ["paypal","apple","microsoft","google","amazon","netflix","facebook","instagram","whatsapp","binance","metamask","coinbase"];
      const impersonated = brands.filter(k => host.includes(k) && !host.endsWith(`${k}.com`) && !host.endsWith(`${k}.${k === "amazon" ? "in" : "org"}`));
      if (impersonated.length) { score += 28; reasons.push(`Possible brand impersonation: ${impersonated.join(", ")}`); }
    }
  } catch {
    reasons.push("Invalid URL format");
    score = 40;
  }
  return { score: Math.min(100, score), reasons };
}

async function virustotalUrl(url: string) {
  if (!VT) return null;
  try {
    const id = b64url(url);
    const res = await fetch(`https://www.virustotal.com/api/v3/urls/${id}`, { headers: { "x-apikey": VT } });
    if (res.status === 404) {
      const form = new FormData();
      form.append("url", url);
      await fetch("https://www.virustotal.com/api/v3/urls", { method: "POST", headers: { "x-apikey": VT }, body: form });
      return { malicious: 0, suspicious: 0, harmless: 0, undetected: 0, pending: true };
    }
    if (!res.ok) return null;
    const data = await res.json();
    const stats = data?.data?.attributes?.last_analysis_stats || {};
    return { ...stats, pending: false };
  } catch { return null; }
}

async function geminiAnalysis(url: string, heuristics: any, vt: any) {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return null;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a phishing-detection expert and MITRE ATT&CK analyst. Analyze the URL using ONLY the provided signals and return structured JSON via the tool. Always include 1-4 relevant MITRE ATT&CK techniques (e.g. T1566.002 Spearphishing Link, T1598 Phishing for Information, T1583.001 Acquire Infrastructure: Domains, T1036 Masquerading) with concrete detection recommendations." },
          { role: "user", content: `URL: ${url}\nHeuristics: ${heuristics.reasons.join("; ") || "none"}\nVirusTotal: ${vt ? JSON.stringify(vt) : "unavailable"}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "report_url_analysis",
            description: "Structured URL phishing analysis",
            parameters: {
              type: "object",
              properties: {
                verdict: { type: "string", enum: ["safe","suspicious","malicious","unknown"] },
                confidence: { type: "integer", minimum: 0, maximum: 100 },
                risk_score: { type: "integer", minimum: 0, maximum: 100 },
                category: { type: "string" },
                explanation: { type: "string" },
                recommendation: { type: "string" },
                red_flags: { type: "array", items: { type: "string" } },
                mitre_techniques: {
                  type: "array",
                  description: "Relevant MITRE ATT&CK techniques mapped to observed indicators.",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string", description: "MITRE technique ID e.g. T1566.002" },
                      name: { type: "string" },
                      tactic: { type: "string", description: "MITRE tactic e.g. Initial Access" },
                      description: { type: "string", description: "Why this technique applies (1 sentence)" },
                      detection: { type: "string", description: "Recommended detection or mitigation (1 sentence)" },
                    },
                    required: ["id","name","tactic","description","detection"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["verdict","confidence","risk_score","explanation","recommendation","red_flags","mitre_techniques"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "report_url_analysis" } },
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    return args ? JSON.parse(args) : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { url, _prefs } = body || {};
    const prefs = { useVirusTotal: true, useGemini: true, ..._prefs };
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const heuristics = urlHeuristics(url);
    const vt = prefs.useVirusTotal ? await virustotalUrl(url) : null;
    const ai = prefs.useGemini ? await geminiAnalysis(url, heuristics, vt) : null;

    // Blended scoring
    let score = heuristics.score;
    if (vt) score += (vt.malicious || 0) * 15 + (vt.suspicious || 0) * 5;
    if (ai?.risk_score) score = Math.round((score + ai.risk_score) / 2);
    score = Math.min(100, score);
    const verdict = score >= 70 ? "malicious" : score >= 40 ? "suspicious" : score >= 15 ? "unknown" : "safe";

    return new Response(JSON.stringify({
      verdict, risk_score: score,
      heuristics, virustotal: vt,
      ai_analysis: ai?.explanation || null,
      explanation: ai?.explanation || null,
      recommendation: ai?.recommendation || null,
      red_flags: ai?.red_flags || heuristics.reasons,
      category: ai?.category || null,
      confidence: ai?.confidence ?? null,
      mitre_techniques: ai?.mitre_techniques || [],
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
