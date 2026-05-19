package app.lovable.f05a170f63694cf9b9431a13dae3e645.guardian;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * Modular URL reputation scanner. Runs fully on-device using a curated
 * blocklist of suspicious TLDs / shortener hosts / brand-impersonation
 * patterns. The {@link #remoteCheckPlaceholder(String)} hook is the
 * extension point for VirusTotal / Google Safe Browsing — wired only when
 * the user explicitly taps "Scan link" in the alert UI.
 */
public final class UrlScanner {

    /** TLDs that are over-represented in phishing campaigns. */
    private static final List<String> RISKY_TLDS = Arrays.asList(
            ".xyz", ".click", ".top", ".gq", ".tk", ".ml", ".cf", ".ga",
            ".rest", ".loan", ".work", ".country", ".kim", ".science",
            ".support", ".zip", ".mov", ".cam", ".lol"
    );

    /** Brands that scammers commonly impersonate in look-alike domains. */
    private static final List<String> BRANDS = Arrays.asList(
            "paypal", "apple", "google", "microsoft", "amazon", "netflix",
            "instagram", "facebook", "whatsapp", "binance", "coinbase",
            "metamask", "chase", "hsbc", "barclays", "wellsfargo", "dhl",
            "fedex", "ups", "usps", "royalmail"
    );

    public static class Verdict {
        public final int score;             // 0..100
        public final String level;          // safe | suspicious | danger
        public final List<String> reasons;
        public final String host;

        Verdict(int score, String level, String host, List<String> reasons) {
            this.score = score; this.level = level; this.host = host; this.reasons = reasons;
        }
    }

    public static Verdict scan(String url) {
        List<String> reasons = new ArrayList<>();
        String host = hostOf(url);
        int score = 0;

        if (host == null) {
            reasons.add("URL could not be parsed");
            return new Verdict(60, "suspicious", null, reasons);
        }

        for (String tld : RISKY_TLDS) {
            if (host.endsWith(tld)) {
                score += 35;
                reasons.add("Uses high-risk TLD: " + tld);
                break;
            }
        }

        for (String brand : BRANDS) {
            if (!host.contains(brand)) continue;
            // Pure brand domain like paypal.com / accounts.google.com is fine.
            String root = rootDomain(host);
            if (root != null && root.equals(brand + ".com")) continue;
            score += 45;
            reasons.add("Impersonates brand \"" + brand + "\" in URL");
            break;
        }

        if (host.contains("xn--")) {
            score += 30;
            reasons.add("Punycode / IDN homograph in host");
        }
        if (host.matches(".*\\d{4,}.*")) {
            score += 10;
            reasons.add("Long digit sequence in host");
        }
        if (host.split("\\.").length > 4) {
            score += 15;
            reasons.add("Excessive subdomain depth");
        }
        if (host.length() > 50) {
            score += 8;
            reasons.add("Unusually long host name");
        }
        if (url != null && url.toLowerCase(Locale.ROOT).startsWith("http://")) {
            score += 8;
            reasons.add("Insecure HTTP (no TLS)");
        }

        if (score > 100) score = 100;
        String level = score >= 70 ? "danger" : score >= 35 ? "suspicious" : "safe";
        return new Verdict(score, level, host, reasons);
    }

    /**
     * Placeholder for VirusTotal / GSB integration. Returning null means
     * "not yet looked up". Real implementation should be called from a
     * coroutine on the user's explicit request — never from the listener.
     */
    public static String remoteCheckPlaceholder(String url) {
        return null;
    }

    private static String hostOf(String url) {
        try {
            java.net.URI uri = java.net.URI.create(url);
            String h = uri.getHost();
            return h == null ? null : h.toLowerCase(Locale.ROOT);
        } catch (Exception e) { return null; }
    }

    private static String rootDomain(String host) {
        if (host == null) return null;
        String[] parts = host.split("\\.");
        if (parts.length < 2) return host;
        return parts[parts.length - 2] + "." + parts[parts.length - 1];
    }

    private UrlScanner() {}
}
