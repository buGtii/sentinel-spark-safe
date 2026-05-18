package app.lovable.f05a170f63694cf9b9431a13dae3e645.guardian;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Fast, fully on-device first-pass detector.
 *
 * Goal: classify ~95% of incoming notifications as benign without ever
 * leaving the device. Only the small set that passes this filter is then
 * promoted to the Lovable Cloud / VirusTotal pipeline for deeper analysis.
 *
 * No remote calls. No PII storage.
 */
public final class ScamHeuristics {

    private static final Pattern URL_RE = Pattern.compile(
            "(?i)\\b((?:https?://|www\\.)[\\w\\-._~:/?#\\[\\]@!$&'()*+,;=%]+)");

    /** High-signal scam phrases. Each match contributes to the risk score. */
    private static final String[] KEYWORDS = {
            "verify your account", "verify account", "account suspended",
            "account locked", "unusual login", "security alert",
            "click here", "click below", "claim your", "you have won",
            "you've won", "lottery", "prize", "gift card",
            "urgent action", "act now", "limited time",
            "wire transfer", "western union", "bitcoin", "btc wallet",
            "crypto wallet", "send usdt", "send eth",
            "reset password", "reset your password",
            "tax refund", "irs", "hmrc", "customs fee",
            "package delivery", "delivery failed", "redelivery",
            "kyc verification", "update your kyc",
            "otp", "one time password", "share otp", "share code",
            "investment opportunity", "guaranteed return",
            "romance", "lonely", "be my", "miss you",
            "job offer", "work from home", "easy money",
            "law enforcement", "arrest warrant", "court summon",
    };

    /** Shortener / typosquat-adjacent hosts that should boost the score. */
    private static final List<String> SUSPICIOUS_HOSTS = Arrays.asList(
            "bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "ow.ly",
            "rebrand.ly", "cutt.ly", "shorte.st", "adf.ly", "tiny.cc",
            "rb.gy", "lnkd.in", "shorturl.at"
    );

    public static class Result {
        public final int score;          // 0..100
        public final String verdict;     // safe | suspicious | danger
        public final List<String> urls;
        public final List<String> reasons;

        Result(int score, String verdict, List<String> urls, List<String> reasons) {
            this.score = score;
            this.verdict = verdict;
            this.urls = urls;
            this.reasons = reasons;
        }
    }

    public static Result analyze(String text) {
        List<String> reasons = new ArrayList<>();
        List<String> urls = extractUrls(text);
        int score = 0;

        String lower = text == null ? "" : text.toLowerCase(Locale.ROOT);

        int kwHits = 0;
        for (String k : KEYWORDS) {
            if (lower.contains(k)) {
                kwHits++;
                if (reasons.size() < 5) reasons.add("Matched scam phrase: \"" + k + "\"");
            }
        }
        score += Math.min(kwHits * 12, 50);

        if (!urls.isEmpty()) {
            score += 10;
            reasons.add(urls.size() + " link(s) embedded in message");
            for (String u : urls) {
                String host = hostOf(u);
                if (host == null) continue;
                if (SUSPICIOUS_HOSTS.contains(host)) {
                    score += 20;
                    reasons.add("Uses URL shortener: " + host);
                }
                if (host.matches(".*\\d{4,}.*")) {
                    score += 8;
                    reasons.add("Host contains long digit sequence: " + host);
                }
                if (host.contains("xn--")) {
                    score += 15;
                    reasons.add("Punycode (possible IDN homograph): " + host);
                }
                if (host.length() > 40) {
                    score += 6;
                    reasons.add("Unusually long host: " + host);
                }
            }
        }

        // OTP / code requests are almost always social engineering when paired
        // with urgency keywords.
        if (lower.contains("otp") && (lower.contains("share") || lower.contains("send"))) {
            score += 25;
            reasons.add("Requests user to share an OTP code");
        }

        if (score > 100) score = 100;
        String verdict = score >= 70 ? "danger" : score >= 35 ? "suspicious" : "safe";
        return new Result(score, verdict, urls, reasons);
    }

    public static List<String> extractUrls(String text) {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        if (text == null) return new ArrayList<>(out);
        Matcher m = URL_RE.matcher(text);
        while (m.find()) {
            String u = m.group(1);
            if (u.toLowerCase(Locale.ROOT).startsWith("www.")) u = "http://" + u;
            out.add(u);
        }
        return new ArrayList<>(out);
    }

    private static String hostOf(String url) {
        try {
            java.net.URI uri = java.net.URI.create(url);
            String h = uri.getHost();
            return h == null ? null : h.toLowerCase(Locale.ROOT);
        } catch (Exception e) {
            return null;
        }
    }

    private ScamHeuristics() {}
}
