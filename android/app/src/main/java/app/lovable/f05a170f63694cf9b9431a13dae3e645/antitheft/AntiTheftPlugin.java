package app.lovable.f05a170f63694cf9b9431a13dae3e645.antitheft;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.ImageFormat;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.media.Image;
import android.media.ImageReader;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Base64;
import android.util.Size;
import android.view.Surface;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.UUID;

/**
 * AntiTheftPlugin
 *
 * Production-grade bridge between the React UI and the Android native layer
 * for CyberSmart's Anti-Theft module.
 *
 * Privacy / Play-Store compliance:
 *  - All camera usage requires a runtime CAMERA permission grant. We never
 *    open the camera silently without it.
 *  - We only fire {@link #captureIntruderSelfie} while the app is in the
 *    foreground (PIN gate is visible) — this is the same pattern used by
 *    Lockwatch / Prey and is allowed by Google Play.
 *  - The captured JPEG is returned as a base64 string to JS, which uploads
 *    it via Supabase Storage. We do not persist anything to public storage.
 *  - The device UID is generated locally and stored in SharedPreferences. It
 *    is NOT the IMEI / hardware id (which Google Play disallows for apps
 *    that don't qualify).
 */
@CapacitorPlugin(
        name = "AntiTheft",
        permissions = {
                @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera"),
                @Permission(strings = {
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                }, alias = "location")
        }
)
public class AntiTheftPlugin extends Plugin {

    private static final String PREFS = "cybersmart_antitheft";
    private static final String KEY_DEVICE_UID = "device_uid";

    @PluginMethod
    public void getDeviceInfo(PluginCall call) {
        Context ctx = getContext();
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String uid = sp.getString(KEY_DEVICE_UID, null);
        if (uid == null) {
            uid = UUID.randomUUID().toString();
            sp.edit().putString(KEY_DEVICE_UID, uid).apply();
        }
        JSObject ret = new JSObject();
        ret.put("deviceUid", uid);
        ret.put("model", Build.MODEL);
        ret.put("manufacturer", Build.MANUFACTURER);
        ret.put("androidVersion", Build.VERSION.RELEASE);
        ret.put("sdkInt", Build.VERSION.SDK_INT);
        call.resolve(ret);
    }

    /**
     * Silently capture a JPEG from the front camera and return base64.
     *
     * Requires CAMERA permission. If denied we trigger the runtime prompt and
     * the user must retry; we never bypass the system permission model.
     */
    @PluginMethod
    public void captureIntruderSelfie(final PluginCall call) {
        Context ctx = getContext();
        if (ActivityCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("camera", call, "cameraPermsCallback");
            return;
        }
        doCapture(call);
    }

    private void doCapture(final PluginCall call) {
        final Context ctx = getContext();
        final CameraManager cm = (CameraManager) ctx.getSystemService(Context.CAMERA_SERVICE);
        if (cm == null) { call.reject("Camera service unavailable"); return; }

        try {
            String frontId = null;
            for (String id : cm.getCameraIdList()) {
                CameraCharacteristics c = cm.getCameraCharacteristics(id);
                Integer facing = c.get(CameraCharacteristics.LENS_FACING);
                if (facing != null && facing == CameraCharacteristics.LENS_FACING_FRONT) {
                    frontId = id; break;
                }
            }
            if (frontId == null) { call.reject("No front camera"); return; }

            final HandlerThread thread = new HandlerThread("AntiTheftCam");
            thread.start();
            final Handler handler = new Handler(thread.getLooper());

            final Size size = new Size(640, 480);
            final ImageReader reader = ImageReader.newInstance(
                    size.getWidth(), size.getHeight(), ImageFormat.JPEG, 1);

            reader.setOnImageAvailableListener(new ImageReader.OnImageAvailableListener() {
                @Override public void onImageAvailable(ImageReader r) {
                    Image img = null;
                    try {
                        img = r.acquireLatestImage();
                        if (img == null) { call.reject("No image captured"); return; }
                        ByteBuffer buf = img.getPlanes()[0].getBuffer();
                        byte[] bytes = new byte[buf.remaining()];
                        buf.get(bytes);
                        String b64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
                        JSObject ret = new JSObject();
                        ret.put("base64", b64);
                        ret.put("mimeType", "image/jpeg");
                        ret.put("width", size.getWidth());
                        ret.put("height", size.getHeight());
                        call.resolve(ret);
                    } catch (Exception e) {
                        call.reject("Capture failed: " + e.getMessage());
                    } finally {
                        if (img != null) img.close();
                        try { reader.close(); } catch (Exception ignored) {}
                        thread.quitSafely();
                    }
                }
            }, handler);

            final String camId = frontId;
            cm.openCamera(camId, new CameraDevice.StateCallback() {
                @Override public void onOpened(final CameraDevice device) {
                    try {
                        device.createCaptureSession(Arrays.asList(reader.getSurface()),
                                new CameraCaptureSession.StateCallback() {
                                    @Override public void onConfigured(CameraCaptureSession session) {
                                        try {
                                            CaptureRequest.Builder b = device.createCaptureRequest(
                                                    CameraDevice.TEMPLATE_STILL_CAPTURE);
                                            b.addTarget(reader.getSurface());
                                            b.set(CaptureRequest.CONTROL_AE_MODE,
                                                    CaptureRequest.CONTROL_AE_MODE_ON_AUTO_FLASH);
                                            // Wait one auto-exposure frame to avoid black image.
                                            handler.postDelayed(() -> {
                                                try {
                                                    session.capture(b.build(),
                                                            new CameraCaptureSession.CaptureCallback() {
                                                                @Override public void onCaptureCompleted(
                                                                        CameraCaptureSession s,
                                                                        CaptureRequest req,
                                                                        android.hardware.camera2.TotalCaptureResult result) {
                                                                    try { device.close(); } catch (Exception ignored) {}
                                                                }
                                                            }, handler);
                                                } catch (Exception e) {
                                                    call.reject("Capture request failed: " + e.getMessage());
                                                }
                                            }, 600);
                                        } catch (Exception e) {
                                            call.reject("Session configure error: " + e.getMessage());
                                        }
                                    }
                                    @Override public void onConfigureFailed(CameraCaptureSession session) {
                                        call.reject("Session configure failed");
                                    }
                                }, handler);
                    } catch (CameraAccessException e) {
                        call.reject("openCamera/createSession: " + e.getMessage());
                    }
                }
                @Override public void onDisconnected(CameraDevice device) { device.close(); }
                @Override public void onError(CameraDevice device, int error) {
                    device.close();
                    call.reject("Camera error " + error);
                }
            }, handler);
        } catch (CameraAccessException | SecurityException e) {
            call.reject("Camera setup failed: " + e.getMessage());
        }
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void cameraPermsCallback(PluginCall call) {
        if (getPermissionState("camera") == com.getcapacitor.PermissionState.GRANTED) {
            doCapture(call);
        } else {
            call.reject("Camera permission denied");
        }
    }

    @PluginMethod
    public void startLocationService(PluginCall call) {
        boolean stolen = call.getBoolean("stolenMode", false);
        Context ctx = getContext();
        android.content.Intent i = new android.content.Intent(ctx, AntiTheftLocationService.class);
        i.putExtra("stolen", stolen);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(i);
        } else {
            ctx.startService(i);
        }
        call.resolve();
    }

    @PluginMethod
    public void stopLocationService(PluginCall call) {
        Context ctx = getContext();
        ctx.stopService(new android.content.Intent(ctx, AntiTheftLocationService.class));
        call.resolve();
    }
}
