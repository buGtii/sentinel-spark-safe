package app.lovable.f05a170f63694cf9b9431a13dae3e645.guardian;

import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.text.TextUtils;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge between the React UI and the native Android Guardian services.
 *
 * Privacy notes:
 *  - The plugin never returns the raw body of a notification to JS — only the
 *    extracted indicators (URLs + matched scam keywords + risk score) needed
 *    to render an explainable alert.
 *  - All sensitive permissions (Notification Listener, Accessibility, Call
 *    Screening) are opt-in: the user must enable each one in system settings
 *    after an explicit, in-app consent screen.
 */
@CapacitorPlugin(name = "Guardian")
public class GuardianPlugin extends Plugin {

    @Override
    public void load() {
        super.load();
        GuardianBridge.register(this);
    }

    @Override
    protected void handleOnDestroy() {
        GuardianBridge.unregister(this);
        super.handleOnDestroy();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        Context ctx = getContext();
        JSObject ret = new JSObject();
        ret.put("platform", "android");
        ret.put("notificationAccess", isNotificationListenerEnabled(ctx));
        ret.put("accessibilityEnabled", isAccessibilityEnabled(ctx));
        ret.put("canDrawOverlays", Settings.canDrawOverlays(ctx));
        ret.put("guardianEnabled", GuardianPrefs.isEnabled(ctx));
        ret.put("callProtectionEnabled", GuardianPrefs.isCallProtectionEnabled(ctx));
        ret.put("phishingUiDetection", GuardianPrefs.isAccessibilityScanEnabled(ctx));
        call.resolve(ret);
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        GuardianPrefs.setEnabled(getContext(), enabled);
        call.resolve();
    }

    @PluginMethod
    public void setCallProtection(PluginCall call) {
        GuardianPrefs.setCallProtectionEnabled(getContext(), call.getBoolean("enabled", false));
        call.resolve();
    }

    @PluginMethod
    public void setAccessibilityScan(PluginCall call) {
        GuardianPrefs.setAccessibilityScanEnabled(getContext(), call.getBoolean("enabled", false));
        call.resolve();
    }

    @PluginMethod
    public void openNotificationAccessSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    /** Called by the native services to deliver a sanitized alert to JS. */
    void emitAlert(JSObject data) {
        notifyListeners("guardianAlert", data);
    }

    private boolean isNotificationListenerEnabled(Context ctx) {
        String flat = Settings.Secure.getString(
                ctx.getContentResolver(), "enabled_notification_listeners");
        if (TextUtils.isEmpty(flat)) return false;
        ComponentName cn = new ComponentName(ctx, GuardianNotificationListener.class);
        return flat.contains(cn.flattenToString()) || flat.contains(cn.getPackageName());
    }

    private boolean isAccessibilityEnabled(Context ctx) {
        try {
            int enabled = Settings.Secure.getInt(
                    ctx.getContentResolver(), Settings.Secure.ACCESSIBILITY_ENABLED, 0);
            if (enabled != 1) return false;
            String services = Settings.Secure.getString(
                    ctx.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
            return services != null && services.contains(ctx.getPackageName());
        } catch (Exception e) {
            return false;
        }
    }
}
