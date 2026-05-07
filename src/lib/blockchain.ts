import { ethers } from "ethers";

const ABI = [
  "function logScan(string scanType, string targetHash, string verdict, uint8 riskScore) external returns (uint256)",
  "function totalScans() external view returns (uint256)",
  "function getUserScans(address u) external view returns (uint256[])",
  "function getScan(uint256 id) external view returns (tuple(address user, string scanType, string targetHash, string verdict, uint8 riskScore, uint256 timestamp))",
  "event ScanLogged(uint256 indexed id, address indexed user, string scanType, string verdict, uint8 riskScore, uint256 timestamp)",
];

export type LogEntry = {
  id: string;
  scanType: string;
  targetHash: string;
  verdict: string;
  riskScore: number;
  timestamp: number;
  txHash?: string;
};

const LS_KEY = "cybersmart.mockLedger";
const CFG_KEY = "cybersmart.blockchainCfg";

export const BC_KEYS = { LS_KEY, CFG_KEY };

export type BlockchainCfg = {
  realMode: boolean;
  contractAddress: string;
};

export function getCfg(): BlockchainCfg {
  try { return JSON.parse(localStorage.getItem(CFG_KEY) || "") as BlockchainCfg; }
  catch { return { realMode: false, contractAddress: "" }; }
}
export function setCfg(c: BlockchainCfg) {
  // Lazy import to avoid circular dependency at module init
  import("@/lib/storage").then(m => m.kvSet(CFG_KEY, JSON.stringify(c)));
}

export type ChainStatus = {
  mode: "real" | "mock";
  ready: boolean;
  reason?: string;
  walletAddress?: string;
  network?: string;
  contract?: string;
};

export async function getChainStatus(): Promise<ChainStatus> {
  const cfg = getCfg();
  if (!cfg.realMode) return { mode: "mock", ready: true, reason: "Local mock ledger" };
  if (!cfg.contractAddress) return { mode: "real", ready: false, reason: "No contract address set" };
  const eth = (window as any).ethereum;
  if (!eth) return { mode: "real", ready: false, reason: "MetaMask not detected", contract: cfg.contractAddress };
  try {
    const provider = new ethers.BrowserProvider(eth);
    const accounts: string[] = await eth.request({ method: "eth_accounts" });
    if (!accounts?.length) return { mode: "real", ready: false, reason: "Wallet not connected", contract: cfg.contractAddress };
    const net = await provider.getNetwork();
    const networkName = net.chainId === 11155111n ? "Sepolia" : `Chain ${net.chainId}`;
    const ok = net.chainId === 11155111n;
    return {
      mode: "real", ready: ok,
      reason: ok ? "Connected to Sepolia" : "Wrong network — switch to Sepolia",
      walletAddress: accounts[0], network: networkName, contract: cfg.contractAddress,
    };
  } catch (e: any) {
    return { mode: "real", ready: false, reason: e?.message || "Wallet error", contract: cfg.contractAddress };
  }
}


async function sha256Hex(input: string) {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function readMock(): LogEntry[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}
function writeMock(items: LogEntry[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(items.slice(-500)));
}

export async function logToMock(p: Omit<LogEntry, "id" | "timestamp" | "targetHash"> & { target: string }) {
  const entry: LogEntry = {
    id: crypto.randomUUID(),
    scanType: p.scanType,
    verdict: p.verdict,
    riskScore: p.riskScore,
    targetHash: await sha256Hex(p.target),
    timestamp: Date.now(),
  };
  const items = readMock();
  items.push(entry);
  writeMock(items);
  return entry;
}

export function readMockLedger() { return readMock().sort((a, b) => b.timestamp - a.timestamp); }

export async function connectWallet() {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("MetaMask not detected");
  const provider = new ethers.BrowserProvider(eth);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  return { provider, signer, address: await signer.getAddress() };
}

export async function logToChain(p: { scanType: string; target: string; verdict: string; riskScore: number }) {
  const cfg = getCfg();
  if (!cfg.realMode || !cfg.contractAddress) {
    return { mode: "mock" as const, entry: await logToMock(p) };
  }
  try {
    const { signer } = await connectWallet();
    const targetHash = await sha256Hex(p.target);
    const c = new ethers.Contract(cfg.contractAddress, ABI, signer);
    const tx = await c.logScan(p.scanType, targetHash, p.verdict, p.riskScore);
    const receipt = await tx.wait();
    return { mode: "chain" as const, txHash: receipt?.hash, targetHash };
  } catch (e: any) {
    // Fallback to mock
    const entry = await logToMock(p);
    return { mode: "mock-fallback" as const, entry, error: e?.message || String(e) };
  }
}
