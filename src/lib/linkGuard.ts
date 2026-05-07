// Native deep-link / share-target handler.
// When the user opens any URL with our app (via Android share or "Open with"),
// Capacitor fires `appUrlOpen`. We intercept it and route to /safe-link.

import { App, type URLOpenListenerEvent } from "@capacitor/app";
import type { NavigateFunction } from "react-router-dom";

export function installLinkGuard(navigate: NavigateFunction) {
  // Capacitor only available on native; on web this is a no-op.
  // @ts-ignore
  if (typeof (window as any).Capacitor === "undefined" || !(window as any).Capacitor?.isNativePlatform?.()) {
    return () => {};
  }

  const handler = (event: URLOpenListenerEvent) => {
    try {
      const incoming = event.url;
      // App scheme like cybersmart://safe-link?url=...
      // Or any http(s) link opened via share/intent.
      let target = incoming;
      try {
        const u = new URL(incoming);
        if (u.protocol === "http:" || u.protocol === "https:") {
          target = incoming;
        } else {
          // custom scheme — try ?url= param
          const inner = u.searchParams.get("url");
          if (inner) target = inner;
        }
      } catch { /* not a URL */ }

      if (target) {
        navigate(`/safe-link?url=${encodeURIComponent(target)}`, { replace: false });
      }
    } catch (e) {
      console.error("linkGuard error", e);
    }
  };

  const sub = App.addListener("appUrlOpen", handler);
  return () => { sub.then(s => s.remove()); };
}
