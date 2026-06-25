// HTML parsing helpers built on node-html-parser.
import { parse } from 'node-html-parser';

export function parseHtml(html) {
  return parse(html || '', {
    lowerCaseTagName: true,
    comment: false,
    blockTextElements: { script: true, style: true, noscript: false },
  });
}

export const attr = (el, name) => (el ? el.getAttribute(name) : undefined);
export const txt = (el) => (el ? el.text.trim() : '');

/** All <meta> tags as a map keyed by name/property (lowercased) -> content. */
export function metaMap(root) {
  const map = {};
  for (const m of root.querySelectorAll('meta')) {
    const key = (m.getAttribute('name') || m.getAttribute('property') || m.getAttribute('http-equiv') || '').toLowerCase();
    if (key && map[key] === undefined) map[key] = m.getAttribute('content') ?? '';
  }
  return map;
}

export function metaAll(root, key) {
  key = key.toLowerCase();
  return root.querySelectorAll('meta').filter(
    (m) => (m.getAttribute('name') || m.getAttribute('property') || '').toLowerCase() === key
  );
}

export function canonical(root) {
  const el = root.querySelector('link[rel="canonical"]');
  return el ? el.getAttribute('href') : undefined;
}

export function linkRel(root, rel) {
  return root.querySelectorAll('link').filter(
    (l) => (l.getAttribute('rel') || '').toLowerCase().split(/\s+/).includes(rel)
  );
}

/** Parse every JSON-LD block. Returns [{ raw, json, error }]. */
export function jsonLd(root) {
  const out = [];
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    const raw = s.text || s.innerHTML || '';
    try {
      out.push({ raw, json: JSON.parse(raw), error: null });
    } catch (e) {
      out.push({ raw, json: null, error: e.message });
    }
  }
  return out;
}

/** Flatten JSON-LD (handles @graph and arrays) into a list of typed nodes. */
export function jsonLdNodes(root) {
  const nodes = [];
  for (const block of jsonLd(root)) {
    if (!block.json) continue;
    const items = Array.isArray(block.json) ? block.json : [block.json];
    for (const item of items) {
      if (item && Array.isArray(item['@graph'])) nodes.push(...item['@graph']);
      else nodes.push(item);
    }
  }
  return nodes;
}

export function hasSchemaType(root, type) {
  const want = String(type).toLowerCase();
  return jsonLdNodes(root).some((n) => {
    const t = n && n['@type'];
    if (!t) return false;
    const types = Array.isArray(t) ? t : [t];
    return types.some((x) => String(x).toLowerCase() === want);
  });
}

export const images = (root) => root.querySelectorAll('img');
export const headings = (root) => root.querySelectorAll('h1, h2, h3, h4, h5, h6');
export const internalLinks = (root, origin) =>
  root
    .querySelectorAll('a[href]')
    .map((a) => a.getAttribute('href'))
    .filter(Boolean);

/** Approximate count of element nodes in the document. */
export function domSize(root) {
  let n = 0;
  const walk = (el) => {
    if (el.nodeType === 1) n++;
    for (const c of el.childNodes || []) walk(c);
  };
  walk(root);
  return n;
}

/** Visible-ish text length (strips script/style). */
export function visibleTextLength(root) {
  const clone = parseHtml(root.toString());
  clone.querySelectorAll('script, style, noscript').forEach((e) => e.remove());
  return clone.text.replace(/\s+/g, ' ').trim().length;
}
