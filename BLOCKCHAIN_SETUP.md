# Blockchain Setup — CyberSmartLogger

CyberSmart logs every scan to an immutable ledger. Two modes:

1. **Mock mode (default)** — uses browser `localStorage`. No setup, no wallet needed.
2. **Real mode** — Sepolia testnet via `ethers.js` + MetaMask.

## Deploy CyberSmartLogger.sol to Sepolia

1. Open [Remix IDE](https://remix.ethereum.org)
2. Create file `CyberSmartLogger.sol` and paste contents from `contracts/CyberSmartLogger.sol`
3. Compile with Solidity 0.8.20+
4. In **Deploy & Run**:
   - Environment: *Injected Provider — MetaMask*
   - Network: **Sepolia** (get test ETH from https://sepoliafaucet.com)
   - Click **Deploy**
5. Copy the deployed contract address.
6. In CyberSmart → **Settings → Blockchain**:
   - Toggle **Real blockchain mode** ON
   - Paste contract address
   - Connect MetaMask (Sepolia)

That's it. Scans now log on-chain. View on https://sepolia.etherscan.io/address/&lt;your-contract&gt;
