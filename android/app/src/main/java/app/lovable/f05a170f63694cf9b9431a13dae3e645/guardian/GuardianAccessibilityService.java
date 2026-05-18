package app.lovable.f05a170f63694cf9b9431a13dae3e645.guardian;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import com.getcapacitor.JSObject;

import org.json.JSONArray;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Strictly scoped accessibility usage (Google Play compliant):
 *
 *  - Only inspects on-screen TEXT (titles, labels) — never password fields.
 *  - Triggers ONLY on WINDOW_STATE_CHANGED, not on every keystroke.
 *  - Does not capture, log, or transmit user input.
 *  - Used solely to flag suspected fake-login / phishing UIs that impersonate
 *    well-known brands but are hosted in a non-browser, non-official app.
 */
public class GuardianAccessibilityService extends AccessibilityService {

    private static final String[] BRANDS = {
            "paypal", "google", "gmail", "facebook", "instagram", "whatsapp",
            "apple id", "icloud", "microsoft", "outlook", "amazon", "netflix",
            "chase", "wells fargo", "bank of america", "hsbc", "barclays",
            "metamask", "binance", "coinbase"
    };

    private static final String[] LOGIN_HINTS = {
            "sign in", "log in", "login", "verify", "confirm your identity",
            "enter password", "enter pin", "seed phrase", "recovery phrase"
    };

    private long lastEmit = 0L;

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        if (event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        if (!GuardianPrefs.isEnabled(this) || !GuardianPrefs.isAccessibilityScanEnabled(this)) return;

        long now = System.currentTimeMillis();
        if (now - lastEmit < 3000L) return; // throttle

        try {
            CharSequence pkg = event.getPackageName();
            String pkgStr = pkg == null ? "" : pkg.toString();
            if (pkgStr.isEmpty() || pkgStr.equals(getPackageName())) return;
            if (isLikelyBrowser(pkgStr)) return; // browsers have their own URL guard

            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root == null) return;

            List<String> texts = new ArrayList<>();
            collectTexts(root, texts, 0);
            String hay = String.join(" \n ", texts).toLowerCase(Locale.ROOT);
            if (hay.isEmpty()) return;

            String brand = null;
            for (String b : BRANDS) if (hay.contains(b)) { brand = b; break; }
            if (brand == null) return;

            boolean looksLikeLogin = false;
            for (String h : LOGIN_HINTS) if (hay.contains(h)) { looksLikeLogin = true; break; }
            if (!looksLikeLogin) return;

            if (isOfficialAppFor(brand, pkgStr)) return;

            lastEmit = now;
            JSObject obj = new JSObject();
            obj.put("type", "phishing_ui");
            obj.put("package", pkgStr);
            obj.put("brand", brand);
            obj.put("score", 85);
            obj.put("verdict", "danger");
            List<String> reasons = new ArrayList<>();
            reasons.add("Login screen claiming to be \"" + brand + "\" inside an unofficial app");
            obj.put("reasons", new JSONArray(reasons));
            obj.put("at", now);
            GuardianBridge.emit(obj);
        } catch (Throwable ignored) { }
    }

    @Override public void onInterrupt() { }

    private void collectTexts(AccessibilityNodeInfo node, List<String> out, int depth) {
        if (node == null || depth > 8 || out.size() > 200) return;
        // Skip password / sensitive input fields explicitly.
        if (node.isPassword()) return;
        CharSequence t = node.getText();
        if (t != null && t.length() > 0 && t.length() < 200) out.add(t.toString());
        CharSequence d = node.getContentDescription();
        if (d != null && d.length() > 0 && d.length() < 200) out.add(d.toString());
        for (int i = 0; i < node.getChildCount(); i++) {
            collectTexts(node.getChild(i), out, depth + 1);
        }
    }

    private static boolean isLikelyBrowser(String pkg) {
        return pkg.contains("chrome") || pkg.contains("firefox") || pkg.contains("browser")
                || pkg.contains("opera") || pkg.contains("edge") || pkg.contains("brave")
                || pkg.contains("duckduckgo");
    }

    private static boolean isOfficialAppFor(String brand, String pkg) {
        switch (brand) {
            case "paypal":     return pkg.startsWith("com.paypal");
            case "google":
            case "gmail":      return pkg.startsWith("com.google");
            case "facebook":   return pkg.startsWith("com.facebook");
            case "instagram":  return pkg.equals("com.instagram.android");
            case "whatsapp":   return pkg.startsWith("com.whatsapp");
            case "apple id":
            case "icloud":     return pkg.startsWith("com.apple");
            case "microsoft":
            case "outlook":    return pkg.startsWith("com.microsoft");
            case "amazon":     return pkg.startsWith("com.amazon");
            case "netflix":    return pkg.equals("com.netflix.mediaclient");
            case "metamask":   return pkg.startsWith("io.metamask");
            case "binance":    return pkg.startsWith("com.binance");
            case "coinbase":   return pkg.startsWith("com.coinbase");
            default:           return false;
        }
    }
}
