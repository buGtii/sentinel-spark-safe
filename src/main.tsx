import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { hydrateFromNative } from "./lib/storage";

const KEYS = ["cybersmart.prefs", "cybersmart.blockchainCfg", "cybersmart.mockLedger"];

hydrateFromNative(KEYS).finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
