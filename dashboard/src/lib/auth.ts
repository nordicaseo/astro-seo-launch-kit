// Tiny, dependency-free session auth using a signed HMAC cookie.
// Portable across Node, Vercel, and Cloudflare (uses Web Crypto).

export const COOKIE_NAME = 'seo_dash';
const enc = new TextEncoder();

/** Read an env var across Node / Vercel / Cloudflare runtimes. */
export function getEnv(key: string, locals?: App.Locals): string | undefined {
  // Cloudflare passes runtime env via locals.runtime.env
  const cf = (locals as any)?.runtime?.env?.[key];
  if (cf) return cf;
  if (typeof process !== 'undefined' && process.env?.[key]) return process.env[key];
  // @ts-ignore - import.meta.env is available at runtime in Astro
  return import.meta.env?.[key];
}

function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

/** Constant-time string compare. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Sign a value -> "value.signature". */
export async function sign(value: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  return `${value}.${b64url(sig)}`;
}

/** Verify a signed token produced by sign(). */
export async function verifyToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const i = token.lastIndexOf('.');
  if (i < 0) return false;
  const value = token.slice(0, i);
  const expected = await sign(value, secret);
  return safeEqual(token, expected);
}

/** Check whether a request is authenticated. */
export async function isAuthed(cookieValue: string | undefined, locals?: App.Locals): Promise<boolean> {
  const secret = getEnv('SESSION_SECRET', locals);
  if (!secret) return false;
  return verifyToken(cookieValue, secret);
}

/** Mint the cookie value for a successful login. */
export async function mintSession(locals?: App.Locals): Promise<string> {
  const secret = getEnv('SESSION_SECRET', locals) ?? 'insecure-dev-secret';
  // Embed an issue marker; cookie maxAge handles expiry.
  return sign('authed', secret);
}
