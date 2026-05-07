# Safe Link Guard — Native Setup (Android)

After cloning to your machine and running `npx cap add android`, edit:

**`android/app/src/main/AndroidManifest.xml`** — inside `<activity android:name=".MainActivity" …>` add these intent filters so the OS shows **CyberSmart** in the "Open with" / share menu for every link:

```xml
<!-- Custom scheme: cybersmart://safe-link?url=… -->
<intent-filter android:autoVerify="false">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="cybersmart" />
</intent-filter>

<!-- Open any http/https link with CyberSmart (acts as a browser) -->
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="http" />
    <data android:scheme="https" />
</intent-filter>

<!-- Receive shared links from WhatsApp / Chrome / X / Instagram etc. -->
<intent-filter>
    <action android:name="android.intent.action.SEND" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="text/plain" />
</intent-filter>
```

Then run:

```bash
npm run build
npx cap sync android
npx cap run android
```

## How users use it

1. **Long-press a link** in WhatsApp / Telegram / Chrome → **Open with → CyberSmart** → app opens `/safe-link?url=…` and runs the full scan automatically.
2. **Share a link** (kebab menu → Share → CyberSmart) → same flow.
3. **Set CyberSmart as default browser** in Android Settings → System → Default apps → Browser → every tap is now intercepted and scanned.

## iOS

Apple does not allow system-wide link interception. We support:
- Custom scheme `cybersmart://` (deep links)
- iOS Share Extension (requires custom Xcode target — out of scope for OTA)

In-app paste / QR / share within CyberSmart works on iOS just fine.
