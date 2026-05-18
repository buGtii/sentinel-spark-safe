import { describe, it, expect } from "vitest";
import { analyzeMessage, scoreUrl, extractUrls } from "@/lib/detector";

describe("extractUrls", () => {
  it("finds plain https links", () => {
    expect(extractUrls("see https://example.com/foo")).toEqual(["https://example.com/foo"]);
  });
  it("upgrades www-only links to a parseable URL", () => {
    expect(extractUrls("visit www.example.com")[0]).toBe("http://www.example.com");
  });
  it("dedupes repeated links", () => {
    const out = extractUrls("a https://x.io b https://x.io c");
    expect(out).toEqual(["https://x.io"]);
  });
  it("returns empty for non-url text", () => {
    expect(extractUrls("hello there")).toEqual([]);
  });
});

describe("scoreUrl", () => {
  it("rates a clean apex domain as safe", () => {
    const r = scoreUrl("https://example.com/");
    expect(r.verdict).toBe("safe");
    expect(r.score).toBeLessThan(35);
  });

  it("flags URL shorteners", () => {
    const r = scoreUrl("https://bit.ly/abc123");
    expect(r.score).toBeGreaterThanOrEqual(35);
    expect(r.reasons.join(" ")).toMatch(/shortener/i);
  });

  it("flags punycode hosts", () => {
    const r = scoreUrl("https://xn--pple-43d.com/login");
    expect(r.verdict).not.toBe("safe");
    expect(r.reasons.join(" ")).toMatch(/punycode|homograph/i);
  });

  it("flags brand lookalike domains", () => {
    const r = scoreUrl("https://paypal-secure-login.com/verify");
    expect(r.verdict).toBe("danger");
    expect(r.reasons.join(" ")).toMatch(/paypal/i);
  });

  it("flags @-userinfo masking", () => {
    const r = scoreUrl("https://google.com@evil.example/");
    expect(r.score).toBeGreaterThanOrEqual(35);
  });

  it("penalises plain http", () => {
    const safe = scoreUrl("https://example.com/").score;
    const insecure = scoreUrl("http://example.com/").score;
    expect(insecure).toBeGreaterThan(safe);
  });

  it("flags deep digit-heavy hosts", () => {
    const r = scoreUrl("https://login-12345678.cdn.example.net/");
    expect(r.reasons.length).toBeGreaterThan(0);
  });
});

describe("analyzeMessage", () => {
  it("rates plain conversational text as safe", () => {
    const r = analyzeMessage("hey, are we still on for lunch tomorrow?");
    expect(r.verdict).toBe("safe");
    expect(r.urls).toEqual([]);
  });

  it("flags classic phishing copy", () => {
    const r = analyzeMessage(
      "URGENT: your account has been suspended. Verify your account here: https://bit.ly/xyz"
    );
    expect(r.verdict).toBe("danger");
    expect(r.urls.length).toBe(1);
    expect(r.reasons.some(x => /shortener/i.test(x))).toBe(true);
    expect(r.reasons.some(x => /scam phrase/i.test(x))).toBe(true);
  });

  it("flags OTP-sharing requests", () => {
    const r = analyzeMessage("Please share the OTP you just received with us.");
    expect(r.verdict).not.toBe("safe");
    expect(r.reasons.some(x => /OTP/i.test(x))).toBe(true);
  });

  it("flags seed-phrase requests very strongly", () => {
    const r = analyzeMessage("Enter your recovery phrase to unlock the airdrop");
    expect(r.verdict).toBe("danger");
    expect(r.reasons.some(x => /seed|recovery/i.test(x))).toBe(true);
  });

  it("flags delivery scams", () => {
    const r = analyzeMessage(
      "Your package delivery failed. Pay customs fee at http://dhl-redelivery.shop/pay"
    );
    expect(r.verdict).toBe("danger");
  });

  it("does not flag a normal marketing email with one safe link", () => {
    const r = analyzeMessage("Read our new blog post: https://example.com/blog/launch");
    expect(r.verdict).toBe("safe");
  });

  it("caps score at 100", () => {
    const r = analyzeMessage(
      "URGENT! Verify your account, claim your prize, send BTC to crypto wallet, share OTP, recovery phrase, tax refund, arrest warrant, https://bit.ly/x https://xn--paypal-43d.com"
    );
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.verdict).toBe("danger");
  });
});
