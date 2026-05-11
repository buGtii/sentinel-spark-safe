import { useEffect, useState } from "react";
import { ShieldCheck, Link2, QrCode, MessageSquareWarning, Lock, Activity, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const STEPS = [
  { icon: ShieldCheck, title: "Welcome to CyberSmart", body: "Your AI cybersecurity assistant. We scan links, QR codes, messages, and files — and explain every verdict in plain English." },
  { icon: Link2, title: "Scan any URL", body: "Paste a link to get a layered analysis: heuristics, VirusTotal, domain age, SSL and AI reasoning — with a confidence score so you know how sure we are." },
  { icon: QrCode, title: "QR codes, safely", body: "Scan a QR with the camera or upload an image. We preview the hidden URL before opening anything, and you can open it inside our Safe Link sandbox." },
  { icon: MessageSquareWarning, title: "Catch scam messages", body: "Paste an SMS, email or chat message. We flag scam patterns, urgency tactics, and impersonation — without raising false alarms on real messages." },
  { icon: Lock, title: "Encrypted vault", body: "Store scam evidence, recovery codes and sensitive files. Everything is AES-256 encrypted on this device — we never see your passphrase." },
  { icon: Activity, title: "Risk score & history", body: "Every scan is saved (and optionally logged to blockchain). Review history, re-analyze old links, and watch your risk score improve over time." },
];

const KEY = "cybersmart.onboarded";

export function Onboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const nav = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(KEY)) setOpen(true);
  }, []);

  const close = (demo?: boolean) => {
    localStorage.setItem(KEY, "1");
    setOpen(false);
    if (demo) nav("/url");
  };

  if (!open) return null;
  const S = STEPS[step];
  const Icon = S.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm p-3">
      <div className="w-full max-w-md glass rounded-2xl p-5 border border-border shadow-2xl">
        <div className="flex justify-between items-center mb-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Step {step + 1} of {STEPS.length}</div>
          <button onClick={() => close()} className="p-1 rounded-md hover:bg-secondary/60" aria-label="Skip"><X className="h-4 w-4" /></button>
        </div>
        <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 ring-1 ring-primary/30 grid place-items-center mb-4">
          <Icon className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-lg font-bold text-center mb-2">{S.title}</h2>
        <p className="text-sm text-muted-foreground text-center leading-relaxed mb-5">{S.body}</p>
        <div className="flex gap-1.5 justify-center mb-4">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-primary" : "w-1.5 bg-border"}`} />
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => close()}>Skip</Button>
          {!isLast ? (
            <Button className="flex-1 gradient-cyber text-background font-semibold" onClick={() => setStep(s => s + 1)}>Next</Button>
          ) : (
            <Button className="flex-1 gradient-cyber text-background font-semibold" onClick={() => close(true)}>Try a demo scan</Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function resetOnboarding() {
  localStorage.removeItem(KEY);
}
