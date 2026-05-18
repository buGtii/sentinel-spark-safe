// Global tap interceptor. Catches every anchor click in the WebView, blocks
// the navigation, and routes through /safe-link so the user always sees a
// risk explanation BEFORE the browser is opened.
//
// Whitelisted: in-app routes (relative hrefs), mailto/tel, and links that
// explicitly carry `data-skip-guard`.

import type { NavigateFunction } from "react-router-dom";

const SKIP_ATTR = "data-skip-guard";

function shouldGuard(href: string): boolean {
  if (!href) return false;
  if (href.startsWith("#")) return false;
  if (href.startsWith("javascript:")) return false;
  if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("sms:")) return false;
  try {
    const u = new URL(href, window.location.href);
    if (u.origin === window.location.origin) return false; // in-app
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function installTapGuard(navigate: NavigateFunction) {
  const handler = (ev: MouseEvent) => {
    if (ev.defaultPrevented) return;
    if (ev.button !== 0) return;
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;

    let el = ev.target as HTMLElement | null;
    while (el && el.tagName !== "A") el = el.parentElement;
    if (!el) return;
    const a = el as HTMLAnchorElement;
    if (a.hasAttribute(SKIP_ATTR)) return;
    const href = a.getAttribute("href");
    if (!href) return;
    if (!shouldGuard(href)) return;
    if (localStorage.getItem("guardian.tapguard.disabled") === "1") return;

    ev.preventDefault();
    ev.stopPropagation();
    navigate(`/safe-link?url=${encodeURIComponent(href)}`);
  };

  document.addEventListener("click", handler, true);
  return () => document.removeEventListener("click", handler, true);
}
