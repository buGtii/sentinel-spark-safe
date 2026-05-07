const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function detectChain(addr: string): string {
  if (/^0x[a-fA-F0-9]{40}$/.test(addr)) return "EVM (Ethereum / BSC / Polygon)";
  if (/^bc1[a-z0-9]{20,}$/i.test(addr) || /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(addr)) return "Bitcoin";
  if (/^T[a-zA-Z0-9]{33}$/.test(addr)) return "Tron";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) return "Solana";
  return "Unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { address } = await req.json();
    const chain = detectChain(String(address).trim());
    const key = Deno.env.get("LOVABLE_API_KEY");
    let ai: any = null;
    if (key && chain !== "Unknown") {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are a crypto threat analyst. Given a wallet address and chain, output strict JSON: {verdict:'safe'|'suspicious'|'malicious'|'unknown', risk_score:0-100, reasons:string[], recommendations:string[]}. You have no real on-chain data — base verdict on address pattern + general guidance. Default to 'unknown' with educational reasons." },
            { role: "user", content: `Chain: ${chain}\nAddress: ${address}` },
          ],
          response_format: { type: "json_object" },
        }),
      });
      const j = await r.json();
      try { ai = JSON.parse(j.choices?.[0]?.message?.content || "{}"); } catch {}
    }
    return new Response(JSON.stringify({
      address, chain,
      verdict: ai?.verdict || (chain === "Unknown" ? "unknown" : "review"),
      risk_score: ai?.risk_score ?? 30,
      reasons: ai?.reasons || ["Address format detected", "On-chain reputation requires Chainalysis/TRM API"],
      recommendations: ai?.recommendations || ["Cross-check on block explorer", "Search address on Etherscan / blockchain.com for label"],
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
