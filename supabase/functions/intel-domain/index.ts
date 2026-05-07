const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function dns(name: string, type: string) {
  try {
    const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`);
    const j = await r.json();
    return (j.Answer || []).map((a: any) => a.data);
  } catch { return []; }
}

async function rdap(domain: string) {
  try {
    const r = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`);
    if (!r.ok) return null;
    const j = await r.json();
    const events: Record<string, string> = {};
    for (const e of j.events || []) events[e.eventAction] = e.eventDate;
    return {
      registrar: j.entities?.find((e: any) => e.roles?.includes("registrar"))?.vcardArray?.[1]?.find((v: any) => v[0] === "fn")?.[3] || null,
      registered: events.registration || null,
      expires: events.expiration || null,
      lastChanged: events["last changed"] || null,
      status: j.status || [],
      nameservers: (j.nameservers || []).map((n: any) => n.ldhName),
    };
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { domain } = await req.json();
    const clean = String(domain).replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
    const [a, aaaa, mx, txt, ns, whois] = await Promise.all([
      dns(clean, "A"), dns(clean, "AAAA"), dns(clean, "MX"), dns(clean, "TXT"), dns(clean, "NS"), rdap(clean),
    ]);
    const ageDays = whois?.registered ? Math.floor((Date.now() - new Date(whois.registered).getTime()) / 86400000) : null;
    const risk = ageDays !== null && ageDays < 30 ? "suspicious" : "informational";
    return new Response(JSON.stringify({ domain: clean, dns: { a, aaaa, mx, txt, ns }, whois, ageDays, risk }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
