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

// Shannon entropy — high values suggest random/algorithmically-generated tokens.
function entropy(s: string): number {
  if (!s) return 0;
  const freq: Record<string, number> = {};
  for (const c of s) freq[c] = (freq[c] || 0) + 1;
  let h = 0;
  for (const k in freq) {
    const p = freq[k] / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

function urlHeuristics(raw: string) {
  const reasons: string[] = [];
  let score = 0;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    const path = u.pathname || "";
    const trusted = isTrusted(host);

    // Hard signals — always count.
    if (/^(\d+\.){3}\d+$/.test(host)) { score += 35; reasons.push("Hosted on raw IP address (no domain)"); }
    if (looksHomograph(host)) { score += 25; reasons.push("Internationalized/punycode domain (possible homograph)"); }
    if (/@/.test(raw)) { score += 30; reasons.push("Contains '@' symbol (URL credentials trick)"); }

    if (!trusted) {
      if (u.protocol === "http:") { score += 10; reasons.push("Insecure (no HTTPS)"); }

      if ((host.match(/-/g) || []).length >= 4) { score += 8; reasons.push("Excessive dashes in hostname"); }

      const suspiciousTlds = [".zip", ".mov", ".tk", ".gq", ".ml", ".cf", ".work", ".loan", ".country", ".xyz", ".top", ".click", ".rest", ".support"];
      if (suspiciousTlds.some(t => host.endsWith(t))) { score += 18; reasons.push("Suspicious / low-reputation TLD"); }

      const subs = host.split(".");
      if (subs.length > 5) { score += 10; reasons.push("Excessive subdomains (subdomain abuse)"); }

      // Random/high-entropy subdomain (e.g. m8.bhy0908.com)
      const labels = subs.slice(0, -2); // drop registrable + tld
      const rootLabel = subs.length >= 2 ? subs[subs.length - 2] : "";
      const hasDigitLetterMix = /[a-z]/.test(rootLabel) && /\d/.test(rootLabel);
      if (rootLabel.length >= 5 && entropy(rootLabel) >= 3.0 && hasDigitLetterMix) {
        score += 22; reasons.push(`High-entropy domain label "${rootLabel}" (looks auto-generated)`);
      }
      for (const lbl of labels) {
        if (lbl.length >= 4 && entropy(lbl) >= 2.8 && /\d/.test(lbl) && /[a-z]/.test(lbl)) {
          score += 10; reasons.push(`Random-looking subdomain "${lbl}"`); break;
        }
      }

      // Opaque short-URL-style path (e.g. /s/NIam34tq) on a non-trusted host
      const segments = path.split("/").filter(Boolean);
      if (segments.length >= 1) {
        const last = segments[segments.length - 1];
        if (segments.length <= 3 && last.length >= 6 && last.length <= 14 &&
            /^[A-Za-z0-9_-]+$/.test(last) && entropy(last) >= 3.2 &&
            !/\.(html?|php|aspx?)$/i.test(last)) {
          score += 18; reasons.push("Opaque short-link style path (possible redirector / one-time link)");
        }
        if (/^(s|r|l|t|go|out|click|track|redir|redirect)$/i.test(segments[0]) && segments.length <= 3) {
          score += 8; reasons.push("Path looks like a redirector endpoint");
        }
      }

      // Brand impersonation: brand keyword present but not on the official brand domain.
      const brands = ["paypal","apple","microsoft","google","amazon","netflix","facebook","instagram","whatsapp","binance","metamask","coinbase"];
      const impersonated = brands.filter(k => host.includes(k) && !host.endsWith(`${k}.com`) && !host.endsWith(`${k}.${k === "amazon" ? "in" : "org"}`));
      if (impersonated.length) { score += 28; reasons.push(`Possible brand impersonation: ${impersonated.join(", ")}`); }

      // Very long hostname
      if (host.length > 40) { score += 6; reasons.push("Unusually long hostname"); }
    }
  } catch {
    reasons.push("Invalid URL format");
    score = 40;
  }
  return { score: Math.min(100, score), reasons };
}

// fetch with timeout + simple retry/backoff
async function fetchWithRetry(url: string, init: RequestInit, opts: { timeoutMs?: number; retries?: number } = {}) {
  const { timeoutMs = 8000, retries = 2 } = opts;
  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(t);
      if (r.status === 429 || r.status >= 500) {
        if (i < retries) { await new Promise(res => setTimeout(res, 400 * Math.pow(2, i))); continue; }
      }
      return r;
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      if (i < retries) await new Promise(res => setTimeout(res, 400 * Math.pow(2, i)));
    }
  }
  throw lastErr || new Error("network error");
}

async function virustotalUrl(url: string) {
  if (!VT) return { error: "no_api_key" };
  try {
    const id = b64url(url);
    const res = await fetchWithRetry(`https://www.virustotal.com/api/v3/urls/${id}`,
      { headers: { "x-apikey": VT } }, { timeoutMs: 8000, retries: 2 });
    if (res.status === 404) {
      // Submit for analysis, then poll once for a quick result.
      const form = new FormData();
      form.append("url", url);
      const sub = await fetchWithRetry("https://www.virustotal.com/api/v3/urls",
        { method: "POST", headers: { "x-apikey": VT }, body: form }, { timeoutMs: 8000, retries: 1 }).catch(() => null);
      const analysisId = sub && sub.ok ? (await sub.json())?.data?.id : null;
      if (analysisId) {
        await new Promise(r => setTimeout(r, 2500));
        const poll = await fetchWithRetry(`https://www.virustotal.com/api/v3/analyses/${analysisId}`,
          { headers: { "x-apikey": VT } }, { timeoutMs: 8000, retries: 1 }).catch(() => null);
        if (poll && poll.ok) {
          const d = await poll.json();
          const stats = d?.data?.attributes?.stats;
          if (stats && d?.data?.attributes?.status === "completed") {
            return { malicious: stats.malicious || 0, suspicious: stats.suspicious || 0,
                     harmless: stats.harmless || 0, undetected: stats.undetected || 0, pending: false };
          }
        }
      }
      return { malicious: 0, suspicious: 0, harmless: 0, undetected: 0, pending: true };
    }
    if (res.status === 429) return { error: "rate_limited" };
    if (!res.ok) return { error: `http_${res.status}` };
    const data = await res.json();
    const stats = data?.data?.attributes?.last_analysis_stats || {};
    const reputation = data?.data?.attributes?.reputation ?? null;
    return { ...stats, reputation, pending: false };
  } catch (e) { return { error: "network", detail: String(e) }; }
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
          { role: "system", content: "You are a phishing-detection expert and MITRE ATT&CK analyst. DEFAULT TO SAFE for well-known legitimate domains (google, youtube, github, microsoft, apple, amazon, wikipedia, etc.) and for benign personal/corporate sites. Only mark suspicious (40-69) or malicious (70-100) when there is concrete evidence: brand impersonation in the hostname, raw IP host, homograph/punycode, deceptive credential-harvesting page, VirusTotal detections, or the URL clearly mimics a known brand on a non-official domain. Treat heuristic hints as hints — do NOT escalate solely because the URL is long, has 'login' in the path, or uses a common subdomain. When VirusTotal shows 0 malicious AND 0 suspicious AND harmless>=1, the verdict MUST be 'safe' unless you have an explicit reason. Return structured JSON via the tool. Include 0-3 MITRE ATT&CK techniques only when verdict is suspicious or malicious; for safe verdicts return an empty mitre_techniques array and an empty red_flags array." },
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
    let { url, _prefs } = body || {};
    const prefs = { useVirusTotal: true, useGemini: true, ..._prefs };
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    url = url.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try { new URL(url); } catch {
      return new Response(JSON.stringify({
        verdict: "unknown", risk_score: 0,
        error_type: "invalid_url",
        message: "That doesn't look like a valid URL. Please paste a full link starting with http(s)://",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const heuristics = urlHeuristics(url);
    const vtRaw = prefs.useVirusTotal ? await virustotalUrl(url) : null;
    const vt = vtRaw && !("error" in vtRaw) ? vtRaw : null;
    const vtError = vtRaw && "error" in vtRaw ? (vtRaw as any).error : null;
    const ai = prefs.useGemini ? await geminiAnalysis(url, heuristics, vt) : null;

    // Blended scoring
    let score = heuristics.score;
    const vtClean = vt && !vt.pending && (vt.malicious ?? 0) === 0 && (vt.suspicious ?? 0) === 0 && (vt.harmless ?? 0) >= 3;
    const vtPending = vt && vt.pending;
    if (vt && !vt.pending) score += (vt.malicious || 0) * 18 + (vt.suspicious || 0) * 6;
    if (ai?.risk_score != null) score = Math.round((score + ai.risk_score) / 2);
    // Only cap to "safe" when VT is definitively clean AND heuristics didn't find hard signals.
    if (vtClean && heuristics.score < 25) score = Math.min(score, 12);
    score = Math.max(0, Math.min(100, score));

    // Verdict: never call something safe when VT is unavailable AND heuristics flagged hard signals.
    let verdict: string;
    if (ai?.verdict && ["safe","suspicious","malicious"].includes(ai.verdict)) {
      verdict = ai.verdict;
      if (vtClean && verdict !== "malicious" && heuristics.score < 25) verdict = "safe";
      if (heuristics.score >= 50 && verdict === "safe") verdict = "suspicious";
    } else {
      verdict = score >= 70 ? "malicious" : score >= 35 ? "suspicious" : score >= 15 ? "suspicious" : "safe";
    }
    // If we have no VT signal and heuristics are noisy, mark suspicious rather than safe.
    if (!vt && heuristics.score >= 25 && verdict === "safe") verdict = "suspicious";

    const verdict_level =
      score >= 85 ? "Highly Malicious" :
      score >= 70 ? "Dangerous" :
      score >= 45 ? "Suspicious" :
      score >= 20 ? "Low Risk" :
      verdict === "safe" ? "Safe" : "Needs Review";

    const isPhishing = verdict === "malicious" || verdict === "suspicious";
    const confidence = ai?.confidence ?? (vt && !vt.pending ? 85 : vtPending ? 45 : 60);

    return new Response(JSON.stringify({
      verdict, risk_score: score,
      verdict_level,
      confidence,
      is_phishing: isPhishing,
      phishing_label: verdict === "malicious" ? "Phishing / Malicious"
        : verdict === "suspicious" ? "Potentially Phishing"
        : "Not Phishing — Legitimate",
      heuristics, virustotal: vt,
      vt_status: vtError ? vtError : (vtPending ? "pending" : vt ? "ok" : "unavailable"),
      ai_analysis: ai?.explanation || null,
      explanation: ai?.explanation || null,
      recommendation: ai?.recommendation || null,
      red_flags: (verdict === "safe" ? [] : (ai?.red_flags?.length ? ai.red_flags : heuristics.reasons)),
      category: ai?.category || null,
      mitre_techniques: verdict === "safe" ? [] : (ai?.mitre_techniques || []),
      normalized_url: url,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), message: "We couldn't complete the scan. Please try again." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
