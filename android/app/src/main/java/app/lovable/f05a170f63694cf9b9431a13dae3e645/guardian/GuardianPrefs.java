package app.lovable.f05a170f63694cf9b9431a13dae3e645.guardian;

import android.content.Context;
import android.content.SharedPreferences;

/** Local-only flags. No PII is ever persisted. */
final class GuardianPrefs {
    private static final String FILE = "cybersmart_guardian";
    private static final String K_ENABLED = "enabled";
    private static final String K_CALL = "call_protection";
    private static final String K_A11Y = "a11y_scan";

    private static SharedPreferences p(Context c) {
        return c.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    static boolean isEnabled(Context c) { return p(c).getBoolean(K_ENABLED, false); }
    static void setEnabled(Context c, boolean v) { p(c).edit().putBoolean(K_ENABLED, v).apply(); }

    static boolean isCallProtectionEnabled(Context c) { return p(c).getBoolean(K_CALL, false); }
    static void setCallProtectionEnabled(Context c, boolean v) { p(c).edit().putBoolean(K_CALL, v).apply(); }

    static boolean isAccessibilityScanEnabled(Context c) { return p(c).getBoolean(K_A11Y, false); }
    static void setAccessibilityScanEnabled(Context c, boolean v) { p(c).edit().putBoolean(K_A11Y, v).apply(); }

    private GuardianPrefs() {}
}
