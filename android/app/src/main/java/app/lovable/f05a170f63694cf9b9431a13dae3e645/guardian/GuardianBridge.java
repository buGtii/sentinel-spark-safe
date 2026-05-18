package app.lovable.f05a170f63694cf9b9431a13dae3e645.guardian;

import com.getcapacitor.JSObject;

import java.lang.ref.WeakReference;

/**
 * Lightweight static dispatcher so background services (which do not hold a
 * reference to the Capacitor Plugin instance) can push sanitized alert data
 * to the JS layer when the WebView is alive.
 */
final class GuardianBridge {
    private static WeakReference<GuardianPlugin> sPlugin = new WeakReference<>(null);

    static void register(GuardianPlugin p) { sPlugin = new WeakReference<>(p); }
    static void unregister(GuardianPlugin p) {
        GuardianPlugin current = sPlugin.get();
        if (current == p) sPlugin.clear();
    }

    static void emit(JSObject data) {
        GuardianPlugin p = sPlugin.get();
        if (p != null) p.emitAlert(data);
    }

    private GuardianBridge() {}
}
