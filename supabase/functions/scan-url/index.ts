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

function urlHeuristics(raw: string) {
  const reasons: string[] = [];
  let score = 0;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();

    if (/^(\d+\.){3}\d+$/.test(host)) { score += 35; reasons.push("Hosted on raw IP address (no domain)"); }
    if (host.length > 40) { score += 10; reasons.push("Very long hostname"); }
    if ((host.match(/-/g) || []).length >= 3) { score += 10; reasons.push("Excessive dashes in hostname"); }
    if (u.protocol !== "https:") { score += 18; reasons.push("Insecure (no HTTPS)"); }
    if (looksHomograph(host)) { score += 25; reasons.push("Internationalized/punycode domain (possible homograph)"); }

    const suspiciousTlds = [".zip", ".mov", ".xyz", ".top", ".tk", ".click", ".country", ".gq", ".ml", ".cf", ".work", ".loan"];
    if (suspiciousTlds.some(t => host.endsWith(t))) { score += 22; reasons.push("Suspicious TLD"); }

    const subs = host.split(".");
    if (subs.length > 4) { score += 12; reasons.push("Excessive subdomains (subdomain abuse)"); }

    const brands = ["paypal","apple","microsoft","google","amazon","bank","secure","verify","login","update","wallet","netflix","facebook","instagram","whatsapp","binance","metamask","coinbase"];
    const suspiciousBrandUse = brands.filter(k => host.includes(k) && !host.endsWith(`${k}.com`) && !host.endsWith(`${k}.org`));
    if (suspiciousBrandUse.length) { score += 28; reasons.push(`Possible brand impersonation: ${suspiciousBrandUse.join(", ")}`); }

    if (raw.length > 100) { score += 10; reasons.push("Very long URL"); }
    if (/@/.test(raw)) { score += 30; reasons.push("Contains '@' symbol (URL credentials trick)"); }
    if (u.pathname.split("/").length > 6) { score += 5; reasons.push("Deep URL path"); }
    if (/%[0-9a-f]{2}/i.test(u.pathname + u.search)) { score += 8; reasons.push("Heavy URL encoding"); }
    const sensitive = ["login","signin","verify","update","secure","account","wallet","unlock","support","reset"];
    if (sensitive.some(w => (u.pathname + u.search).toLowerCase().includes(w))) { score += 8; reasons.push("Credential-harvesting keywords in path"); }
  } catch {
    reasons.push("Invalid URL format");
    score = 50;
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
