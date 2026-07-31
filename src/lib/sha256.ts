/**
 * SHA-256 + HMAC-SHA256 in plain TypeScript.
 *
 * Exists because WebCrypto (`crypto.subtle`) is only exposed in a *secure
 * context* — https, or `localhost`. Opening the studio on a LAN address like
 * http://192.168.1.26:8080, which is how anyone else on the network reaches it,
 * leaves `crypto.subtle` undefined and every signed request unsent.
 *
 * Serving the UI over https doesn't help: the page would then be blocked from
 * calling the plain-http API as mixed content. So the signing has to work without
 * WebCrypto, and FIPS 180-4 SHA-256 / RFC 2104 HMAC are small and fully
 * specified. Verified byte-for-byte against Python's hashlib/hmac.
 *
 * `crypto.subtle` is still preferred when present — see lib/ai-api.ts.
 */

// FIPS 180-4 §4.2.2 round constants.
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const BLOCK_BYTES = 64;
const DIGEST_BYTES = 32;

function rotr(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function sha256(message: Uint8Array): Uint8Array {
  // Initial hash value, FIPS 180-4 §5.3.3.
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  // Pad to a multiple of 64: 0x80, zeros, then the bit length as 64-bit BE.
  const padded = new Uint8Array(((message.length + 9 + 63) >> 6) << 6);
  padded.set(message);
  padded[message.length] = 0x80;

  const view = new DataView(padded.buffer);
  const bitLength = message.length * 8;
  // Split the length across two 32-bit writes — JS bitwise ops are 32-bit only.
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(padded.length - 4, bitLength >>> 0);

  const w = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += BLOCK_BYTES) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choice = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + choice + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + majority) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  const digest = new Uint8Array(DIGEST_BYTES);
  const out = new DataView(digest.buffer);
  for (let i = 0; i < 8; i++) out.setUint32(i * 4, h[i]);
  return digest;
}

/** RFC 2104: H((K ⊕ opad) ‖ H((K ⊕ ipad) ‖ message)). */
function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  // Keys longer than the block size are hashed first; shorter ones zero-padded.
  const shortened = key.length > BLOCK_BYTES ? sha256(key) : key;
  const block = new Uint8Array(BLOCK_BYTES);
  block.set(shortened);

  const inner = new Uint8Array(BLOCK_BYTES + message.length);
  const outer = new Uint8Array(BLOCK_BYTES + DIGEST_BYTES);
  for (let i = 0; i < BLOCK_BYTES; i++) {
    inner[i] = block[i] ^ 0x36;
    outer[i] = block[i] ^ 0x5c;
  }
  inner.set(message, BLOCK_BYTES);
  outer.set(sha256(inner), BLOCK_BYTES);
  return sha256(outer);
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

/** Hex HMAC-SHA256 of a UTF-8 string under a UTF-8 secret. */
export function hmacSha256Hex(secret: string, message: string): string {
  const encoder = new TextEncoder();
  return toHex(hmacSha256(encoder.encode(secret), encoder.encode(message)));
}
