import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const VT = Deno.env.get("VIRUSTOTAL_API_KEY");

function b64url(s: string) {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function looksHomograph(host: string): boolean {
  return /(^|\.)xn--/.test(host);
}

const TRUSTED_SUFFIXES = [
  "google.com","youtube.com","youtu.be","gmail.com","apple.com","icloud.com","microsoft.com","live.com","outlook.com",
  "office.com","bing.com","amazon.com","amazon.in","aws.amazon.com","facebook.com","fb.com","instagram.com","whatsapp.com",
  "twitter.com","x.com","linkedin.com","github.com","gitlab.com","stackoverflow.com","reddit.com","wikipedia.org",
  "netflix.com","spotify.com","paypal.com","stripe.com","cloudflare.com","openai.com","anthropic.com","lovable.app",
  "lovable.dev","supabase.co","supabase.com","vercel.app","netlify.app","github.io","mozilla.org",
  "yahoo.com","duckduckgo.com","zoom.us","slack.com","discord.com","discord.gg","t.me","telegram.org",
  "drive.google.com","docs.google.com","maps.google.com","play.google.com","limeox.com",
  // Common legit business/tooling domains often misflagged
  "shopify.com","wordpress.com","wordpress.org","medium.com","substack.com","notion.so","airtable.com",
  "figma.com","canva.com","dropbox.com","box.com","onedrive.live.com","sharepoint.com","adobe.com",
  "atlassian.com","trello.com","asana.com","monday.com","intercom.com","zendesk.com","hubspot.com",
  "salesforce.com","mailchimp.com","sendgrid.com","twilio.com","cloudfront.net","akamai.net","fastly.net",
  "ebay.com","walmart.com","target.com","bestbuy.com","etsy.com","alibaba.com","aliexpress.com",
  "flipkart.com","myntra.com","booking.com","airbnb.com","uber.com","lyft.com","doordash.com",
  "nytimes.com","bbc.com","bbc.co.uk","cnn.com","reuters.com","bloomberg.com","forbes.com",
  "wikipedia.org","wiktionary.org","archive.org","stackexchange.com","quora.com","pinterest.com",
  "tumblr.com","tiktok.com","snapchat.com","twitch.tv","vimeo.com","soundcloud.com",
];
function isTrusted(host: string) {
  return TRUSTED_SUFFIXES.some((d) => host === d || host.endsWith(`.${d}`));
}

function entropy(s: string): number {
  if (!s) return 0;
  const freq: Record<string, number> = {};
  for (const c of s) freq[c] = (freq[c] || 0) + 1;
  let h = 0;
  for (const k in freq) { const p = freq[k] / s.length; h -= p * Math.log2(p); }
  return h;
}

type Evidence = string;
type Layer = { name: string; score: number; weight: number; evidence: Evidence[]; status: "ok"|"warn"|"bad"|"unknown" };

function heuristicsLayer(raw: string): Layer {
  const evidence: Evidence[] = [];
  let score = 0;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    const path = u.pathname || "";
    const trusted = isTrusted(host);

    if (/^(\d+\.){3}\d+$/.test(host)) { score += 35; evidence.push("Hosted on raw IP address (no domain name)"); }
    if (looksHomograph(host)) { score += 20; evidence.push("Internationalized/punycode domain (possible homograph)"); }
    if (/@/.test(raw)) { score += 30; evidence.push("Contains '@' (credentials trick)"); }

    if (!trusted) {
      if (u.protocol === "http:") { score += 8; evidence.push("No HTTPS"); }
      if ((host.match(/-/g) || []).length >= 4) { score += 6; evidence.push("Excessive dashes in hostname"); }
      const suspiciousTlds = [".zip", ".mov", ".tk", ".gq", ".ml", ".cf", ".work", ".loan", ".country", ".click", ".rest", ".support"];
      if (suspiciousTlds.some(t => host.endsWith(t))) { score += 14; evidence.push("Low-reputation TLD"); }
      const subs = host.split(".");
      if (subs.length > 5) { score += 8; evidence.push("Excessive subdomains"); }

      const rootLabel = subs.length >= 2 ? subs[subs.length - 2] : "";
      const hasDigitLetterMix = /[a-z]/.test(rootLabel) && /\d/.test(rootLabel);
      if (rootLabel.length >= 5 && hasDigitLetterMix) {
        const consonants = (rootLabel.match(/[bcdfghjklmnpqrstvwxyz]/gi) || []).length;
        const vowels = (rootLabel.match(/[aeiou]/gi) || []).length;
        const unpronounceable = vowels === 0 || consonants / Math.max(1, rootLabel.length) > 0.55;
        if (entropy(rootLabel) >= 2.4 || unpronounceable) {
          score += 22; evidence.push(`Random/auto-generated registrable label "${rootLabel}"`);
        }
      }

      const segments = path.split("/").filter(Boolean);
      if (segments.length >= 1) {
        const last = segments[segments.length - 1];
        if (segments.length <= 3 && last.length >= 8 && last.length <= 16 &&
            /^[A-Za-z0-9_-]+$/.test(last) && entropy(last) >= 3.0 &&
            /[A-Z]/.test(last) && /[a-z]/.test(last) && /\d/.test(last) &&
            !/\.(html?|php|aspx?)$/i.test(last)) {
          score += 16; evidence.push(`Opaque slug "${last}" — possible redirector`);
        }
      }

      const brands = ["paypal","apple","microsoft","google","amazon","netflix","facebook","instagram","whatsapp","binance","metamask","coinbase"];
      const impersonated = brands.filter(k => host.includes(k) && !host.endsWith(`${k}.com`));
      if (impersonated.length) { score += 28; evidence.push(`Possible brand impersonation: ${impersonated.join(", ")}`); }
      if (host.length > 50) { score += 4; evidence.push("Unusually long hostname"); }
    } else {
      evidence.push("Hostname is on the trusted-domain allowlist");
    }
  } catch {
    evidence.push("Could not parse URL");
    score = 30;
  }
  score = Math.min(100, score);
  return {
    name: "Heuristics",
    score, weight: 0.25, evidence,
    status: score >= 50 ? "bad" : score >= 20 ? "warn" : "ok",
  };
}

async function fetchWithRetry(url: string, init: RequestInit, opts: { timeoutMs?: number; retries?: number } = {}) {
  const { timeoutMs = 7000, retries = 2 } = opts;
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
      clearTimeout(t); lastErr = e;
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
      { headers: { "x-apikey": VT } }, { timeoutMs: 7000, retries: 2 });
    if (res.status === 404) {
      const form = new FormData(); form.append("url", url);
      const sub = await fetchWithRetry("https://www.virustotal.com/api/v3/urls",
        { method: "POST", headers: { "x-apikey": VT }, body: form }, { timeoutMs: 7000, retries: 1 }).catch(() => null);
      const analysisId = sub && sub.ok ? (await sub.json())?.data?.id : null;
      if (analysisId) {
        await new Promise(r => setTimeout(r, 2500));
        const poll = await fetchWithRetry(`https://www.virustotal.com/api/v3/analyses/${analysisId}`,
          { headers: { "x-apikey": VT } }, { timeoutMs: 7000, retries: 1 }).catch(() => null);
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

function virustotalLayer(vt: any): Layer {
  if (!vt || vt.error || vt.pending) {
    return { name: "VirusTotal", score: 0, weight: 0,
      evidence: [vt?.error ? `VirusTotal unavailable (${vt.error})` : vt?.pending ? "VirusTotal analysis pending" : "VirusTotal not consulted"],
      status: "unknown" };
  }
  const mal = vt.malicious || 0, sus = vt.suspicious || 0, harm = vt.harmless || 0;
  const totalVerdicts = mal + sus + harm + (vt.undetected || 0);
  // Ratio-aware scoring: a single vendor flagging a URL that 50+ others mark harmless is almost always a false positive.
  const malRatio = totalVerdicts > 0 ? mal / totalVerdicts : 0;
  const noisySingleFp = mal === 1 && harm >= 20;
  let score: number;
  if (noisySingleFp) score = 10;
  else if (mal >= 5) score = Math.min(100, 60 + mal * 6 + sus * 4);
  else if (mal >= 2) score = Math.min(100, 35 + mal * 8 + sus * 4);
  else if (mal === 1) score = Math.min(35, 18 + sus * 4);
  else score = Math.min(40, sus * 8);
  const evidence: string[] = [];
  if (mal > 0) {
    evidence.push(`${mal} security vendor${mal > 1 ? "s" : ""} flagged this URL as malicious (out of ${totalVerdicts})`);
    if (noisySingleFp) evidence.push(`Likely a false positive — ${harm} vendors mark it harmless and only 1 disagrees`);
  }
  if (sus > 0) evidence.push(`${sus} vendor${sus > 1 ? "s" : ""} marked it suspicious`);
  if (harm > 0 && mal === 0 && sus === 0) evidence.push(`${harm} vendors mark it harmless`);
  const status: Layer["status"] = mal >= 2 ? "bad" : (mal === 1 && !noisySingleFp) || sus > 0 ? "warn" : "ok";
  return { name: "VirusTotal", score, weight: 0.30, evidence, status };
}


// Domain age via RDAP (no API key needed)
async function rdapAgeLayer(host: string): Promise<Layer> {
  try {
    const registrable = host.split(".").slice(-2).join(".");
    const r = await fetchWithRetry(`https://rdap.org/domain/${registrable}`, {}, { timeoutMs: 5000, retries: 1 });
    if (!r.ok) return { name: "Domain Age", score: 0, weight: 0, evidence: ["WHOIS/RDAP unavailable"], status: "unknown" };
    const j = await r.json();
    const reg = (j.events || []).find((e: any) => e.eventAction === "registration");
    if (!reg?.eventDate) return { name: "Domain Age", score: 0, weight: 0, evidence: ["Registration date not provided"], status: "unknown" };
    const days = Math.floor((Date.now() - new Date(reg.eventDate).getTime()) / 86400000);
    let score = 0; let status: Layer["status"] = "ok";
    const evidence = [`Domain registered ${days} days ago (${new Date(reg.eventDate).toISOString().slice(0,10)})`];
    if (days < 30) { score = 60; status = "bad"; evidence.push("Very new domain — common for phishing"); }
    else if (days < 90) { score = 35; status = "warn"; evidence.push("Recently registered domain"); }
    else if (days < 365) { score = 10; status = "warn"; }
    else { score = 0; status = "ok"; evidence.push("Well-aged domain"); }
    return { name: "Domain Age", score, weight: 0.15, evidence, status };
  } catch {
    return { name: "Domain Age", score: 0, weight: 0, evidence: ["WHOIS/RDAP lookup failed"], status: "unknown" };
  }
}

function sslLayer(url: string): Layer {
  try {
    const u = new URL(url);
    if (u.protocol === "https:") {
      return { name: "Transport Security", score: 0, weight: 0.05, evidence: ["URL uses HTTPS"], status: "ok" };
    }
    return { name: "Transport Security", score: 35, weight: 0.05, evidence: ["URL is plain HTTP — no encryption in transit"], status: "warn" };
  } catch {
    return { name: "Transport Security", score: 0, weight: 0, evidence: ["URL could not be parsed"], status: "unknown" };
  }
}

async function geminiLayer(url: string, layers: Layer[]): Promise<{ layer: Layer; ai: any | null }> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return { layer: { name: "AI Reasoning", score: 0, weight: 0, evidence: ["AI gateway not configured"], status: "unknown" }, ai: null };
  try {
    const summary = layers.map(l => `${l.name}: ${l.status} (${l.score}) — ${l.evidence.join("; ")}`).join("\n");
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a cautious cybersecurity analyst. EVIDENCE-ONLY: every number, vendor count or claim in your response MUST come from the layer evidence below — NEVER invent vendor counts, statistics, or breaches. If a single VirusTotal vendor (1/many) flags a URL while 20+ mark it harmless, treat it as a likely false positive and DO NOT call it malicious. Mark 'malicious' only when: VirusTotal malicious >= 2, OR raw-IP host, OR clear brand impersonation in hostname, OR homograph/punycode, OR 3+ strong heuristic flags. For unfamiliar but otherwise-clean domains, prefer verdict='safe' with confidence 50-70 over alarmist 'suspicious'. Quote the actual numbers from the evidence (e.g. '1 of 93 vendors flagged'). Output structured JSON via the tool." },
          { role: "user", content: `URL: ${url}\n\nLayer evidence:\n${summary}` },
        ],
        tools: [{ type: "function", function: { name: "report_url_analysis", parameters: {
          type: "object",
          properties: {
            verdict: { type: "string", enum: ["safe","unknown","suspicious","malicious"] },
            confidence: { type: "integer", minimum: 0, maximum: 100 },
            risk_score: { type: "integer", minimum: 0, maximum: 100 },
            category: { type: "string" },
            explanation: { type: "string" },
            recommendation: { type: "string" },
            red_flags: { type: "array", items: { type: "string" } },
            mitre_techniques: { type: "array", items: { type: "object", properties: {
              id: { type: "string" }, name: { type: "string" }, tactic: { type: "string" },
              description: { type: "string" }, detection: { type: "string" },
            }, required: ["id","name","tactic","description","detection"], additionalProperties: false } },
          },
          required: ["verdict","confidence","risk_score","explanation","recommendation","red_flags","mitre_techniques"],
          additionalProperties: false,
        }}}],
        tool_choice: { type: "function", function: { name: "report_url_analysis" } },
      }),
    });
    if (!r.ok) return { layer: { name: "AI Reasoning", score: 0, weight: 0, evidence: [`AI gateway error ${r.status}`], status: "unknown" }, ai: null };
    const j = await r.json();
    const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const ai = args ? JSON.parse(args) : null;
    if (!ai) return { layer: { name: "AI Reasoning", score: 0, weight: 0, evidence: ["AI returned no structured output"], status: "unknown" }, ai: null };
    return {
      layer: {
        name: "AI Reasoning",
        score: ai.risk_score ?? 0,
        weight: 0.20,
        evidence: [ai.explanation, ...(ai.red_flags || [])].filter(Boolean),
        status: ai.verdict === "malicious" ? "bad" : ai.verdict === "suspicious" ? "warn" : ai.verdict === "safe" ? "ok" : "unknown",
      },
      ai,
    };
  } catch {
    return { layer: { name: "AI Reasoning", score: 0, weight: 0, evidence: ["AI reasoning unavailable"], status: "unknown" }, ai: null };
  }
}

function blend(layers: Layer[]) {
  let num = 0, denom = 0;
  for (const l of layers) { num += l.score * l.weight; denom += l.weight; }
  const score = denom > 0 ? Math.round(num / denom) : 0;
  const confident = layers.filter(l => l.status !== "unknown").length;
  const total = layers.length;
  const confidence = Math.round((confident / total) * 100);
  return { score, confidence };
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
    let host = "";
    try { host = new URL(url).hostname.toLowerCase(); } catch {
      return new Response(JSON.stringify({
        verdict: "unknown", risk_score: 0, error_type: "invalid_url",
        message: "That doesn't look like a valid URL. Please paste a full link starting with http(s)://",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const heur = heuristicsLayer(url);
    const ssl = sslLayer(url);
    const [vtRaw, rdap] = await Promise.all([
      prefs.useVirusTotal ? virustotalUrl(url) : Promise.resolve({ error: "disabled" }),
      rdapAgeLayer(host),
    ]);
    const vt = vtRaw && !("error" in vtRaw) ? vtRaw : null;
    const vtError = vtRaw && "error" in vtRaw ? (vtRaw as any).error : null;
    const vtLayer = virustotalLayer(vtRaw);

    const preLayers: Layer[] = [heur, vtLayer, ssl, rdap];
    const { layer: aiLayer, ai } = prefs.useGemini ? await geminiLayer(url, preLayers) :
      { layer: { name: "AI Reasoning", score: 0, weight: 0, evidence: ["AI reasoning disabled"], status: "unknown" as const }, ai: null };

    const layers: Layer[] = [heur, vtLayer, ssl, rdap, aiLayer];
    const trusted = isTrusted(host);
    const { score: blendedScore, confidence: confCoverage } = blend(layers);

    // Final score with safety caps — trusted/clean wins over noisy single-vendor VT detections.
    let score = blendedScore;
    const vtMal = vt && !vt.pending ? (vt.malicious || 0) : 0;
    const vtHarm = vt && !vt.pending ? (vt.harmless || 0) : 0;
    const vtClean = vt && !vt.pending && vtMal === 0 && (vt.suspicious ?? 0) === 0 && vtHarm >= 3;
    const noisyFp = vtMal === 1 && vtHarm >= 20;
    if (trusted) score = Math.min(score, 8);
    if (vtClean && heur.score < 30) score = Math.min(score, 15);
    if (noisyFp && heur.score < 30) score = Math.min(score, 25);
    score = Math.max(0, Math.min(100, score));

    // Verdict — 6 levels. Require >=2 VT detections for "hardMalicious" — single-vendor flags are false-positive-prone.
    let verdict_level: string;
    let verdict: "safe"|"suspicious"|"malicious"|"unknown";
    const hardMalicious = !trusted && ((vt && !vt.pending && vtMal >= 2) || heur.score >= 70);
    if (hardMalicious || score >= 80) { verdict_level = "Malicious"; verdict = "malicious"; }
    else if (score >= 60) { verdict_level = "High Risk"; verdict = "malicious"; }
    else if (score >= 40) { verdict_level = "Suspicious"; verdict = "suspicious"; }
    else if (trusted) { verdict_level = "Trusted"; verdict = "safe"; }
    else if (score >= 20) { verdict_level = "Unknown"; verdict = "suspicious"; }
    else if (vtClean) { verdict_level = "Trusted"; verdict = "safe"; }
    else { verdict_level = "Likely Safe"; verdict = "safe"; }

    // Confidence — blend AI confidence with layer coverage
    const aiConf = ai?.confidence ?? 50;
    const confidence = Math.round(0.6 * aiConf + 0.4 * confCoverage);

    const recommendation = ai?.recommendation || (
      verdict === "malicious" ? "Do not open this link. Block it and report it." :
      verdict === "suspicious" ? "Treat this link with caution. Verify the sender and the destination before clicking." :
      "No strong threat signals detected. Stay alert when entering credentials."
    );

    const explain = ai?.explanation || (
      trusted ? "Hostname is on the trusted-domain allowlist with no negative signals." :
      vtClean ? "Major threat feeds report this URL as clean." :
      "No strong negative signals were found, but threat-intelligence coverage is limited."
    );

    const allEvidence = layers.flatMap(l => l.evidence.map(e => ({ layer: l.name, status: l.status, text: e })));

    return new Response(JSON.stringify({
      verdict, risk_score: score, verdict_level, confidence,
      is_phishing: verdict !== "safe",
      phishing_label: verdict === "malicious" ? "Phishing / Malicious"
        : verdict === "suspicious" ? "Potentially Suspicious"
        : "Not Phishing — Legitimate",
      layers, evidence: allEvidence,
      heuristics: { score: heur.score, reasons: heur.evidence },
      virustotal: vt,
      vt_status: vtError ? vtError : (vt?.pending ? "pending" : vt ? "ok" : "unavailable"),
      ai_analysis: explain, explanation: explain, recommendation,
      red_flags: verdict === "safe" ? [] : (ai?.red_flags?.length ? ai.red_flags : heur.evidence),
      category: ai?.category || null,
      mitre_techniques: verdict === "safe" ? [] : (ai?.mitre_techniques || []),
      normalized_url: url,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), message: "We couldn't complete the scan. Please try again." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
