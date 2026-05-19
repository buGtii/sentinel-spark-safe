package app.lovable.f05a170f63694cf9b9431a13dae3e645.guardian;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Local-only flags + on-device threat log.
 * No PII is ever persisted — log entries store only redacted indicators
 * (source app, risk score, matched reason summary, timestamp).
 */
final class GuardianPrefs {
    private static final String FILE = "cybersmart_guardian";
    private static final String K_ENABLED = "enabled";
    private static final String K_CALL = "call_protection";
    private static final String K_A11Y = "a11y_scan";
    private static final String K_THRESHOLD = "alert_threshold";
    private static final String K_LOG = "threat_log";

    private static final int DEFAULT_THRESHOLD = 35;
    private static final int MAX_LOG_ENTRIES = 100;

    private static SharedPreferences p(Context c) {
        return c.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    static boolean isEnabled(Context c) { return p(c).getBoolean(K_ENABLED, false); }
    static void setEnabled(Context c, boolean v) { p(c).edit().putBoolean(K_ENABLED, v).apply(); }

    static boolean isCallProtectionEnabled(Context c) { return p(c).getBoolean(K_CALL, false); }
    static void setCallProtectionEnabled(Context c, boolean v) { p(c).edit().putBoolean(K_CALL, v).apply(); }

    static boolean isAccessibilityScanEnabled(Context c) { return p(c).getBoolean(K_A11Y, false); }
    static void setAccessibilityScanEnabled(Context c, boolean v) { p(c).edit().putBoolean(K_A11Y, v).apply(); }

    static int getThreshold(Context c) { return p(c).getInt(K_THRESHOLD, DEFAULT_THRESHOLD); }
    static void setThreshold(Context c, int v) {
        if (v < 0) v = 0; if (v > 100) v = 100;
        p(c).edit().putInt(K_THRESHOLD, v).apply();
    }

    /** Append a sanitized log entry. Keeps the last MAX_LOG_ENTRIES. */
    static void appendLog(Context c, JSONObject entry) {
        try {
            JSONArray arr = readLogArray(c);
            arr.put(entry);
            // trim
            while (arr.length() > MAX_LOG_ENTRIES) arr.remove(0);
            p(c).edit().putString(K_LOG, arr.toString()).apply();
        } catch (Exception ignored) {}
    }

    static JSONArray readLogArray(Context c) {
        String s = p(c).getString(K_LOG, "[]");
        try { return new JSONArray(s); } catch (JSONException e) { return new JSONArray(); }
    }

    static List<JSONObject> readLog(Context c) {
        JSONArray arr = readLogArray(c);
        List<JSONObject> out = new ArrayList<>(arr.length());
        for (int i = arr.length() - 1; i >= 0; i--) {
            JSONObject o = arr.optJSONObject(i);
            if (o != null) out.add(o);
        }
        return out;
    }

    static void clearLog(Context c) { p(c).edit().remove(K_LOG).apply(); }

    private GuardianPrefs() {}
}
