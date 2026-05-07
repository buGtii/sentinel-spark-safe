const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Aggregates public threat feeds. Cached at function level via Deno default fetch.
async function urlhaus(): Promise<{ url: string; threat: string; date: string }[]> {
  try {
    const r = await fetch("https://urlhaus.abuse.ch/downloads/csv_recent/", { signal: AbortSignal.timeout(8000) });
    const txt = await r.text();
    const lines = txt.split("\n").filter(l => l && !l.startsWith("#"));
    return lines.slice(0, 50).map(l => {
      const cols = l.split(",").map(c => c.replace(/^"|"$/g, ""));
      return { url: cols[2] || "", threat: cols[5] || "malware", date: cols[1] || "" };
    }).filter(x => x.url);
  } catch { return []; }
}

async function openphish(): Promise<{ url: string; threat: string; date: string }[]> {
  try {
    const r = await fetch("https://openphish.com/feed.txt", { signal: AbortSignal.timeout(8000) });
    const txt = await r.text();
    return txt.split("\n").filter(Boolean).slice(0, 50).map(url => ({ url, threat: "phishing", date: new Date().toISOString() }));
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const [malware, phishing] = await Promise.all([urlhaus(), openphish()]);
    return new Response(JSON.stringify({
      sources: [
        { name: "URLhaus (abuse.ch)", count: malware.length, items: malware },
        { name: "OpenPhish", count: phishing.length, items: phishing },
      ],
      fetchedAt: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
