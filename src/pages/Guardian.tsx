import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Shield, ShieldAlert, ShieldCheck, BellRing, PhoneCall, Eye,
  ExternalLink, Lock, AlertTriangle, CheckCircle2, Smartphone, Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import {
  guardianAvailable,
  getGuardianStatus,
  setGuardianEnabled,
  setCallProtection,
  setPhishingUiDetection,
  setAlertThreshold,
  getThreatLog,
  clearThreatLog,
  openNotificationAccess,
  openAccessibility,
  onGuardianAlert,
  type GuardianAlert,
  type GuardianStatus,
} from "@/lib/guardian";
import { Slider } from "@/components/ui/slider";
import { readConsent, writeConsent } from "@/lib/consent";

const MAX_FEED = 50;

export default function Guardian() {
  const native = guardianAvailable();
  const [status, setStatus] = useState<GuardianStatus | null>(null);
  const [alerts, setAlerts] = useState<GuardianAlert[]>([]);
  const [consent, setConsent] = useState<boolean>(() => !!readConsent());

  const refresh = () => getGuardianStatus().then(setStatus);

  useEffect(() => {
    refresh();
    const v = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", v);
    const t = setInterval(refresh, 5000);
    return () => { document.removeEventListener("visibilitychange", v); clearInterval(t); };
  }, []);

  useEffect(() => {
    const off = onGuardianAlert((a) => {
      setAlerts((prev) => [a, ...prev].slice(0, MAX_FEED));
    });
    return off;
  }, []);

  const acceptConsent = () => {
    writeConsent({ notificationListener: true, tapGuard: true });
    setConsent(true);
  };

  const toggleMaster = async (on: boolean) => {
    await setGuardianEnabled(on);
    await refresh();
    toast({ title: on ? "Real-time protection enabled" : "Protection paused" });
  };
  const toggleCall = async (on: boolean) => { await setCallProtection(on); await refresh(); };
  const togglePhish = async (on: boolean) => { await setPhishingUiDetection(on); await refresh(); };

  const allOk = !!status && status.notificationAccess && status.guardianEnabled;

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold text-gradient-cyber">Real-Time Guardian</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1 max-w-md">
            On-device scam detection for notifications, links and calls. Privacy-first,
            explainable, and fully opt-in.
          </p>
        </div>
        <StatusPill ok={allOk} native={native} />
      </header>

      {!native && (
        <Card className="p-4 border-warning/40 bg-warning/5">
          <div className="flex gap-3">
            <Smartphone className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <div className="font-semibold">Available on the Android app</div>
              <p className="text-muted-foreground text-xs">
                Real-time notification, link and call protection runs inside the native
                Android service. Install the CyberSmart Android build to enable it. The
                rest of the app (URL / message / file scanners, AI Copilot, vault,
                blockchain log) is fully available on web.
              </p>
            </div>
          </div>
        </Card>
      )}

      {native && !consent && <ConsentCard onAccept={acceptConsent} />}

      {native && consent && (
        <>
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">Master switch</div>
                <p className="text-xs text-muted-foreground">
                  Pause all real-time analysis without revoking system permissions.
                </p>
              </div>
              <Switch checked={!!status?.guardianEnabled} onCheckedChange={toggleMaster} />
            </div>

            <Separator />

            <PermissionRow
              icon={<BellRing className="h-4 w-4" />}
              title="Notification access"
              desc="Required for SMS / WhatsApp / email scam detection. Text is analyzed on-device; nothing is uploaded."
              granted={!!status?.notificationAccess}
              action={() => openNotificationAccess()}
            />

            <PermissionRow
              icon={<Eye className="h-4 w-4" />}
              title="Phishing-UI detection"
              desc="Optional. Flags fake login screens that impersonate brands inside unofficial apps. Never reads password fields or keystrokes."
              granted={!!status?.accessibilityEnabled}
              action={() => openAccessibility()}
              toggle={
                <Switch
                  checked={!!status?.phishingUiDetection}
                  onCheckedChange={togglePhish}
                  disabled={!status?.accessibilityEnabled}
                />
              }
            />

            <PermissionRow
              icon={<PhoneCall className="h-4 w-4" />}
              title="Call protection (hint-only)"
              desc="Warns about likely spam / withheld / unusual numbers. CyberSmart never auto-blocks calls."
              granted={!!status?.callProtectionEnabled}
              action={() => toast({ title: "Toggle the switch to enable hints" })}
              toggle={
                <Switch checked={!!status?.callProtectionEnabled} onCheckedChange={toggleCall} />
              }
            />
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Live alert feed</h2>
                <Badge variant="secondary" className="text-[10px]">{alerts.length}</Badge>
              </div>
              {alerts.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setAlerts([])}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear
                </Button>
              )}
            </div>

            {alerts.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">
                No threats detected. Guardian only surfaces messages it deems suspicious or worse —
                everything else is silently ignored on-device.
              </div>
            ) : (
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {alerts.map((a) => (
                    <motion.li
                      key={`${a.at}-${a.type}-${a.score}`}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <AlertRow a={a} />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </Card>
        </>
      )}

      <PrivacyCard />
    </div>
  );
}

function StatusPill({ ok, native }: { ok: boolean; native: boolean }) {
  if (!native) {
    return (
      <Badge variant="outline" className="text-[10px]">Web preview</Badge>
    );
  }
  return ok ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-full bg-success/15 text-success">
      <CheckCircle2 className="h-3 w-3" /> ACTIVE
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-full bg-warning/15 text-warning">
      <AlertTriangle className="h-3 w-3" /> SETUP NEEDED
    </span>
  );
}

function ConsentCard({ onAccept }: { onAccept: () => void }) {
  return (
    <Card className="p-4 border-primary/30 bg-primary/5">
      <div className="flex items-start gap-3">
        <Lock className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-2 text-sm">
          <div className="font-semibold">Privacy & consent</div>
          <p className="text-xs text-muted-foreground">
            Guardian runs entirely on your device. We never read your private app
            databases, never collect contacts, and never upload notification text to
            our servers. URL reputation lookups (VirusTotal) are only triggered when
            you explicitly tap <em>"Scan link"</em> on an alert.
          </p>
          <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
            <li>You can disable everything at any time from this screen.</li>
            <li>Each permission is granted in Android Settings — not by this app.</li>
            <li>No background spying. No accessibility keystroke capture.</li>
          </ul>
          <Button size="sm" onClick={onAccept} className="mt-1">I understand, continue</Button>
        </div>
      </div>
    </Card>
  );
}

function PermissionRow({
  icon, title, desc, granted, action, toggle,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  granted: boolean;
  action: () => void;
  toggle?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-8 w-8 rounded-lg bg-secondary/60 grid place-items-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{title}</span>
          {granted ? (
            <Badge className="text-[10px] bg-success/20 text-success border-success/30">Granted</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">Not granted</Badge>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{desc}</p>
        {!granted && (
          <Button variant="link" size="sm" onClick={action} className="px-0 h-auto text-xs mt-1">
            Open Android settings <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
        )}
      </div>
      {toggle && <div className="pt-1">{toggle}</div>}
    </div>
  );
}

function AlertRow({ a }: { a: GuardianAlert }) {
  const color =
    a.verdict === "danger" ? "border-danger/40 bg-danger/5"
    : a.verdict === "suspicious" ? "border-warning/40 bg-warning/5"
    : "border-success/40 bg-success/5";
  const Icon =
    a.verdict === "danger" ? ShieldAlert
    : a.verdict === "suspicious" ? AlertTriangle : ShieldCheck;
  const label =
    a.type === "call" ? `Suspicious call ${a.number ?? ""}`
    : a.type === "phishing_ui" ? `Fake "${a.brand}" login in ${a.package}`
    : `Scam content in ${a.source ?? "an app"}`;
  return (
    <div className={`rounded-lg border p-2.5 ${color}`}>
      <div className="flex items-start gap-2">
        <Icon className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium truncate">{label}</div>
            <Badge variant="outline" className="text-[10px] font-mono">{a.score}/100</Badge>
          </div>
          {a.reasons && a.reasons.length > 0 && (
            <ul className="text-[11px] text-muted-foreground mt-1 list-disc pl-4 space-y-0.5">
              {a.reasons.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
          {a.urls && a.urls.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {a.urls.slice(0, 3).map((u) => (
                <Link
                  key={u}
                  to={`/safe-link?u=${encodeURIComponent(u)}`}
                  className="text-[11px] inline-flex items-center gap-1 px-2 py-0.5 rounded bg-secondary/80 hover:bg-secondary"
                >
                  Scan link <ExternalLink className="h-3 w-3" />
                </Link>
              ))}
            </div>
          )}
          <div className="text-[10px] text-muted-foreground mt-1.5 font-mono">
            {new Date(a.at).toLocaleTimeString()}
          </div>
        </div>
      </div>
    </div>
  );
}

function PrivacyCard() {
  const items = useMemo(() => ([
    "All notification analysis runs locally on your device.",
    "Only the URLs you tap are sent to VirusTotal — never the message body.",
    "No contacts, photos, SMS database or call logs are ever accessed.",
    "Accessibility service ignores password fields and never logs keystrokes.",
    "Call screening is hint-only: CyberSmart never blocks or rejects a call.",
    "You can disable everything from this screen at any time.",
  ]), []);
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <Lock className="h-4 w-4 text-primary" />
        <h2 className="font-semibold text-sm">What Guardian does NOT do</h2>
      </div>
      <ul className="text-[11px] text-muted-foreground space-y-1 list-disc pl-4">
        {items.map((x) => <li key={x}>{x}</li>)}
      </ul>
    </Card>
  );
}
