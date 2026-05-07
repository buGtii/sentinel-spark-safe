import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const SYSTEM_PROMPTS: Record<string, string> = {
  beginner: "You are CyberSmart Copilot, a friendly cybersecurity assistant for non-technical users. Explain threats in plain language, avoid jargon, give clear step-by-step safety advice. Keep replies short and reassuring.",
  analyst: "You are CyberSmart Copilot in Analyst mode. Be technical and precise. Reference IOCs, MITRE ATT&CK techniques, kill-chain stages, malware families, TLDs, ASN, and detection logic. Use markdown lists.",
  soc: "You are CyberSmart Copilot in SOC mode. Respond like a senior SOC analyst writing an incident note: triage summary, IOCs, severity, recommended containment, eradication, recovery, and detection rules (Sigma/YARA snippets when helpful). Be terse and structured.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { messages, mode = "beginner" } = await req.json();
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) throw new Error("LOVABLE_API_KEY missing");
    const sys = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.beginner;
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        stream: true,
        messages: [{ role: "system", content: sys }, ...messages],
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: "Rate limit, try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (r.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Workspace > Usage." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!r.ok) return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(r.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
