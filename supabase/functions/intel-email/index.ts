const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function parseHeaders(raw: string) {
  const out: Record<string, string[]> = {};
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  let cur = "";
  const buf: string[] = [];
  const push = () => {
    if (!cur) return;
    const i = cur.indexOf(":");
    if (i < 0) return;
    const k = cur.slice(0, i).trim().toLowerCase();
    const v = cur.slice(i + 1).trim();
    (out[k] ||= []).push(v);
  };
  for (const l of lines) {
    if (/^\s/.test(l) && cur) { cur += " " + l.trim(); continue; }
    push();
    cur = l;
  }
  push();
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { headers: raw } = await req.json();
    const h = parseHeaders(raw || "");
    const auth = (h["authentication-results"] || []).join(" | ");
    const spf = /spf=pass/i.test(auth) ? "pass" : /spf=fail/i.test(auth) ? "fail" : "unknown";
    const dkim = /dkim=pass/i.test(auth) ? "pass" : /dkim=fail/i.test(auth) ? "fail" : "unknown";
    const dmarc = /dmarc=pass/i.test(auth) ? "pass" : /dmarc=fail/i.test(auth) ? "fail" : "unknown";
    const received = h["received"] || [];
    const hops = received.map((r) => {
      const ipMatch = r.match(/\[(\d+\.\d+\.\d+\.\d+)\]/);
      const fromMatch = r.match(/from\s+([^\s]+)/i);
      return { ip: ipMatch?.[1] || null, from: fromMatch?.[1] || null, raw: r.slice(0, 220) };
    });
    const fromAddr = (h["from"] || [])[0] || "";
    const returnPath = (h["return-path"] || [])[0] || "";
    const replyTo = (h["reply-to"] || [])[0] || "";
    const mismatch = fromAddr && returnPath && !returnPath.toLowerCase().includes((fromAddr.match(/@([^>]+)/)?.[1] || "").toLowerCase());
    let verdict: "safe" | "suspicious" | "malicious" = "safe";
    let score = 10;
    if (spf === "fail" || dkim === "fail" || dmarc === "fail") { verdict = "malicious"; score = 85; }
    else if (mismatch || spf === "unknown" || dmarc === "unknown") { verdict = "suspicious"; score = 55; }
    return new Response(JSON.stringify({
      verdict, score, spf, dkim, dmarc, mismatch, hops: hops.slice(0, 12),
      from: fromAddr, returnPath, replyTo, subject: (h["subject"] || [])[0] || "",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
