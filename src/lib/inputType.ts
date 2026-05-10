// Shared input classifier used across scanners to prevent crashes and give
// human-friendly guidance when the user pastes the wrong kind of value.

export type InputKind =
  | "url"
  | "domain"
  | "ipv4"
  | "ipv6"
  | "email"
  | "hash"
  | "phone"
  | "empty"
  | "unknown";

const IPV4 = /^(25[0-5]|2[0-4]\d|[01]?\d?\d)(\.(25[0-5]|2[0-4]\d|[01]?\d?\d)){3}$/;
const IPV6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::1|::|([0-9a-fA-F]{1,4}:){1,7}:|:(:[0-9a-fA-F]{1,4}){1,7})$/;
const DOMAIN = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63})+$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HASH = /^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$/;
const PHONE = /^\+?[\d\s().-]{7,20}$/;

export function classifyInput(raw: string): InputKind {
  const s = (raw || "").trim();
  if (!s) return "empty";
  if (/^https?:\/\//i.test(s) || s.includes("://")) return "url";
  if (IPV4.test(s)) return "ipv4";
  if (IPV6.test(s)) return "ipv6";
  if (EMAIL.test(s)) return "email";
  if (HASH.test(s)) return "hash";
  if (DOMAIN.test(s)) return "domain";
  if (PHONE.test(s) && /\d/.test(s) && !s.includes(".")) return "phone";
  // host/path without scheme → treat as URL-ish
  if (/[A-Za-z]/.test(s) && s.includes("/")) return "url";
  return "unknown";
}

export function normalizeUrl(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

export function friendlyMismatchMessage(actual: InputKind, expected: InputKind): string {
  const niceExpected: Record<string, string> = {
    url: "URL Scanner", ipv4: "IP Scanner", ipv6: "IP Scanner",
    domain: "Domain Intel", email: "Email Headers", hash: "File Scan",
  };
  const niceActual: Record<string, string> = {
    url: "URL", ipv4: "IPv4 address", ipv6: "IPv6 address", domain: "domain name",
    email: "email address", hash: "file hash", phone: "phone number",
    unknown: "unrecognized input", empty: "empty value",
  };
  const dest = niceExpected[expected] || "the correct scanner";
  return `This looks like a ${niceActual[actual] || "different type"}. Please use the ${dest} instead.`;
}
