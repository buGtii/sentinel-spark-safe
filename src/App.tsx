import { Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import Auth from "./pages/Auth";
import Home from "./pages/Home";
import UrlScan from "./pages/UrlScan";
import MessageScan from "./pages/MessageScan";
import FileScan from "./pages/FileScan";
import IpScan from "./pages/IpScan";
import History from "./pages/History";
import Settings from "./pages/Settings";
import Copilot from "./pages/Copilot";
import QRScan from "./pages/QRScan";
import ScreenshotScan from "./pages/ScreenshotScan";
import Community from "./pages/Community";
import SOC from "./pages/SOC";
import DomainIntel from "./pages/DomainIntel";
import EmailHeaders from "./pages/EmailHeaders";
import BreachCheck from "./pages/BreachCheck";
import CryptoScan from "./pages/CryptoScan";
import Vault from "./pages/Vault";
import Learn from "./pages/Learn";
import PhishingSim from "./pages/PhishingSim";
import RiskScore from "./pages/RiskScore";
import PasswordLab from "./pages/PasswordLab";
import Totp from "./pages/Totp";
import Watchlist from "./pages/Watchlist";
import Streaks from "./pages/Streaks";
import ScamStory from "./pages/ScamStory";
import IocHunter from "./pages/IocHunter";
import YaraBuilder from "./pages/YaraBuilder";
import ThreatFeeds from "./pages/ThreatFeeds";
import SafeLink from "./pages/SafeLink";
import NotFound from "./pages/NotFound.tsx";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { installLinkGuard } from "@/lib/linkGuard";

function LinkGuardBridge() {
  const nav = useNavigate();
  useEffect(() => installLinkGuard(nav), [nav]);
  return null;
}

const qc = new QueryClient();

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <AppShell>{children}</AppShell>;
}

const App = () => (
  <QueryClientProvider client={qc}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <LinkGuardBridge />
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/" element={<Protected><Home /></Protected>} />
          <Route path="/url" element={<Protected><UrlScan /></Protected>} />
          <Route path="/message" element={<Protected><MessageScan /></Protected>} />
          <Route path="/file" element={<Protected><FileScan /></Protected>} />
          <Route path="/ip" element={<Protected><IpScan /></Protected>} />
          <Route path="/history" element={<Protected><History /></Protected>} />
          <Route path="/settings" element={<Protected><Settings /></Protected>} />
          <Route path="/copilot" element={<Protected><Copilot /></Protected>} />
          <Route path="/qr" element={<Protected><QRScan /></Protected>} />
          <Route path="/screenshot" element={<Protected><ScreenshotScan /></Protected>} />
          <Route path="/community" element={<Protected><Community /></Protected>} />
          <Route path="/soc" element={<Protected><SOC /></Protected>} />
          <Route path="/domain" element={<Protected><DomainIntel /></Protected>} />
          <Route path="/email-headers" element={<Protected><EmailHeaders /></Protected>} />
          <Route path="/breach" element={<Protected><BreachCheck /></Protected>} />
          <Route path="/crypto" element={<Protected><CryptoScan /></Protected>} />
          <Route path="/vault" element={<Protected><Vault /></Protected>} />
          <Route path="/learn" element={<Protected><Learn /></Protected>} />
          <Route path="/phishing-sim" element={<Protected><PhishingSim /></Protected>} />
          <Route path="/risk" element={<Protected><RiskScore /></Protected>} />
          <Route path="/password-lab" element={<Protected><PasswordLab /></Protected>} />
          <Route path="/totp" element={<Protected><Totp /></Protected>} />
          <Route path="/watchlist" element={<Protected><Watchlist /></Protected>} />
          <Route path="/streaks" element={<Protected><Streaks /></Protected>} />
          <Route path="/scam-story" element={<Protected><ScamStory /></Protected>} />
          <Route path="/ioc-hunter" element={<Protected><IocHunter /></Protected>} />
          <Route path="/yara" element={<Protected><YaraBuilder /></Protected>} />
          <Route path="/threat-feeds" element={<Protected><ThreatFeeds /></Protected>} />
          <Route path="/safe-link" element={<Protected><SafeLink /></Protected>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
