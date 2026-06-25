// Low-level HTTP + URL utilities used by the crawler and checks.

export const UA =
  'Mozilla/5.0 (compatible; AstroSEOLaunchKit/1.0; +https://github.com/nordicaseo/astro-seo-launch-kit)';

const DEFAULT_TIMEOUT = 15000;

/** Lowercase a Headers object into a plain object. */
export function headerObj(headers) {
  const out = {};
  if (!headers) return out;
  for (const [k, v] of headers.entries()) out[k.toLowerCase()] = v;
  return out;
}

/**
 * Fetch a URL and return a normalized result that never throws.
 * { ok, status, url (final), headers, body, timeMs, redirected, error }
 */
export async function get(url, opts = {}) {
  const { method = 'GET', redirect = 'follow', timeout = DEFAULT_TIMEOUT, headers = {}, body } = opts;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method,
      redirect,
      signal: ctrl.signal,
      headers: { 'user-agent': UA, accept: '*/*', 'accept-encoding': 'br, gzip', ...headers },
      body,
    });
    const timeMs = Date.now() - start;
    const h = headerObj(res.headers);
    let text = '';
    if (method !== 'HEAD') {
      try { text = await res.text(); } catch { text = ''; }
    }
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      url: res.url || url,
      requestedUrl: url,
      headers: h,
      body: text,
      timeMs,
      redirected: res.redirected,
      location: h['location'],
      error: null,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      url,
      requestedUrl: url,
      headers: {},
      body: '',
      timeMs: Date.now() - start,
      redirected: false,
      error: e?.name === 'AbortError' ? 'timeout' : e?.message || String(e),
    };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Walk a redirect chain manually (redirect: 'manual'), capturing each hop.
 * Returns { chain: [{url, status, location}], final: <get result> }.
 */
export async function follow(url, { maxHops = 8, timeout = DEFAULT_TIMEOUT } = {}) {
  const chain = [];
  let current = url;
  for (let i = 0; i < maxHops; i++) {
    const res = await get(current, { redirect: 'manual', timeout });
    if (res.status >= 300 && res.status < 400 && res.location) {
      const next = abs(res.location, current);
      chain.push({ url: current, status: res.status, location: next });
      if (chain.some((c, idx) => idx < chain.length - 1 && c.url === next)) {
        return { chain, final: res, loop: true };
      }
      current = next;
      continue;
    }
    return { chain, final: res, loop: false };
  }
  return { chain, final: await get(current, { redirect: 'manual', timeout }), loop: chain.length >= maxHops };
}

/** Resolve a possibly-relative URL against a base. */
export function abs(href, base) {
  try { return new URL(href, base).href; } catch { return href; }
}

/** Ensure the input has a protocol; default to https. */
export function normalizeTarget(input) {
  let t = String(input || '').trim();
  if (!/^https?:\/\//i.test(t)) t = 'https://' + t;
  const u = new URL(t);
  return u;
}

/** Toggle the leading "www." on a hostname. */
export function toggleWww(host) {
  return host.startsWith('www.') ? host.slice(4) : 'www.' + host;
}

export function isPlatformDefaultDomain(host) {
  return /\.(pages\.dev|vercel\.app|netlify\.app|workers\.dev)$/i.test(host);
}

export function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
