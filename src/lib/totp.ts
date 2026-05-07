// RFC 6238 TOTP (HMAC-SHA1) implementation in pure browser crypto.
function base32Decode(b32: string): Uint8Array {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = b32.replace(/=+$/g, "").toUpperCase().replace(/\s+/g, "");
  let bits = "";
  for (const c of clean) {
    const i = alpha.indexOf(c);
    if (i < 0) throw new Error("Invalid Base32 character");
    bits += i.toString(2).padStart(5, "0");
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return bytes;
}

export async function totp(secretB32: string, step = 30, digits = 6, t = Date.now()): Promise<string> {
  const key = base32Decode(secretB32);
  const counter = Math.floor(t / 1000 / step);
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(4, counter & 0xffffffff);
  view.setUint32(0, Math.floor(counter / 0x100000000));
  const ck = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", ck, buf));
  const off = sig[sig.length - 1] & 0xf;
  const code = ((sig[off] & 0x7f) << 24) | (sig[off + 1] << 16) | (sig[off + 2] << 8) | sig[off + 3];
  return (code % 10 ** digits).toString().padStart(digits, "0");
}

export function secondsLeft(step = 30, t = Date.now()) {
  return step - Math.floor(t / 1000) % step;
}
