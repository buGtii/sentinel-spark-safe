import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { imageBase64, mimeType = "image/png" } = await req.json();
    if (!imageBase64) return new Response(JSON.stringify({ error: "imageBase64 required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) throw new Error("LOVABLE_API_KEY missing");

    const dataUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:${mimeType};base64,${imageBase64}`;
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a phishing-detection vision model. Analyze the screenshot for phishing, brand impersonation, fake login pages, scam SMS/email, urgency language, suspicious UI patterns. Respond ONLY by calling the tool." },
          { role: "user", content: [
            { type: "text", text: "Analyze this screenshot for phishing or scam indicators." },
            { type: "image_url", image_url: { url: dataUrl } },
          ] },
        ],
        tools: [{
          type: "function",
          function: {
            name: "report_phishing_analysis",
            description: "Return structured phishing analysis",
            parameters: {
              type: "object",
              properties: {
                verdict: { type: "string", enum: ["safe", "suspicious", "malicious", "unknown"] },
                risk_score: { type: "integer", minimum: 0, maximum: 100 },
                category: { type: "string" },
                impersonated_brand: { type: "string" },
                red_flags: { type: "array", items: { type: "string" } },
                explanation: { type: "string" },
                recommendation: { type: "string" },
              },
              required: ["verdict", "risk_score", "red_flags", "explanation", "recommendation"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "report_phishing_analysis" } },
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: "Rate limit, try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (r.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: "AI error", detail: t }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const j = await r.json();
    const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? JSON.parse(args) : { verdict: "unknown", risk_score: 0, red_flags: [], explanation: "No analysis returned", recommendation: "Try again." };
    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
