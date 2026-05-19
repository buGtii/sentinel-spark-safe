package app.lovable.f05a170f63694cf9b9431a13dae3e645.antitheft;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;

import app.lovable.f05a170f63694cf9b9431a13dae3e645.R;

/**
 * AntiTheftLocationService
 *
 * Battery-efficient foreground location service. Uses Android's built-in
 * LocationManager (FusedLocationProvider would require Google Play services
 * dependency). Emits a broadcast that the JS layer listens to (via
 * AntiTheftPlugin notifyListeners).
 *
 * Play Store compliance:
 *  - Foreground service with a visible, non-dismissable notification so the
 *    user always knows when CyberSmart is tracking.
 *  - Stops automatically when the user disables tracking from the UI.
 *  - Requires ACCESS_FINE_LOCATION granted at runtime.
 */
public class AntiTheftLocationService extends Service implements LocationListener {

    public static final String ACTION_LOCATION = "app.lovable.cybersmart.LOCATION_UPDATE";
    public static final String EXTRA_LAT = "lat";
    public static final String EXTRA_LNG = "lng";
    public static final String EXTRA_ACC = "acc";

    private static final String CHANNEL_ID = "cybersmart_antitheft";
    private static final int NOTIF_ID = 9412;

    private LocationManager lm;
    private boolean stolen = false;

    @Override
    public void onCreate() {
        super.onCreate();
        lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        startForeground(NOTIF_ID, buildNotification());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            stolen = intent.getBooleanExtra("stolen", false);
        }
        startUpdates();
        // Update notification to reflect stolen mode
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIF_ID, buildNotification());
        return START_STICKY;
    }

    private void startUpdates() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED
                && ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            stopSelf();
            return;
        }
        long minMs = stolen ? 30_000L : 5 * 60_000L; // 30s vs 5min
        float minM = stolen ? 5f : 50f;
        try {
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, minMs, minM, this, Looper.getMainLooper());
            }
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, minMs, minM, this, Looper.getMainLooper());
            }
        } catch (SecurityException ignored) {}
    }

    @Override
    public void onLocationChanged(Location location) {
        Intent b = new Intent(ACTION_LOCATION);
        b.putExtra(EXTRA_LAT, location.getLatitude());
        b.putExtra(EXTRA_LNG, location.getLongitude());
        b.putExtra(EXTRA_ACC, location.getAccuracy());
        b.setPackage(getPackageName());
        sendBroadcast(b);
    }

    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) {}
    @Override public void onStatusChanged(String p, int s, Bundle b) {}

    @Override
    public void onDestroy() {
        try { if (lm != null) lm.removeUpdates(this); } catch (Exception ignored) {}
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    private Notification buildNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "Anti-Theft", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("CyberSmart is protecting this device");
            nm.createNotificationChannel(ch);
        }
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = open == null ? null : PendingIntent.getActivity(
                this, 0, open,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(stolen ? "CyberSmart — Stolen Mode active" : "CyberSmart Anti-Theft")
                .setContentText(stolen
                        ? "Tracking location every 30s. Tap to manage."
                        : "Protecting this device. Tap to manage.")
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW);
        if (pi != null) b.setContentIntent(pi);
        return b.build();
    }
}
