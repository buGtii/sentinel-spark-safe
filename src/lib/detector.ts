// Pure, dependency-free scam detector. Mirrors the on-device Java
// `ScamHeuristics` so the web layer (Safe Link, tap guard, clipboard guard)
// and unit tests share the exact same logic.

export type Verdict = "safe" | "suspicious" | "danger";

export interface DetectionResult {
  score: number;          // 0..100
  verdict: Verdict;
  urls: string[];
  reasons: string[];
}

const URL_RE =
  /\b((?:https?:\/\/|www\.)[\w\-._~:/?#[\]@!$&'()*+,;=%]+)/gi;

const KEYWORDS = [
  "verify your account", "verify account", "account suspended",
  "account locked", "unusual login", "security alert",
  "click here", "click below", "claim your", "you have won",
  "you've won", "lottery", "prize", "gift card",
  "urgent action", "act now", "limited time",
  "wire transfer", "western union", "bitcoin", "btc wallet",
  "crypto wallet", "send usdt", "send eth",
  "reset password", "reset your password",
  "tax refund", "irs", "hmrc", "customs fee",
  "package delivery", "delivery failed", "redelivery",
  "kyc verification", "update your kyc",
  "otp", "one time password", "share otp", "share code",
  "investment opportunity", "guaranteed return",
  "romance", "lonely", "be my", "miss you",
  "job offer", "work from home", "easy money",
  "law enforcement", "arrest warrant", "court summon",
];

const SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "ow.ly",
  "rebrand.ly", "cutt.ly", "shorte.st", "adf.ly", "tiny.cc",
  "rb.gy", "lnkd.in", "shorturl.at",
]);

const BRAND_TOKENS = [
  "paypal", "google", "gmail", "apple", "icloud", "microsoft",
  "outlook", "amazon", "netflix", "facebook", "instagram",
  "whatsapp", "binance", "coinbase", "metamask", "chase",
  "wellsfargo", "barclays", "hsbc", "revolut",
];

function hostOf(url: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : "http://" + url);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function extractUrls(text: string): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const m of text.matchAll(URL_RE)) {
    let u = m[1];
    if (/^www\./i.test(u)) u = "http://" + u;
    out.add(u);
  }
  return [...out];
}

/**
 * Score a single URL in isolation (used by tap guard / clipboard guard before
 * the user touches the network).
 */
export function scoreUrl(url: string): DetectionResult {
  const reasons: string[] = [];
  let score = 0;
  const host = hostOf(url);

  if (!host) {
    return { score: 60, verdict: "suspicious", urls: [url],
      reasons: ["URL could not be parsed"] };
  }
  if (SHORTENERS.has(host)) {
    score += 40;
    reasons.push(`URL shortener (${host}) hides the real destination`);
  }
  if (host.includes("xn--")) {
    score += 45;
    reasons.push(`Punycode in host (${host}) — possible homograph attack`);
  }
  if (/\d{4,}/.test(host)) {
    score += 12;
    reasons.push(`Host contains a long digit sequence`);
  }
  if (host.split(".").length > 4) {
    score += 10;
    reasons.push(`Unusually deep subdomain chain`);
  }
  if (host.length > 40) {
    score += 8;
    reasons.push(`Unusually long hostname`);
  }
  for (const brand of BRAND_TOKENS) {
    if (host.includes(brand) && !host.endsWith(`.${brand}.com`) && host !== `${brand}.com`) {
      score += 55;
      reasons.push(`Looks like a "${brand}" lookalike domain`);
      break;
    }
  }
  if (/^http:\/\//i.test(url)) {
    score += 10;
    reasons.push("No HTTPS — credentials would travel in plain text");
  }
  if (/@/.test(url.split("://")[1] || "")) {
    score += 45;
    reasons.push("URL contains user-info ('@') which can mask the real host");
  }
  if (score > 100) score = 100;
  const verdict: Verdict = score >= 70 ? "danger" : score >= 35 ? "suspicious" : "safe";
  return { score, verdict, urls: [url], reasons };
}

export function analyzeMessage(text: string): DetectionResult {
  const reasons: string[] = [];
  const urls = extractUrls(text || "");
  let score = 0;

  const lower = (text || "").toLowerCase();
  let kwHits = 0;
  for (const k of KEYWORDS) {
    if (lower.includes(k)) {
      kwHits++;
      if (reasons.length < 5) reasons.push(`Matched scam phrase: "${k}"`);
    }
  }
  score += Math.min(kwHits * 15, 65);

  if (urls.length) {
    score += 10;
    reasons.push(`${urls.length} link(s) embedded in message`);
    for (const u of urls) {
      const sub = scoreUrl(u);
      score += Math.floor(sub.score / 2);
      for (const r of sub.reasons) if (reasons.length < 8) reasons.push(r);
    }
  }

  if (/\botp\b/.test(lower) && /(share|send|forward|tell)/.test(lower)) {
    score += 25;
    reasons.push("Requests user to share an OTP / verification code");
  }
  if (/(seed|recovery)\s*(phrase|words)/.test(lower)) {
    score += 70;
    reasons.push("Asks for crypto seed / recovery phrase");
  }
  if (/(urgent|immediately|within \d+ hours?)/.test(lower)) {
    score += 8;
    reasons.push("Uses urgency / time pressure");
  }

  if (score > 100) score = 100;
  const verdict: Verdict = score >= 70 ? "danger" : score >= 35 ? "suspicious" : "safe";
  return { score, verdict, urls, reasons };
}
