package app.lovable.f05a170f63694cf9b9431a13dae3e645.guardian;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import androidx.core.app.NotificationCompat;

import com.getcapacitor.JSObject;

import org.json.JSONArray;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Listens to system notifications (only after the user explicitly grants
 * Notification Access in Settings). For each post we:
 *
 *  1. Extract text locally
 *  2. Run the on-device heuristic
 *  3. If suspicious or worse, raise a CyberSmart warning notification
 *  4. Forward a sanitized alert object to the JS layer for the alert feed
 *
 * What we DO NOT do:
 *  - Persist the raw notification body anywhere
 *  - Read other apps' private databases
 *  - Auto-dismiss or modify the source notification
 *  - Send the raw text to a remote server (only the URLs do, via the user's
 *    own VirusTotal scan flow if they tap "Scan link")
 */
public class GuardianNotificationListener extends NotificationListenerService {

    private static final String CHANNEL_ID = "cybersmart_guardian";
    private static final String CHANNEL_NAME = "CyberSmart Threat Alerts";

    // De-dupe identical alerts within a short window (key -> postedAt).
    private final java.util.Map<String, Long> seen = new java.util.HashMap<>();

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannel();
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if (sbn == null) return;
            if (!GuardianPrefs.isEnabled(this)) return;
            // Ignore our own notifications.
            if (getPackageName().equals(sbn.getPackageName())) return;
            // Ignore ongoing/system service notifications (music, downloads…).
            Notification n = sbn.getNotification();
            if (n == null) return;
            if ((n.flags & Notification.FLAG_ONGOING_EVENT) != 0) return;

            String text = extractText(n);
            if (text == null || text.trim().length() < 4) return;

            ScamHeuristics.Result r = ScamHeuristics.analyze(text);

            // Fold per-URL scanner verdicts into the final score
            int boost = 0;
            for (String u : r.urls) {
                UrlScanner.Verdict v = UrlScanner.scan(u);
                if (v.score >= 35) {
                    boost = Math.max(boost, v.score / 2);
                    if (r.reasons.size() < 6 && !v.reasons.isEmpty()) {
                        r.reasons.add("Link " + v.host + ": " + v.reasons.get(0));
                    }
                }
            }
            int finalScore = Math.min(100, r.score + boost);
            String verdict = finalScore >= 70 ? "danger" : finalScore >= 35 ? "suspicious" : "safe";

            int threshold = GuardianPrefs.getThreshold(this);
            if (finalScore < threshold) return; // below user's chosen sensitivity

            String key = sbn.getPackageName() + ":" + Integer.toHexString(text.hashCode());
            long now = System.currentTimeMillis();
            Long last = seen.get(key);
            if (last != null && now - last < 60_000L) return;
            seen.put(key, now);
            if (seen.size() > 200) seen.clear();

            String sourceApp = appLabel(sbn.getPackageName());
            ScamHeuristics.Result merged =
                    new ScamHeuristics.Result(finalScore, verdict, r.urls, r.reasons);
            postWarning(sourceApp, merged);
            persistLog(sbn.getPackageName(), sourceApp, merged);
            emitToJs(sbn.getPackageName(), sourceApp, merged);
        } catch (Throwable t) {
            // Never crash the listener — Android will revoke access.
        }
    }

    private void persistLog(String pkg, String sourceApp, ScamHeuristics.Result r) {
        try {
            org.json.JSONObject o = new org.json.JSONObject();
            o.put("type", "notification");
            o.put("package", pkg);
            o.put("source", sourceApp);
            o.put("score", r.score);
            o.put("verdict", r.verdict);
            o.put("at", System.currentTimeMillis());
            org.json.JSONArray reasons = new org.json.JSONArray();
            for (String s : r.reasons) reasons.put(s);
            o.put("reasons", reasons);
            org.json.JSONArray urls = new org.json.JSONArray();
            for (String s : r.urls) urls.put(s);
            o.put("urls", urls);
            GuardianPrefs.appendLog(this, o);
        } catch (Throwable ignored) {}
    }

    private String extractText(Notification n) {
        Bundle extras = n.extras;
        if (extras == null) return null;
        StringBuilder sb = new StringBuilder();
        append(sb, extras.getCharSequence(Notification.EXTRA_TITLE));
        append(sb, extras.getCharSequence(Notification.EXTRA_TEXT));
        append(sb, extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        append(sb, extras.getCharSequence(Notification.EXTRA_SUB_TEXT));
        append(sb, extras.getCharSequence(Notification.EXTRA_SUMMARY_TEXT));
        CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        if (lines != null) for (CharSequence cs : lines) append(sb, cs);
        return sb.toString();
    }

    private static void append(StringBuilder sb, CharSequence cs) {
        if (cs == null) return;
        if (sb.length() > 0) sb.append('\n');
        sb.append(cs);
    }

    private String appLabel(String pkg) {
        try {
            return getPackageManager()
                    .getApplicationLabel(getPackageManager().getApplicationInfo(pkg, 0))
                    .toString();
        } catch (Exception e) {
            return pkg;
        }
    }

    private void postWarning(String sourceApp, ScamHeuristics.Result r) {
        ensureChannel();
        String title = (r.score >= 70 ? "⚠️ Likely scam" : "Possible scam") + " in " + sourceApp;
        String body = r.reasons.isEmpty() ? "Suspicious content detected" : r.reasons.get(0);

        Intent openApp = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (openApp != null) {
            openApp.setData(android.net.Uri.parse("cybersmart://guardian"));
            openApp.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        }
        PendingIntent pi = PendingIntent.getActivity(
                this, 0, openApp == null ? new Intent() : openApp,
                PendingIntent.FLAG_UPDATE_CURRENT
                        | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));

        NotificationCompat.Builder nb = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_warning)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(
                        body + "\n\nRisk score: " + r.score + "/100\nTap to review in CyberSmart."))
                .setPriority(r.score >= 70
                        ? NotificationCompat.PRIORITY_HIGH
                        : NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .setContentIntent(pi);

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify((int) (System.currentTimeMillis() & 0x7fffffff), nb.build());
    }

    private void emitToJs(String pkg, String sourceApp, ScamHeuristics.Result r) {
        JSObject obj = new JSObject();
        obj.put("type", "notification");
        obj.put("source", sourceApp);
        obj.put("package", pkg);
        obj.put("score", r.score);
        obj.put("verdict", r.verdict);
        obj.put("urls", new JSONArray(r.urls));
        obj.put("reasons", new JSONArray(r.reasons));
        obj.put("at", System.currentTimeMillis());
        GuardianBridge.emit(obj);
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Real-time warnings when CyberSmart detects a likely scam.");
        nm.createNotificationChannel(ch);
    }
}
