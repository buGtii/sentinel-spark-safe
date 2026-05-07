import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, User, Bot, Shield, Cpu, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Mode = "beginner" | "analyst" | "soc";
type Msg = { role: "user" | "assistant"; content: string };

const MODES: { id: Mode; label: string; icon: any; desc: string }[] = [
  { id: "beginner", label: "Beginner", icon: Shield, desc: "Plain-language safety guidance" },
  { id: "analyst", label: "Analyst", icon: Cpu, desc: "Technical IOCs & MITRE refs" },
  { id: "soc", label: "SOC", icon: Briefcase, desc: "Incident-response playbook style" },
];

export default function Copilot() {
  const [mode, setMode] = useState<Mode>("beginner");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const userMsg: Msg = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setBusy(true);

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot`;
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: next, mode }),
      });
      if (resp.status === 429) { toast.error("Rate limit, try again shortly."); setBusy(false); return; }
      if (resp.status === 402) { toast.error("AI credits exhausted."); setBusy(false); return; }
      if (!resp.ok || !resp.body) { toast.error("Copilot unavailable"); setBusy(false); return; }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { buf = ""; break; }
          try {
            const parsed = JSON.parse(json);
            const c = parsed.choices?.[0]?.delta?.content;
            if (c) {
              acc += c;
              setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: acc } : m));
            }
          } catch { buf = line + "\n" + buf; break; }
        }
      }
    } catch (e: any) {
      toast.error(e.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">AI Copilot</h2>
        </div>
        <p className="text-sm text-muted-foreground">Conversational cybersecurity assistant. Ask anything about scans, threats, or remediation.</p>
      </header>

      <div className="grid grid-cols-3 gap-2">
        {MODES.map(m => {
          const Icon = m.icon;
          const active = mode === m.id;
          return (
            <button key={m.id} onClick={() => setMode(m.id)}
              className={`p-3 rounded-xl text-left transition-all ${active ? "gradient-cyber glow text-background" : "glass hover:border-primary/40"}`}>
              <Icon className="h-4 w-4 mb-1" />
              <div className="text-xs font-bold">{m.label}</div>
              <div className={`text-[10px] ${active ? "opacity-90" : "text-muted-foreground"}`}>{m.desc}</div>
            </button>
          );
        })}
      </div>

      <div className="glass rounded-xl p-3 min-h-[300px] max-h-[55vh] overflow-y-auto space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            <Bot className="h-10 w-10 mx-auto mb-2 text-primary opacity-60" />
            Ask me about a phishing URL, suspicious email, malware, or how to respond to an incident.
          </div>
        )}
        {messages.map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className={`flex gap-2 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "assistant" && <Bot className="h-5 w-5 text-primary shrink-0 mt-1" />}
            <div className={`rounded-xl px-3 py-2 text-sm whitespace-pre-wrap max-w-[85%] ${
              m.role === "user" ? "bg-primary/15 text-foreground" : "bg-secondary/40"
            }`}>{m.content || "…"}</div>
            {m.role === "user" && <User className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />}
          </motion.div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="flex gap-2">
        <Textarea value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask the Copilot…" rows={2} className="resize-none" />
        <Button onClick={send} disabled={busy || !input.trim()} className="gradient-cyber text-background h-auto">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
