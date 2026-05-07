const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { mode, topic, level = "beginner" } = await req.json();
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) throw new Error("LOVABLE_API_KEY missing");

    let system = "", user = "";
    if (mode === "lesson") {
      system = "You are a cybersecurity educator. Output strict JSON: {title, summary, sections:[{heading,body}], key_takeaways:string[], quiz:[{question,options:string[],correct_index,explanation}]}. 3-4 sections, 3 quiz questions.";
      user = `Create a ${level} lesson on: ${topic}`;
    } else if (mode === "phishing_sim") {
      system = "You are a phishing simulation generator. Output strict JSON: {scenario:{from,subject,body,channel:'email'|'sms'|'web'}, is_phishing:boolean, red_flags:string[], explanation:string, difficulty:'easy'|'medium'|'hard'}. Make it realistic.";
      user = `Generate a ${level} phishing scenario. Topic hint: ${topic || "random"}.`;
    } else {
      throw new Error("invalid mode");
    }
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_object" },
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (r.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const j = await r.json();
    const content = j.choices?.[0]?.message?.content || "{}";
    return new Response(content, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
