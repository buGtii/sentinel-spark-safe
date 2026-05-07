const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Uses HIBP password-range API (no key) for password checks.
// For email checks we use AI heuristic + recommend full HIBP service.
async function sha1(s: string) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { type, value } = await req.json();
    if (type === "password") {
      const h = await sha1(value);
      const prefix = h.slice(0, 5);
      const suffix = h.slice(5);
      const r = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
      const txt = await r.text();
      const line = txt.split("\n").find((l) => l.toUpperCase().startsWith(suffix));
      const count = line ? parseInt(line.split(":")[1]) : 0;
      return new Response(JSON.stringify({
        breached: count > 0, count,
        verdict: count > 100000 ? "malicious" : count > 0 ? "suspicious" : "safe",
        message: count > 0 ? `Seen in ${count.toLocaleString()} known breaches. Do not use.` : "Not found in known breach corpora.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (type === "email") {
      const parts = String(value).split("@");
      const domain = parts[1] || "";
      const common = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com"];
      const verdict = common.includes(domain.toLowerCase()) ? "informational" : "review";
      return new Response(JSON.stringify({
        verdict, message: "Free email check is heuristic. For full breach search, use haveibeenpwned.com.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: "unknown type" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
