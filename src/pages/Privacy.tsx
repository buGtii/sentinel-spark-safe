import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Lock, Eye, Link2, Clipboard, Database, Trash2, ShieldCheck,
  BellRing, PhoneCall, ArrowLeft, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { readConsent, writeConsent, revokeConsent, type ConsentCapability } from "@/lib/consent";
import { isClipboardGuardEnabled, setClipboardGuard } from "@/lib/clipboardGuard";

const DATA_TABLE: Array<{ name: string; where: string; purpose: string; leaves: string }> = [
  { name: "Notification text", where: "Device memory only",
    purpose: "On-device scam heuristics", leaves: "Never" },
  { name: "Tapped URLs",        where: "Lovable Cloud (VirusTotal proxy)",
    purpose: "Reputation lookup", leaves: "Only the URL, on tap" },
  { name: "Message you paste",  where: "Lovable Cloud (AI gateway)",
    purpose: "Phishing classification", leaves: "Only when you submit" },
  { name: "Auth email",         where: "Lovable Cloud (Supabase Auth)",
    purpose: "Login", leaves: "Never to third parties" },
  { name: "Scan history",       where: "Your database row (RLS)",
    purpose: "Show your history", leaves: "Never — only you can read" },
  { name: "Vault items",        where: "AES-256-GCM, client-encrypted",
    purpose: "Secret storage", leaves: "Encrypted blob only; key never leaves device" },
  { name: "Clipboard text",     where: "Read in-memory on focus",
    purpose: "URL pre-scan", leaves: "Never; URL only if you tap Scan" },
  { name: "Keystrokes / passwords", where: "Never read", purpose: "—", leaves: "Never" },
  { name: "Contacts / call log / SMS DB", where: "Never read", purpose: "—", leaves: "Never" },
];

export default function Privacy() {
  const nav = useNavigate();
  const [consent, setConsent] = useState(readConsent());
  const [clip, setClip] = useState(isClipboardGuardEnabled());
  const [tapDisabled, setTapDisabled] = useState(
    localStorage.getItem("guardian.tapguard.disabled") === "1"
  );

  const setCap = (cap: ConsentCapability, on: boolean) => {
    const next = writeConsent({ ...(consent?.capabilities || {}), [cap]: on });
    setConsent(next);
  };

  const toggleClipboard = (on: boolean) => {
    setClipboardGuard(on);
    setClip(on);
    setCap("clipboardGuard", on);
  };

  const toggleTapGuard = (on: boolean) => {
    localStorage.setItem("guardian.tapguard.disabled", on ? "0" : "1");
    setTapDisabled(!on);
    setCap("tapGuard", on);
  };

  const wipeLocal = () => {
    const keys = [
      "cybersmart.linkguard.cache",
      "guardian.clipboard.seenHash",
      "guardian.onboarding.seen",
    ];
    keys.forEach(k => localStorage.removeItem(k));
    toast.success("Local caches wiped");
  };

  const revoke = () => {
    revokeConsent();
    localStorage.setItem("guardian.tapguard.disabled", "1");
    setClipboardGuard(false);
    setConsent(null);
    setClip(false);
    setTapDisabled(true);
    toast.success("Consent revoked. All on-device protections paused.");
  };

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <button onClick={() => nav(-1)} className="p-2 rounded-lg hover:bg-secondary/60 mt-0.5">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Lock className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold text-gradient-cyber">Privacy Center</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Full transparency about every byte of data CyberSmart touches, and one-tap
            control to enable, disable or wipe it.
          </p>
        </div>
      </header>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Your consent</h3>
          {consent
            ? <Badge variant="outline" className="text-[10px]">
                v{consent.version} · {new Date(consent.acceptedAt).toLocaleDateString()}
              </Badge>
            : <Badge variant="outline" className="text-[10px]">Not set</Badge>}
        </div>
        <CapRow icon={<Link2 className="h-4 w-4" />} title="Auto-scan tapped links"
          desc="Every outbound link routes through Safe Link Guard for a pre-open warning."
          checked={!tapDisabled} onChange={toggleTapGuard} />
        <CapRow icon={<Clipboard className="h-4 w-4" />} title="Clipboard URL guard"
          desc="When you return to the app, peek the clipboard once and flag risky URLs."
          checked={clip} onChange={toggleClipboard} />
        <CapRow icon={<BellRing className="h-4 w-4" />} title="Notification scanning (Android)"
          desc="On-device analysis of notification text from SMS / WhatsApp / email apps."
          checked={!!consent?.capabilities?.notificationListener}
          onChange={(v) => setCap("notificationListener", v)} />
        <CapRow icon={<Eye className="h-4 w-4" />} title="Phishing-UI detection (Android)"
          desc="Strictly scoped Accessibility usage. Skips password fields and keystrokes."
          checked={!!consent?.capabilities?.phishingUi}
          onChange={(v) => setCap("phishingUi", v)} />
        <CapRow icon={<PhoneCall className="h-4 w-4" />} title="Spam-call hints (Android)"
          desc="Warns about likely spam numbers. Never auto-blocks or rejects calls."
          checked={!!consent?.capabilities?.callProtection}
          onChange={(v) => setCap("callProtection", v)} />
        <Separator className="my-3" />
        <div className="flex flex-wrap gap-2">
          <Link to="/guardian" className="text-xs underline text-primary">Open Guardian dashboard →</Link>
          <button onClick={revoke} className="ml-auto text-xs text-destructive underline">
            Revoke all consent
          </button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Database className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Data map</h3>
        </div>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-[11px] border-collapse">
            <thead className="text-muted-foreground">
              <tr className="text-left">
                <th className="py-1 pr-3 font-mono">DATA</th>
                <th className="py-1 pr-3 font-mono">WHERE</th>
                <th className="py-1 pr-3 font-mono">PURPOSE</th>
                <th className="py-1 font-mono">LEAVES DEVICE?</th>
              </tr>
            </thead>
            <tbody>
              {DATA_TABLE.map((r) => (
                <tr key={r.name} className="border-t border-border/40 align-top">
                  <td className="py-1.5 pr-3 font-medium">{r.name}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{r.where}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{r.purpose}</td>
                  <td className="py-1.5 text-muted-foreground">{r.leaves}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Your rights</h3>
        </div>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
          <li><strong>Access</strong> — every scan is in your History page; vault export is one-tap.</li>
          <li><strong>Erasure</strong> — wipe local caches below, delete scan rows from History, or delete your account from Settings.</li>
          <li><strong>Portability</strong> — vault items export as an AES-256-GCM JSON blob you can restore on any device.</li>
          <li><strong>Withdraw consent</strong> — revoking above immediately stops every on-device probe.</li>
        </ul>
        <Button variant="outline" size="sm" onClick={wipeLocal} className="mt-3">
          <Trash2 className="h-3.5 w-3.5 mr-2" /> Wipe local caches now
        </Button>
      </Card>
    </div>
  );
}

function CapRow({ icon, title, desc, checked, onChange }: {
  icon: React.ReactNode; title: string; desc: string;
  checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="h-8 w-8 rounded-lg bg-secondary/60 grid place-items-center shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{title}</div>
        <p className="text-[11px] text-muted-foreground leading-snug">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
