package app.lovable.f05a170f63694cf9b9431a13dae3e645.guardian;

import android.os.Build;
import android.telecom.Call;
import android.telecom.CallScreeningService;

import androidx.annotation.RequiresApi;

import com.getcapacitor.JSObject;

import java.util.Locale;

/**
 * Lightweight CallScreeningService. We never auto-block — the user always
 * gets the call. We only emit a sanitized signal so the app can show an
 * in-app warning for unknown / pattern-matched numbers.
 *
 * To become the default caller-ID/spam app a user must grant the role from
 * system settings — until then this service silently no-ops.
 */
@RequiresApi(api = Build.VERSION_CODES.N)
public class GuardianCallScreeningService extends CallScreeningService {

    @Override
    public void onScreenCall(Call.Details details) {
        // Allow every call through. Privacy-first: no auto-blocking.
        respondToCall(details, new CallResponse.Builder().build());

        if (!GuardianPrefs.isEnabled(this) || !GuardianPrefs.isCallProtectionEnabled(this)) return;

        try {
            String number = details.getHandle() == null ? "" : details.getHandle().getSchemeSpecificPart();
            int risk = scoreNumber(number);
            if (risk < 35) return;

            JSObject obj = new JSObject();
            obj.put("type", "call");
            obj.put("number", maskNumber(number));
            obj.put("score", risk);
            obj.put("verdict", risk >= 70 ? "danger" : "suspicious");
            obj.put("at", System.currentTimeMillis());
            GuardianBridge.emit(obj);
        } catch (Throwable ignored) { }
    }

    private static int scoreNumber(String n) {
        if (n == null || n.isEmpty()) return 80; // private / withheld
        String digits = n.replaceAll("[^0-9]", "");
        int score = 0;
        if (digits.length() < 6) score += 60;          // shortcodes, often spam
        if (digits.length() > 14) score += 20;         // unusually long
        if (digits.startsWith("00") || digits.startsWith("011")) score += 25; // intl
        return Math.min(score, 100);
    }

    private static String maskNumber(String n) {
        if (n == null || n.length() < 4) return "unknown";
        return n.substring(0, Math.min(3, n.length())) + "•••" + n.substring(n.length() - 2);
    }
}
