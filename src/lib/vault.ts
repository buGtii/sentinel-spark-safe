// Client-side AES-GCM encryption with PBKDF2 key derivation.
const enc = new TextEncoder();
const dec = new TextDecoder();

async function deriveKey(pass: string, salt: BufferSource) {
  const km = await crypto.subtle.importKey("raw", enc.encode(pass) as BufferSource, "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 200_000, hash: "SHA-256" },
    km,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

const SALT = enc.encode("cybersmart-vault-v1") as BufferSource;

export async function vaultEncrypt(pass: string, plaintext: string) {
  const key = await deriveKey(pass, SALT);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, enc.encode(plaintext) as BufferSource);
  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ct))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

export async function vaultDecrypt(pass: string, ciphertext: string, ivB64: string) {
  const key = await deriveKey(pass, SALT);
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ct as BufferSource);
  return dec.decode(pt);
}
