import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getCfg, setCfg, connectWallet, readMockLedger, getChainStatus, type ChainStatus } from "@/lib/blockchain";
import { getPrefs, setPrefs, type ScanPrefs } from "@/lib/prefs";
import { Settings as SettingsIcon, Wallet, Shield, Sparkles, Link2, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const [cfg, setCfgState] = useState(getCfg());
  const [prefs, setPrefsState] = useState<ScanPrefs>(getPrefs());
  const [addr, setAddr] = useState<string | null>(null);
  const [status, setStatus] = useState<ChainStatus | null>(null);

  async function refreshStatus() {
    setStatus(await getChainStatus());
  }
  useEffect(() => { refreshStatus(); }, [cfg.realMode, cfg.contractAddress]);

  function saveCfg(next = cfg) {
    setCfg(next); setCfgState(next); toast.success("Saved");
  }
  function savePrefs(next: ScanPrefs) {
    setPrefs(next); setPrefsState(next);
  }
  async function connect() {
    try {
      const { address } = await connectWallet();
      setAddr(address);
      toast.success("Wallet connected");
      refreshStatus();
    } catch (e: any) { toast.error(e.message); }
  }

  const ledger = readMockLedger();
  const validAddr = /^0x[a-fA-F0-9]{40}$/.test(cfg.contractAddress);

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-center gap-2 mb-2">
          <SettingsIcon className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">Settings</h2>
        </div>
      </header>

      {/* Scan engines */}
      <section className="glass rounded-2xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Scan Engines</h3>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">VirusTotal lookups</Label>
            <p className="text-xs text-muted-foreground">Cross-check URLs, IPs and file hashes against 70+ AV engines.</p>
          </div>
          <Switch
            checked={prefs.useVirusTotal}
            onCheckedChange={v => savePrefs({ ...prefs, useVirusTotal: v })}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-accent" /> Gemini AI analysis
            </Label>
            <p className="text-xs text-muted-foreground">Deep reasoning on URLs and message content for phishing intent.</p>
          </div>
          <Switch
            checked={prefs.useGemini}
            onCheckedChange={v => savePrefs({ ...prefs, useGemini: v })}
          />
        </div>
      </section>

      {/* Blockchain */}
      <section className="glass rounded-2xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Blockchain Logging</h3>
          </div>
          <button onClick={refreshStatus} className="p-1.5 rounded hover:bg-secondary/60" title="Refresh status">
            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
        {status && (
          <div className={`flex items-start gap-2 rounded-lg p-2.5 text-xs ${
            status.ready ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
          }`}>
            {status.ready
              ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="font-semibold">
                {status.mode === "real" ? "On-chain mode" : "Mock ledger mode"}
                {status.network && <span className="ml-1 opacity-70">· {status.network}</span>}
              </div>
              <div className="opacity-80">{status.reason}</div>
              {status.walletAddress && (
                <div className="font-mono text-[10px] opacity-70 truncate">
                  {status.walletAddress}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Real blockchain mode</Label>
            <p className="text-xs text-muted-foreground">
              Anchor scans on Sepolia via MetaMask. Off = local mock ledger.
            </p>
          </div>
          <Switch
            checked={cfg.realMode}
            onCheckedChange={v => {
              if (v && !validAddr) {
                toast.error("Enter a valid contract address first");
                return;
              }
              saveCfg({ ...cfg, realMode: v });
            }}
          />
        </div>
        <div>
          <Label>Contract address</Label>
          <Input
            placeholder="0x..."
            className="font-mono text-xs"
            value={cfg.contractAddress}
            onChange={e => setCfgState({ ...cfg, contractAddress: e.target.value })}
            onBlur={() => saveCfg()}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Deploy <code>contracts/CyberSmartLogger.sol</code> via Remix on Sepolia, paste address here.
          </p>
          {cfg.contractAddress && !validAddr && (
            <p className="text-[10px] text-destructive mt-1">Invalid Ethereum address format.</p>
          )}
        </div>
        <Button onClick={connect} variant="outline" className="w-full">
          <Wallet className="h-4 w-4 mr-2" />
          {addr ? `Connected: ${addr.slice(0,6)}…${addr.slice(-4)}` : "Connect MetaMask"}
        </Button>
        {cfg.realMode && validAddr && (
          <a
            href={`https://sepolia.etherscan.io/address/${cfg.contractAddress}`}
            target="_blank" rel="noreferrer"
            className="block text-xs text-accent hover:underline text-center"
          >
            View contract on Etherscan ↗
          </a>
        )}
      </section>

      {/* Mock ledger */}
      <section className="glass rounded-2xl p-4">
        <h3 className="font-semibold mb-2">Mock ledger ({ledger.length})</h3>
        <div className="space-y-1 max-h-64 overflow-auto">
          {ledger.slice(0, 20).map(e => (
            <div key={e.id} className="text-xs font-mono flex justify-between gap-2 p-2 rounded bg-secondary/40">
              <span className="text-primary">{e.scanType}</span>
              <span className="truncate flex-1 text-muted-foreground">{e.targetHash.slice(0, 16)}…</span>
              <span className="text-warning">{e.verdict}</span>
            </div>
          ))}
          {ledger.length === 0 && <p className="text-xs text-muted-foreground">Empty</p>}
        </div>
      </section>
    </div>
  );
}
