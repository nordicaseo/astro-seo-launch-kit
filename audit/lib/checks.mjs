// The automated check registry. Each entry maps a rule id from seo-rules.json
// to a function (ctx) -> { status, detail, evidence? }.
// status: 'pass' | 'fail' | 'warn' | 'manual' | 'skip'
// Rules with no entry here are resolved by the runner (manual / lighthouse / skip).
import { get, abs, isPlatformDefaultDomain } from './util.mjs';
import {
  metaMap, metaAll, canonical, jsonLd, jsonLdNodes, hasSchemaType,
  images, headings, linkRel, domSize, visibleTextLength, attr, txt,
} from './dom.mjs';

const pass = (detail, evidence) => ({ status: 'pass', detail, evidence });
const fail = (detail, evidence) => ({ status: 'fail', detail, evidence });
const warn = (detail, evidence) => ({ status: 'warn', detail, evidence });
const manual = (detail, evidence) => ({ status: 'manual', detail, evidence });
const skip = (detail, evidence) => ({ status: 'skip', detail, evidence });

const htmlPages = (ctx) => ctx.pages.filter((p) => p.ok && /html/i.test(p.headers['content-type'] || '') && p.html);
const bcp47 = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

function normUrl(u) {
  try {
    const x = new URL(u);
    let path = x.pathname.replace(/\/+$/, '') || '/';
    return (x.origin + path + x.search).toLowerCase();
  } catch { return String(u || '').toLowerCase(); }
}

export const CHECKS = {
  // ---------------------------------------------------------------- foundations
  'foundations-site-config-production-url': (ctx) => {
    const c = canonical(ctx.homepage.root);
    if (!c) return fail('No canonical tag on the homepage — Astro `site` is likely unset.');
    if (!/^https:\/\//i.test(c)) return fail('Canonical is not absolute HTTPS — check the `site` value.', c);
    try {
      const h = new URL(c).hostname;
      if (h !== ctx.host) return fail(`Canonical host (${h}) does not match the audited host (${ctx.host}).`, c);
    } catch { return fail('Canonical is not a valid URL.', c); }
    if (/localhost|127\.0\.0\.1/.test(ctx.homepage.html)) return warn('"localhost" appears in the HTML — a dev `site`/asset URL may have leaked.');
    return pass('Homepage canonical is absolute HTTPS and matches the production host.', c);
  },
  'foundations-jsonld-injection-safe': (ctx) => {
    const blocks = jsonLd(ctx.homepage.root);
    if (!blocks.length) return manual('No JSON-LD on the homepage to validate. Add Organization/WebSite schema.');
    const bad = blocks.filter((b) => b.error);
    if (bad.length) return fail(`${bad.length}/${blocks.length} JSON-LD block(s) fail to parse — likely a template-literal/escaping bug. Use set:html={JSON.stringify(...)}.`, bad[0].error);
    return pass(`${blocks.length} JSON-LD block(s) parse as valid JSON.`);
  },
  'foundations-robots-txt-200-text-plain': (ctx) => {
    if (!ctx.robots.ok) return fail(`robots.txt did not return 200 (got ${ctx.robots.status}).`);
    if (!/text\/plain/i.test(ctx.robots.contentType)) return warn(`robots.txt served as "${ctx.robots.contentType}" (expected text/plain).`);
    return pass('robots.txt returns 200 with Content-Type text/plain.');
  },
  'foundations-custom-404-returns-404': (ctx) => {
    if (ctx.status404.isSoft) return fail('A missing URL returned HTTP 200 (soft 404). Astro static 404s should yield a real 404 — set up _routes / 404 handling on your platform.');
    if (ctx.status404.status === 404 || ctx.status404.status === 410) return pass(`Missing URLs return HTTP ${ctx.status404.status}.`);
    return warn(`Missing URL returned HTTP ${ctx.status404.status} (expected 404).`);
  },
  'foundations-trailing-slash-enforced': (ctx) => {
    const t = ctx.redirects.trailingSlash;
    if (!t.tested) return manual('Could not sample a non-root page to test trailing-slash enforcement.');
    if (t.bothResolve) return warn('Both trailing-slash and non-trailing-slash forms return 200 (duplicate URLs). Enforce one with a 301.');
    if (t.ok) return pass(`The non-canonical slash form redirects (HTTP ${t.status}).`);
    return warn(`Toggled slash form returned HTTP ${t.status} — verify one canonical form is enforced.`);
  },
  'foundations-single-basehead-no-duplicate-tags': (ctx) => {
    const r = ctx.homepage.root;
    const dupes = [];
    if (r.querySelectorAll('title').length > 1) dupes.push('title');
    if (linkRel(r, 'canonical').length > 1) dupes.push('canonical');
    if (metaAll(r, 'viewport').length > 1) dupes.push('viewport');
    if (metaAll(r, 'description').length > 1) dupes.push('description');
    if (r.querySelectorAll('meta[charset]').length > 1) dupes.push('charset');
    if (dupes.length) return fail(`Duplicate head tags found: ${dupes.join(', ')}. Centralize the <head> in one BaseHead component.`);
    return pass('No duplicate title/canonical/viewport/description/charset tags.');
  },
  'foundations-clean-lowercase-slugs': (ctx) => slugCheck(ctx),

  // -------------------------------------------------------------- crawlability
  'crawlability-no-disallow-all-production': (ctx) => {
    if (!ctx.robots.ok) return warn('No robots.txt found — crawlers assume full access, but you should add one with a Sitemap line.');
    const blocksAll = ctx.robots.star.disallow.some((d) => d.trim() === '/');
    if (blocksAll) return fail('robots.txt contains "Disallow: /" for all crawlers — the whole site is blocked from indexing.');
    return pass('robots.txt does not block the whole site.');
  },
  'crawlability-no-accidental-noindex': (ctx) => {
    const offenders = [];
    for (const p of htmlPages(ctx)) {
      const robotsMeta = (metaMap(p.root)['robots'] || '').toLowerCase();
      const xrobots = (p.headers['x-robots-tag'] || '').toLowerCase();
      if (robotsMeta.includes('noindex') || xrobots.includes('noindex')) offenders.push(p.url);
    }
    if (offenders.length) return fail(`${offenders.length} sampled page(s) carry a noindex directive.`, offenders.join('\n'));
    return pass('No accidental noindex on sampled pages.');
  },
  'crawlability-sitemap-present-and-served': (ctx) => {
    if (!ctx.sitemap.ok) return fail('No sitemap found at robots.txt Sitemap:, /sitemap-index.xml, or /sitemap.xml.');
    const nonAbs = ctx.sitemap.urls.filter((u) => !/^https:\/\//i.test(u)).slice(0, 3);
    if (nonAbs.length) return warn('Sitemap contains non-absolute or non-HTTPS <loc> entries.', nonAbs.join('\n'));
    return pass(`Sitemap served at ${ctx.sitemap.url} with ${ctx.sitemap.childCount} URL(s).`);
  },
  'crawlability-404-real-status': (ctx) => CHECKS['foundations-custom-404-returns-404'](ctx),
  'crawlability-jsonld-pages-crawlable': (ctx) => {
    const withLd = htmlPages(ctx).filter((p) => jsonLd(p.root).length);
    if (!withLd.length) return manual('No sampled pages carry JSON-LD.');
    const bad = withLd.filter((p) => (metaMap(p.root)['robots'] || '').includes('noindex'));
    if (bad.length) return fail('Pages with structured data are noindexed.', bad.map((p) => p.url).join('\n'));
    return pass(`${withLd.length} page(s) with structured data are indexable.`);
  },
  'crawlability-robots-references-sitemap': (ctx) => {
    if (!ctx.robots.ok) return fail('No robots.txt to carry a Sitemap directive.');
    if (!ctx.robots.sitemaps.length) return fail('robots.txt has no "Sitemap:" directive.');
    const rel = ctx.robots.sitemaps.filter((s) => !/^https?:\/\//i.test(s));
    if (rel.length) return warn('Sitemap directive uses a relative URL (must be absolute).', rel.join('\n'));
    return pass('robots.txt references the sitemap with an absolute URL.', ctx.robots.sitemaps.join('\n'));
  },
  'crawlability-robots-allows-css-js': (ctx) => {
    if (!ctx.robots.ok) return pass('No robots.txt (nothing blocked).');
    const bad = ctx.robots.star.disallow.filter((d) => /_astro|\.css|\.js|\/assets|\/scripts|\/styles/i.test(d));
    if (bad.length) return fail('robots.txt blocks CSS/JS/asset paths — this breaks rendering for Google.', bad.join('\n'));
    return pass('robots.txt does not block CSS/JS assets.');
  },
  'crawlability-sitemap-only-indexable-canonical-urls': async (ctx) => {
    if (!ctx.sitemap.ok || !ctx.sitemap.urls.length) return skip('No sitemap URLs to sample.');
    const sample = ctx.sitemap.urls.slice(0, 5);
    const bad = [];
    for (const u of sample) {
      const r = await get(u, { redirect: 'manual' });
      if (r.status !== 200) bad.push(`${u} -> ${r.status}`);
    }
    if (bad.length) return fail(`${bad.length}/${sample.length} sampled sitemap URLs are not live 200s (redirect/404).`, bad.join('\n'));
    return pass(`All ${sample.length} sampled sitemap URLs return 200.`);
  },
  'crawlability-sitemap-size-and-index-submission': (ctx) => {
    if (!ctx.sitemap.ok) return fail('No sitemap found.');
    if (ctx.sitemap.childCount > 50000) return fail(`Sitemap has ${ctx.sitemap.childCount} URLs (>50,000 limit). Split it.`);
    return pass(`Sitemap ${ctx.sitemap.isIndex ? '(index) ' : ''}within size limits (${ctx.sitemap.childCount} URLs).`);
  },
  'crawlability-sitemap-valid-xml': (ctx) => {
    if (!ctx.sitemap.ok) return fail('No sitemap found.');
    if (!/^<\?xml|<(urlset|sitemapindex)/i.test(ctx.sitemap.body.trim())) return warn('Sitemap does not start with an XML declaration or urlset/sitemapindex root.');
    if (/[<>&](?![a-z#])/i.test(ctx.sitemap.body.replace(/<[^>]+>/g, ''))) return warn('Sitemap may contain unescaped entities.');
    return pass('Sitemap is well-formed XML.');
  },
  'crawlability-preview-deploys-noindexed': (ctx) => {
    if (!isPlatformDefaultDomain(ctx.host)) return pass('Audited host is a custom domain (not a preview/default domain).');
    const noindex = (metaMap(ctx.homepage.root)['robots'] || '').includes('noindex') || (ctx.homepage.headers['x-robots-tag'] || '').includes('noindex');
    return noindex ? pass('Preview/default domain is noindexed.') : fail('This is a *.pages.dev/*.vercel.app preview domain and it is NOT noindexed — it can get indexed as duplicate content.');
  },
  'crawlability-no-broken-or-orphan-pages': async (ctx) => {
    const links = [...new Set(
      ctx.homepage.root.querySelectorAll('a[href]')
        .map((a) => abs(a.getAttribute('href'), ctx.homepage.url))
        .filter((u) => { try { return new URL(u).origin === ctx.origin && !u.includes('#'); } catch { return false; } })
    )].slice(0, 12);
    if (!links.length) return manual('No internal links found on the homepage to sample.');
    const broken = [];
    for (const u of links) {
      const r = await get(u, { redirect: 'manual' });
      if (r.status >= 400 || r.status === 0) broken.push(`${u} -> ${r.status || r.error}`);
    }
    if (broken.length) return fail(`${broken.length}/${links.length} sampled internal links are broken.`, broken.join('\n'));
    return pass(`All ${links.length} sampled internal links resolve.`);
  },
  'crawlability-content-in-initial-html': (ctx) => {
    const len = visibleTextLength(ctx.homepage.root);
    const links = ctx.homepage.root.querySelectorAll('a[href]').length;
    if (len < 200 || links < 3) return warn(`Server-rendered HTML looks thin (${len} chars of text, ${links} links). Ensure content/links are in the static HTML, not JS-only.`);
    return pass(`Homepage HTML contains ${len} chars of text and ${links} links in the initial response.`);
  },
  'crawlability-rss-feed-autodiscoverable': async (ctx) => {
    const link = ctx.homepage.root.querySelectorAll('link[rel="alternate"]').find((l) => /rss|atom/i.test(l.getAttribute('type') || ''));
    if (link) return pass('RSS/Atom feed is autodiscoverable via <link rel="alternate">.', link.getAttribute('href'));
    for (const path of ['/rss.xml', '/feed.xml', '/atom.xml']) {
      const r = await get(ctx.origin + path);
      if (r.ok && /<(rss|feed)/i.test(r.body)) return warn(`A feed exists at ${path} but is not linked via <link rel="alternate"> for autodiscovery.`);
    }
    return manual('No RSS/Atom feed found. Add one with @astrojs/rss if you publish content.');
  },
  'crawlability-no-deprecated-rich-result-schema': (ctx) => deprecatedSchema(ctx),
  'crawlability-llms-txt-optional': async (ctx) => {
    const r = await get(ctx.origin + '/llms.txt');
    return r.ok ? pass('/llms.txt is present.') : manual('Optional: add /llms.txt to guide AI assistants to your key content.');
  },

  // ------------------------------------------------------------------ metadata
  'metadata-title-present-and-unique': (ctx) => {
    const titles = htmlPages(ctx).map((p) => ({ url: p.url, title: txt(p.root.querySelector('title')) }));
    const empty = titles.filter((t) => !t.title);
    if (empty.length) return fail(`${empty.length} sampled page(s) have an empty/missing <title>.`, empty.map((e) => e.url).join('\n'));
    const seen = new Map();
    for (const t of titles) seen.set(t.title, (seen.get(t.title) || 0) + 1);
    const dup = [...seen].filter(([, n]) => n > 1);
    if (dup.length && titles.length > 1) return warn('Duplicate <title> across sampled pages.', dup.map(([t]) => t).join('\n'));
    return pass(`Every sampled page has a non-empty, unique <title> (${titles.length} checked).`);
  },
  'metadata-html-lang': (ctx) => langCheck(ctx),
  'metadata-charset-utf8': (ctx) => {
    const head = ctx.homepage.html.slice(0, 1024);
    if (!/<meta\s+charset=["']?utf-8/i.test(ctx.homepage.html)) return fail('No <meta charset="UTF-8"> found.');
    if (!/<meta\s+charset=["']?utf-8/i.test(head)) return warn('<meta charset> exists but not within the first 1024 bytes of <head>.');
    return pass('<meta charset="UTF-8"> present early in <head>.');
  },
  'metadata-viewport': (ctx) => {
    const v = metaMap(ctx.homepage.root)['viewport'];
    if (!v) return fail('No viewport meta tag.');
    if (!/width=device-width/i.test(v)) return warn('Viewport does not include width=device-width.', v);
    return pass('Responsive viewport meta tag present.', v);
  },
  'metadata-og-image': (ctx) => {
    const m = metaMap(ctx.homepage.root);
    const img = m['og:image'] || m['twitter:image'];
    if (!img) return fail('No og:image / twitter:image — shared links will have no preview image.');
    if (!/^https:\/\//i.test(img)) return warn('og:image is not an absolute HTTPS URL (required by most platforms).', img);
    return pass('og:image present as an absolute HTTPS URL (recommend 1200×630).', img);
  },
  'metadata-og-core-properties': (ctx) => {
    const m = metaMap(ctx.homepage.root);
    const need = ['og:title', 'og:description', 'og:url', 'og:type', 'og:site_name'];
    const missing = need.filter((k) => !m[k]);
    if (missing.length >= 3) return fail(`Missing core Open Graph properties: ${missing.join(', ')}.`);
    if (missing.length) return warn(`Missing Open Graph properties: ${missing.join(', ')}.`);
    return pass('Core Open Graph properties present.');
  },
  'metadata-twitter-card': (ctx) => {
    const card = metaMap(ctx.homepage.root)['twitter:card'];
    if (!card) return warn('No twitter:card tag — set it to summary_large_image.');
    if (card !== 'summary_large_image') return warn(`twitter:card is "${card}" (recommend summary_large_image).`);
    return pass('twitter:card = summary_large_image.');
  },
  'metadata-meta-description': (ctx) => {
    const descs = htmlPages(ctx).map((p) => ({ url: p.url, d: metaMap(p.root)['description'] || '' }));
    const missing = descs.filter((x) => !x.d);
    if (missing.length) return fail(`${missing.length} sampled page(s) have no meta description.`, missing.map((m) => m.url).join('\n'));
    const bad = descs.filter((x) => x.d.length < 70 || x.d.length > 165);
    if (bad.length) return warn(`${bad.length} description(s) are outside the ~130–160 char sweet spot.`, bad.map((b) => `${b.d.length}c ${b.url}`).join('\n'));
    return pass(`All ${descs.length} sampled pages have a well-sized meta description.`);
  },
  'metadata-favicon-set-complete': async (ctx) => {
    const r = ctx.homepage.root;
    const hasIcon = linkRel(r, 'icon').length > 0 || linkRel(r, 'shortcut').length > 0;
    const hasApple = r.querySelectorAll('link[rel="apple-touch-icon"]').length > 0;
    const ico = await get(ctx.origin + '/favicon.ico', { method: 'GET' });
    const missing = [];
    if (!ico.ok) missing.push('favicon.ico');
    if (!hasIcon) missing.push('<link rel="icon">');
    if (!hasApple) missing.push('apple-touch-icon');
    if (missing.length >= 2) return warn(`Incomplete favicon set: missing ${missing.join(', ')}.`);
    if (missing.length) return warn(`Favicon set nearly complete; missing ${missing.join(', ')}.`);
    return pass('Favicon set looks complete (icon, apple-touch-icon, favicon.ico).');
  },
  'metadata-single-h1-heading-hierarchy': (ctx) => h1Check(ctx),
  'metadata-title-length-brand-pattern': (ctx) => {
    const t = txt(ctx.homepage.root.querySelector('title'));
    if (!t) return fail('No <title> on the homepage.');
    if (t.length > 65) return warn(`Title is ${t.length} chars (may truncate in SERPs).`, t);
    if (t.length < 20) return warn(`Title is only ${t.length} chars (likely under-using the space).`, t);
    return pass(`Homepage title length is ${t.length} chars.`, t);
  },
  'metadata-dynamic-og-images': (ctx) => {
    const imgs = htmlPages(ctx).map((p) => metaMap(p.root)['og:image']).filter(Boolean);
    if (imgs.length < 2) return manual('Not enough sampled pages to tell if OG images are per-page.');
    const unique = new Set(imgs).size;
    if (unique === 1) return warn('All sampled pages share one og:image. Generate per-page OG images for articles/products.');
    return pass(`OG images vary across pages (${unique}/${imgs.length} unique).`);
  },
  'metadata-web-app-manifest': async (ctx) => {
    const link = ctx.homepage.root.querySelector('link[rel="manifest"]');
    if (!link) return manual('No web app manifest linked (optional but recommended).');
    const r = await get(abs(link.getAttribute('href'), ctx.homepage.url));
    if (!r.ok) return warn('Manifest is linked but did not load.', link.getAttribute('href'));
    try { JSON.parse(r.body); } catch { return warn('Manifest is linked but is not valid JSON.'); }
    return pass('Web app manifest linked and valid.');
  },
  'metadata-theme-color': (ctx) => (metaMap(ctx.homepage.root)['theme-color'] ? pass('theme-color meta present.') : warn('No theme-color meta tag (minor).')),
  'metadata-no-keywords-meta': (ctx) => noKeywords(ctx),

  // ------------------------------------------------------------ structured-data
  'structured-data-valid-json-ld-clean': (ctx) => {
    const all = htmlPages(ctx).flatMap((p) => jsonLd(p.root));
    if (!all.length) return manual('No JSON-LD found on sampled pages.');
    const bad = all.filter((b) => b.error);
    if (bad.length) return fail(`${bad.length}/${all.length} JSON-LD block(s) are invalid JSON.`, bad[0].error);
    return pass(`All ${all.length} JSON-LD block(s) are valid JSON. Confirm zero errors in the Schema.org validator.`);
  },
  'structured-data-organization-homepage': (ctx) => {
    const org = jsonLdNodes(ctx.homepage.root).find((n) => {
      const t = [].concat(n['@type'] || []).map((x) => String(x).toLowerCase());
      return t.some((x) => x === 'organization' || x.endsWith('business') || x === 'corporation' || x === 'ngo');
    });
    if (!org) return warn('No Organization (or subtype) JSON-LD on the homepage.');
    const miss = [];
    if (!org.logo) miss.push('logo');
    if (!org.sameAs) miss.push('sameAs');
    if (miss.length) return warn(`Organization schema present but missing ${miss.join(', ')}.`);
    return pass('Organization JSON-LD on homepage with logo and sameAs.');
  },
  'structured-data-website-site-name': (ctx) =>
    hasSchemaType(ctx.homepage.root, 'WebSite') ? pass('WebSite JSON-LD present on the homepage.') : warn('No WebSite JSON-LD on the homepage (helps site-name eligibility).'),
  'structured-data-breadcrumblist-inner-pages': (ctx) => {
    const inner = htmlPages(ctx).filter((p) => { try { return new URL(p.url).pathname !== '/'; } catch { return false; } });
    if (!inner.length) return manual('No inner pages sampled to check BreadcrumbList.');
    const withBc = inner.filter((p) => hasSchemaType(p.root, 'BreadcrumbList'));
    if (!withBc.length) return warn('No BreadcrumbList JSON-LD found on sampled inner pages.');
    return pass(`BreadcrumbList present on ${withBc.length}/${inner.length} sampled inner pages.`);
  },
  'structured-data-faqpage-howto-deprecated': (ctx) => deprecatedSchema(ctx),

  // ------------------------------------------------------------------ performance
  'performance-img-explicit-dimensions': (ctx) => imgDimensions(ctx),
  'performance-lcp-image-priority': (ctx) => {
    const imgs = images(ctx.homepage.root);
    if (!imgs.length) return manual('No <img> elements on the homepage.');
    const first = imgs[0];
    const loading = (attr(first, 'loading') || '').toLowerCase();
    const fp = (attr(first, 'fetchpriority') || '').toLowerCase();
    if (loading === 'lazy') return fail('The first/hero image is lazy-loaded — this delays LCP. Make the LCP image eager with fetchpriority="high".', attr(first, 'src'));
    if (fp !== 'high') return warn('The likely LCP image has no fetchpriority="high" (recommended for the hero image).', attr(first, 'src'));
    return pass('The first image is eager with fetchpriority="high".');
  },
  'performance-lcp-preload-link': (ctx) => {
    const pl = linkRel(ctx.homepage.root, 'preload').find((l) => (l.getAttribute('as') || '') === 'image');
    return pl ? pass('An image is preloaded in <head>.', pl.getAttribute('href')) : warn('No <link rel="preload" as="image"> for the LCP image (recommended if the hero is an image).');
  },
  'performance-third-party-scripts-deferred': (ctx) => {
    const ext = ctx.homepage.root.querySelectorAll('script[src]').filter((s) => { try { return new URL(abs(s.getAttribute('src'), ctx.homepage.url)).origin !== ctx.origin; } catch { return false; } });
    const blocking = ext.filter((s) => attr(s, 'async') === null && attr(s, 'defer') === null && (attr(s, 'type') || '') !== 'module');
    if (blocking.length) return warn(`${blocking.length} third-party script(s) are render-blocking (no async/defer).`, blocking.map((s) => s.getAttribute('src')).slice(0, 5).join('\n'));
    return pass(ext.length ? `All ${ext.length} third-party scripts are async/defer/module.` : 'No third-party scripts on the homepage.');
  },
  'performance-preconnect-third-party-origins': (ctx) => {
    const ext = new Set();
    ctx.homepage.root.querySelectorAll('script[src], link[href]').forEach((e) => {
      const s = e.getAttribute('src') || e.getAttribute('href');
      try { const o = new URL(abs(s, ctx.homepage.url)).origin; if (o !== ctx.origin) ext.add(o); } catch {}
    });
    if (!ext.size) return pass('No third-party origins to preconnect.');
    const pc = new Set(linkRel(ctx.homepage.root, 'preconnect').concat(linkRel(ctx.homepage.root, 'dns-prefetch')).map((l) => { try { return new URL(abs(l.getAttribute('href'), ctx.homepage.url)).origin; } catch { return ''; } }));
    const missing = [...ext].filter((o) => !pc.has(o));
    if (missing.length) return warn(`Third-party origins without preconnect/dns-prefetch hints: ${missing.slice(0, 4).join(', ')}.`);
    return pass('Third-party origins have resource hints.');
  },
  'performance-fonts-self-host-display-swap': (ctx) => {
    if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(ctx.homepage.html)) return warn('Google Fonts loaded from Google servers. Self-host WOFF2 with font-display:swap to cut a third-party round trip.');
    return pass('No external Google Fonts requests detected (self-hosting recommended).');
  },
  'performance-cache-hashed-assets-immutable': (ctx) => {
    if (!ctx.assetCache.tested) return manual('No /_astro/ hashed asset found on the homepage to test caching.');
    if (ctx.assetCache.immutable) return pass('Hashed assets are served with a long-lived/immutable Cache-Control.', ctx.assetCache.cacheControl);
    return warn('Hashed /_astro/ assets are not served immutable / long max-age.', ctx.assetCache.cacheControl || '(no cache-control)');
  },
  'performance-compression-enabled': (ctx) => {
    const ce = ctx.homepage.headers['content-encoding'] || '';
    if (/br|gzip|zstd/i.test(ce)) return pass(`Text responses are compressed (${ce}).`);
    return warn('Could not confirm Brotli/gzip from response headers (the runtime may have decoded it). Verify with curl -I -H "Accept-Encoding: br".');
  },
  'performance-no-redirect-chains': (ctx) => {
    const n = ctx.homepage.redirectChain?.length || 0;
    if (n === 0) return pass('Homepage serves directly with no redirects.');
    if (n === 1) return warn('Homepage has 1 redirect hop before serving.');
    return fail(`Homepage goes through ${n} redirect hops.`, ctx.homepage.redirectChain.map((c) => `${c.status} ${c.url}`).join('\n'));
  },
  'performance-dom-size-under-1400': (ctx) => {
    const n = domSize(ctx.homepage.root);
    if (n > 1400) return warn(`Homepage DOM has ~${n} nodes (>1400). Large DOMs hurt INP/CLS.`);
    return pass(`Homepage DOM is ~${n} nodes.`);
  },
  'performance-prefetch-prerender-navigation': (ctx) =>
    (/data-astro-prefetch|rel=["']prefetch/i.test(ctx.homepage.html) ? pass('Prefetch hints detected for instant navigation.') : manual('Enable Astro prefetch for instant internal navigation (optional).')),

  // -------------------------------------------------------------------- images
  'images-explicit-width-height-cls': (ctx) => imgDimensions(ctx),
  'images-use-astro-assets-component': (ctx) => {
    const imgs = images(ctx.homepage.root);
    if (!imgs.length) return manual('No images on the homepage.');
    const optimized = imgs.filter((i) => /\/_astro\//.test(attr(i, 'src') || '') || attr(i, 'srcset')).length;
    const ratio = optimized / imgs.length;
    if (ratio < 0.5) return warn(`Only ${optimized}/${imgs.length} homepage images look optimized (via astro:assets / srcset). Use <Image>/<Picture>.`);
    return pass(`${optimized}/${imgs.length} homepage images use astro:assets/srcset.`);
  },
  'images-descriptive-alt-text': (ctx) => altTextCheck(ctx),
  'images-modern-formats-avif-webp': (ctx) => {
    const imgs = images(ctx.homepage.root);
    if (!imgs.length) return manual('No images on the homepage.');
    const legacy = imgs.filter((i) => /\.(jpe?g|png)(\?|$)/i.test(attr(i, 'src') || '') && !attr(i, 'srcset')).length;
    if (legacy > Math.ceil(imgs.length / 2)) return warn(`${legacy}/${imgs.length} images are raw JPEG/PNG with no modern-format srcset. Serve AVIF/WebP via astro:assets.`);
    return pass('Most homepage images use modern formats or responsive srcset.');
  },
  'images-responsive-srcset-sizes': (ctx) => {
    const imgs = images(ctx.homepage.root).filter((i) => !/icon|logo|sprite/i.test(attr(i, 'src') || ''));
    if (!imgs.length) return manual('No content images on the homepage.');
    const withSrcset = imgs.filter((i) => attr(i, 'srcset')).length;
    if (withSrcset / imgs.length < 0.4) return warn(`Only ${withSrcset}/${imgs.length} content images use responsive srcset/sizes.`);
    return pass(`${withSrcset}/${imgs.length} content images are responsive.`);
  },
  'images-descriptive-filenames': (ctx) => {
    const bad = images(ctx.homepage.root)
      .map((i) => attr(i, 'src') || '')
      .filter((s) => /\/(img_|dsc_|image\d|photo\d|untitled|screenshot)[^/]*\.(jpe?g|png|webp|avif)/i.test(s));
    if (bad.length) return warn('Some images use non-descriptive filenames (IMG_1234.jpg etc.).', bad.slice(0, 4).join('\n'));
    return pass('Image filenames look descriptive.');
  },

  // ---------------------------------------------------------------------- urls
  'urls-self-referencing-canonical': (ctx) => {
    const offenders = [];
    for (const p of htmlPages(ctx)) {
      const c = canonical(p.root);
      if (!c) { offenders.push(`${p.url} (no canonical)`); continue; }
      if (normUrl(abs(c, p.url)) !== normUrl(p.url)) offenders.push(`${p.url} -> ${c}`);
    }
    if (offenders.length) return fail(`${offenders.length}/${htmlPages(ctx).length} sampled pages lack a self-referencing canonical.`, offenders.join('\n'));
    return pass(`All ${htmlPages(ctx).length} sampled pages have a self-referencing canonical.`);
  },
  'urls-canonical-not-blocked-by-robots': (ctx) => {
    if (!ctx.robots.ok) return pass('No robots.txt (nothing blocked).');
    const c = canonical(ctx.homepage.root);
    if (!c) return skip('No canonical to test.');
    try {
      const path = new URL(abs(c, ctx.homepage.url)).pathname;
      const blocked = ctx.robots.star.disallow.some((d) => d && d !== '/' && path.startsWith(d));
      return blocked ? fail('The canonical URL path is disallowed in robots.txt.', path) : pass('Canonical URL is not blocked by robots.txt.');
    } catch { return skip('Could not parse canonical.'); }
  },
  'urls-www-nonwww-single-domain': (ctx) => {
    const w = ctx.redirects.wwwVariant;
    if (w.sameContent) return fail(`Both ${w.from} and ${w.canonicalHost} serve 200 — pick one canonical host and 301 the other.`);
    if (w.ok) return pass(`${w.from} redirects (HTTP ${w.status}) to the canonical host.`, w.to);
    return warn(`Could not confirm a redirect from ${w.from} (status ${w.status}). It may not have DNS — verify both hosts resolve to one canonical.`);
  },
  'urls-http-to-https-redirect': (ctx) => {
    const h = ctx.redirects.httpToHttps;
    if (!h.tested) return skip('Site audited over HTTP.');
    if (h.ok) return h.permanent ? pass(`HTTP redirects to HTTPS (${h.status}).`, h.to) : warn(`HTTP redirects to HTTPS but with ${h.status} (use 301/308).`, h.to);
    return fail(`HTTP did not redirect to HTTPS (status ${h.status}).`);
  },
  'urls-no-redirect-loops': (ctx) => (ctx.homepage.redirectLoop ? fail('Homepage redirect chain loops.') : pass('No redirect loop on the homepage.')),
  'urls-redirects-are-http-not-meta-refresh': (ctx) => {
    const bad = htmlPages(ctx).filter((p) => p.root.querySelector('meta[http-equiv="refresh" i]'));
    if (bad.length) return fail('Meta-refresh redirect found — use a real HTTP 301/308 instead.', bad.map((p) => p.url).join('\n'));
    return pass('No meta-refresh redirects on sampled pages.');
  },
  'urls-trailing-slash-consistency': (ctx) => CHECKS['foundations-trailing-slash-enforced'](ctx),
  'urls-hreflang-annotations': (ctx) => {
    const hl = linkRel(ctx.homepage.root, 'alternate').filter((l) => l.getAttribute('hreflang'));
    if (!hl.length) return manual('No hreflang tags found (fine for a single-language site; required for multilingual).');
    const hasXDefault = hl.some((l) => (l.getAttribute('hreflang') || '').toLowerCase() === 'x-default');
    if (!hasXDefault) return warn(`${hl.length} hreflang tags but no x-default.`);
    return pass(`${hl.length} hreflang annotations including x-default.`);
  },
  'urls-canonical-no-chain': (ctx) => {
    const c = canonical(ctx.homepage.root);
    if (!c) return skip('No canonical on homepage.');
    return normUrl(abs(c, ctx.homepage.url)) === normUrl(ctx.homepage.url) ? pass('Homepage canonical points to itself (no chain).') : warn('Homepage canonical points elsewhere — verify it is not chained.', c);
  },
  'urls-no-session-tokens': (ctx) => {
    const bad = ctx.homepage.root.querySelectorAll('a[href]').map((a) => a.getAttribute('href')).filter((h) => /([?&])(sessionid|sid|phpsessid|jsessionid|token|auth)=/i.test(h || ''));
    if (bad.length) return fail('Internal links contain session/auth tokens in the URL.', bad.slice(0, 4).join('\n'));
    return pass('No session/auth tokens in sampled URLs.');
  },
  'urls-slug-hygiene': (ctx) => slugCheck(ctx),
  'urls-hreflang-language-codes': (ctx) => {
    const codes = linkRel(ctx.homepage.root, 'alternate').map((l) => l.getAttribute('hreflang')).filter(Boolean);
    if (!codes.length) return skip('No hreflang tags.');
    const bad = codes.filter((c) => c.toLowerCase() !== 'x-default' && !bcp47.test(c));
    if (bad.length) return fail('Invalid hreflang codes (must be BCP 47).', bad.join(', '));
    return pass('hreflang codes are valid BCP 47.');
  },
  'urls-internal-links-no-redirect': async (ctx) => {
    const links = [...new Set(ctx.homepage.root.querySelectorAll('a[href]').map((a) => abs(a.getAttribute('href'), ctx.homepage.url)).filter((u) => { try { return new URL(u).origin === ctx.origin && !u.includes('#'); } catch { return false; } }))].slice(0, 10);
    if (!links.length) return manual('No internal links to sample.');
    const redirecting = [];
    for (const u of links) { const r = await get(u, { redirect: 'manual' }); if (r.status >= 300 && r.status < 400) redirecting.push(`${u} -> ${r.status}`); }
    if (redirecting.length) return warn(`${redirecting.length}/${links.length} internal links hit a redirect instead of the final URL.`, redirecting.join('\n'));
    return pass(`All ${links.length} sampled internal links point directly to 200s.`);
  },

  // ------------------------------------------------------------- accessibility
  'accessibility-html-lang-valid': (ctx) => langCheck(ctx),
  'accessibility-viewport-allows-zoom': (ctx) => {
    const v = (metaMap(ctx.homepage.root)['viewport'] || '').toLowerCase();
    if (/user-scalable\s*=\s*(no|0)/.test(v) || /maximum-scale\s*=\s*1(\.0)?\b/.test(v)) return fail('Viewport disables zoom (user-scalable=no / maximum-scale=1) — an accessibility failure.', v);
    return pass('Viewport allows user zoom.');
  },
  'accessibility-skip-to-content-link': (ctx) => {
    const a = ctx.homepage.root.querySelectorAll('a[href^="#"]').find((x) => /skip/i.test(x.text) || /skip/i.test(x.getAttribute('href') || ''));
    return a ? pass('Skip-to-content link present.', a.getAttribute('href')) : warn('No skip-to-content link found as an early focusable element.');
  },
  'accessibility-image-alt-text': (ctx) => altTextCheck(ctx),
  'accessibility-page-title-unique': (ctx) => CHECKS['metadata-title-present-and-unique'](ctx),
  'accessibility-heading-structure': (ctx) => h1Check(ctx),
  'accessibility-semantic-landmarks': (ctx) => {
    const r = ctx.homepage.root;
    const mains = r.querySelectorAll('main').length;
    const missing = [];
    if (mains === 0) missing.push('<main>');
    if (!r.querySelector('header')) missing.push('<header>');
    if (!r.querySelector('nav')) missing.push('<nav>');
    if (!r.querySelector('footer')) missing.push('<footer>');
    if (mains > 1) return warn(`${mains} <main> landmarks (should be exactly one).`);
    if (missing.length) return warn(`Missing semantic landmarks: ${missing.join(', ')}.`);
    return pass('Semantic landmarks present (header, nav, main, footer).');
  },
  'accessibility-form-inputs-labeled': (ctx) => {
    const inputs = ctx.homepage.root.querySelectorAll('input, select, textarea').filter((i) => !['hidden', 'submit', 'button'].includes((i.getAttribute('type') || '').toLowerCase()));
    if (!inputs.length) return manual('No form inputs on the homepage to check.');
    const labels = ctx.homepage.root.querySelectorAll('label[for]').map((l) => l.getAttribute('for'));
    const unlabeled = inputs.filter((i) => !(i.getAttribute('aria-label') || i.getAttribute('aria-labelledby') || (i.getAttribute('id') && labels.includes(i.getAttribute('id')))));
    if (unlabeled.length) return warn(`${unlabeled.length}/${inputs.length} form inputs have no associated label.`);
    return pass(`All ${inputs.length} form inputs are labeled.`);
  },
  'accessibility-buttons-links-accessible-names': (ctx) => {
    const els = ctx.homepage.root.querySelectorAll('a[href], button');
    const empty = els.filter((e) => !e.text.trim() && !e.getAttribute('aria-label') && !e.getAttribute('title') && !e.querySelector('img[alt]:not([alt=""])') && !e.querySelector('svg[aria-label], svg title'));
    if (empty.length) return warn(`${empty.length} link(s)/button(s) have no accessible name (icon-only without aria-label).`);
    return pass('Links and buttons have accessible names.');
  },

  // ----------------------------------------------------------------- platform
  'platform-https-enforced-no-mixed-content': (ctx) => {
    const h = ctx.redirects.httpToHttps;
    const mixed = (ctx.homepage.html.match(/(?:src|href)=["']http:\/\/(?!localhost)/gi) || []).length;
    if (mixed) return fail(`${mixed} mixed-content (http://) resource reference(s) on an HTTPS page.`);
    if (h.tested && !h.ok) return fail('HTTP is not redirected to HTTPS.');
    return pass('HTTPS enforced with no mixed-content references detected.');
  },
  'platform-custom-domain-configured': (ctx) => {
    if (isPlatformDefaultDomain(ctx.host)) return warn(`Audited host ${ctx.host} is a platform default domain — attach and audit your custom domain.`);
    return pass(`Custom domain in use (${ctx.host}).`);
  },
  'platform-www-apex-canonical-redirect': (ctx) => CHECKS['urls-www-nonwww-single-domain'](ctx),
  'platform-default-domain-noindex': (ctx) => CHECKS['crawlability-preview-deploys-noindexed'](ctx),
  'platform-security-headers-baseline': (ctx) => {
    const h = ctx.homepage.headers;
    const checks = {
      'Strict-Transport-Security': h['strict-transport-security'],
      'X-Content-Type-Options': h['x-content-type-options'],
      'Referrer-Policy': h['referrer-policy'],
      'Permissions-Policy': h['permissions-policy'],
      'frame protection': h['x-frame-options'] || (/frame-ancestors/i.test(h['content-security-policy'] || '') ? 'csp' : undefined),
    };
    const missing = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    if (missing.includes('Strict-Transport-Security')) return fail(`Missing security headers: ${missing.join(', ')}.`);
    if (missing.length) return warn(`Missing security headers: ${missing.join(', ')}.`);
    return pass('Baseline security headers are present.');
  },
  'platform-content-security-policy': (ctx) =>
    (ctx.homepage.headers['content-security-policy'] ? pass('Content-Security-Policy header present.') : warn('No Content-Security-Policy header. Add one (Astro 5 has built-in CSP support).')),
  'platform-security-txt-present': async (ctx) => {
    const r = await get(ctx.origin + '/.well-known/security.txt');
    return r.ok ? pass('security.txt present at /.well-known/security.txt.') : manual('Optional: add /.well-known/security.txt (RFC 9116).');
  },

  // -------------------------------------------------------------------- trust
  'trust-analytics-installed-firing': (ctx) => {
    const html = htmlPages(ctx).map((p) => p.html).join('\n');
    const found = [];
    if (/googletagmanager\.com\/gtag|gtag\(/.test(html)) found.push('GA4/gtag');
    if (/googletagmanager\.com\/gtm/.test(html)) found.push('GTM');
    if (/plausible\.io|data-domain=/.test(html)) found.push('Plausible');
    if (/static\.cloudflareinsights\.com|cloudflare.*beacon/.test(html)) found.push('Cloudflare Web Analytics');
    if (/cdn\.usefathom|umami|posthog|matomo/.test(html)) found.push('other analytics');
    if (!found.length) return warn('No analytics snippet detected. Install GA4 or a privacy-friendly analytics tool.');
    return pass(`Analytics detected: ${found.join(', ')}. (Confirm it fires across View Transitions.)`);
  },
  'trust-gsc-domain-property-dns-verified': (ctx) => {
    const tag = metaAll(ctx.homepage.root, 'google-site-verification').length || ctx.homepage.root.querySelector('meta[name="google-site-verification"]');
    return tag ? pass('Google site-verification meta tag present (prefer a DNS-verified Domain property too).') : manual('Verify a Google Search Console Domain property (DNS TXT preferred).');
  },
  'trust-privacy-policy-present-linked': (ctx) => {
    const link = ctx.homepage.root.querySelectorAll('a[href]').find((a) => /privacy/i.test(a.text) || /privacy/i.test(a.getAttribute('href') || ''));
    return link ? pass('Privacy policy is linked from the homepage.', link.getAttribute('href')) : warn('No privacy policy link found on the homepage.');
  },
  'trust-about-contact-pages-present': (ctx) => {
    const links = ctx.homepage.root.querySelectorAll('a[href]');
    const about = links.find((a) => /about/i.test(a.getAttribute('href') || '') || /about/i.test(a.text));
    const contact = links.find((a) => /contact/i.test(a.getAttribute('href') || '') || /contact/i.test(a.text));
    const miss = [];
    if (!about) miss.push('About');
    if (!contact) miss.push('Contact');
    if (miss.length === 2) return warn('No About or Contact links found (E-E-A-T trust signals).');
    if (miss.length) return warn(`Missing ${miss.join(' & ')} link.`);
    return pass('About and Contact pages are linked.');
  },
  'trust-broken-link-check': (ctx) => CHECKS['crawlability-no-broken-or-orphan-pages'](ctx),

  // ------------------------------------------------------------- antipatterns
  'antipatterns-no-indexable-staging-preview': (ctx) => CHECKS['crawlability-preview-deploys-noindexed'](ctx),
  'antipatterns-no-blocking-css-js-in-robots': (ctx) => CHECKS['crawlability-robots-allows-css-js'](ctx),
  'antipatterns-no-noindex-plus-disallow-conflict': (ctx) => {
    if (!ctx.robots.ok) return pass('No robots.txt.');
    const conflicts = [];
    for (const p of htmlPages(ctx)) {
      const noindex = (metaMap(p.root)['robots'] || '').includes('noindex');
      if (!noindex) continue;
      try { const path = new URL(p.url).pathname; if (ctx.robots.star.disallow.some((d) => d && path.startsWith(d))) conflicts.push(p.url); } catch {}
    }
    if (conflicts.length) return fail('Pages are both noindex AND disallowed in robots.txt — Google can never see the noindex.', conflicts.join('\n'));
    return pass('No noindex + Disallow conflicts detected.');
  },
  'antipatterns-no-fake-or-misused-structured-data': (ctx) => CHECKS['structured-data-valid-json-ld-clean'](ctx),
  'antipatterns-no-keywords-meta-tag': (ctx) => noKeywords(ctx),
  'antipatterns-no-rel-next-prev-for-google': (ctx) => {
    const has = linkRel(ctx.homepage.root, 'next').length || linkRel(ctx.homepage.root, 'prev').length;
    return has ? warn('rel=next/prev present — harmless, but Google ignores it for indexing. Do not rely on it.') : pass('No rel=next/prev relied upon.');
  },
  'antipatterns-no-hidden-text-keyword-stuffing': (ctx) => {
    const hidden = (ctx.homepage.html.match(/style=["'][^"']*(display:\s*none|visibility:\s*hidden|font-size:\s*0|text-indent:\s*-?\d{3,})/gi) || []).length;
    if (hidden > 3) return warn(`${hidden} inline-hidden elements found — verify none hide keyword-stuffed text.`);
    return pass('No obvious hidden-text/keyword-stuffing patterns.');
  },
};

// PSI / Lighthouse-backed checks (only meaningful when a PAGESPEED_API_KEY is set).
Object.assign(CHECKS, {
  'performance-lcp-threshold': (ctx) => psiLab(ctx, 'lcpMs', 2500, 4000, 'LCP', 'ms'),
  'performance-cls-threshold': (ctx) => psiLab(ctx, 'cls', 0.1, 0.25, 'CLS', ''),
  'performance-inp-threshold': (ctx) => psiInp(ctx),
  'performance-crux-field-data-passing': (ctx) => psiCrux(ctx),
  'performance-fcp-speed-index': (ctx) => psiFcpSi(ctx),
  'performance-lighthouse-score-90-plus': (ctx) => psiScore(ctx),
  'performance-no-render-blocking-resources': (ctx) => psiRenderBlock(ctx),
  'performance-no-unused-js-css-tbt': (ctx) => psiTbt(ctx),
  'accessibility-color-contrast': (ctx) => psiA11y(ctx),
  'images-lcp-eager-priority': (ctx) => CHECKS['performance-lcp-image-priority'](ctx),
  'images-lazy-load-below-fold': (ctx) => belowFoldLazy(ctx),
  'performance-below-fold-image-loading': (ctx) => belowFoldLazy(ctx),
});

function needPsi() { return manual('Add a PAGESPEED_API_KEY (or run Lighthouse) to measure this automatically.'); }
function psiLab(ctx, key, good, poor, label, unit) {
  if (!ctx.psi) return needPsi();
  const v = ctx.psi.lab[key];
  if (v == null) return needPsi();
  const show = unit === 'ms' ? `${Math.round(v)}ms` : v.toFixed(3);
  if (v <= good) return pass(`Lab ${label} ${show} (good).`);
  if (v <= poor) return warn(`Lab ${label} ${show} (needs improvement; target ≤ ${good}${unit}).`);
  return fail(`Lab ${label} ${show} (poor; target ≤ ${good}${unit}).`);
}
function psiInp(ctx) {
  if (!ctx.psi) return needPsi();
  const f = ctx.psi.field.inp;
  if (!f) return manual('INP needs CrUX field data (not enough traffic). Measure with web-vitals RUM.');
  if (f.p75 <= 200) return pass(`Field INP ${f.p75}ms (good).`);
  if (f.p75 <= 500) return warn(`Field INP ${f.p75}ms (needs improvement; target ≤ 200ms).`);
  return fail(`Field INP ${f.p75}ms (poor; target ≤ 200ms).`);
}
function psiCrux(ctx) {
  if (!ctx.psi) return needPsi();
  if (!ctx.psi.field.hasData) return manual('No CrUX field data yet (low traffic). Re-check after launch or use RUM.');
  const o = ctx.psi.field.overall;
  if (o === 'FAST') return pass('CrUX field data: all Core Web Vitals pass at p75.');
  if (o === 'AVERAGE') return warn('CrUX field data: Core Web Vitals partially passing.');
  return fail('CrUX field data: Core Web Vitals failing at p75.');
}
function psiFcpSi(ctx) {
  if (!ctx.psi) return needPsi();
  const { fcpMs, siMs } = ctx.psi.lab;
  if (fcpMs == null) return needPsi();
  const okFcp = fcpMs <= 1800, okSi = siMs == null || siMs <= 3400;
  if (okFcp && okSi) return pass(`Lab FCP ${Math.round(fcpMs)}ms, Speed Index ${siMs ? Math.round(siMs) + 'ms' : 'n/a'}.`);
  return warn(`Lab FCP ${Math.round(fcpMs)}ms / SI ${siMs ? Math.round(siMs) + 'ms' : 'n/a'} (targets ≤1800 / ≤3400).`);
}
function psiScore(ctx) {
  if (!ctx.psi || ctx.psi.perfScore == null) return needPsi();
  const s = ctx.psi.perfScore;
  if (s >= 90) return pass(`Lighthouse Performance ${s}/100 (mobile).`);
  if (s >= 50) return warn(`Lighthouse Performance ${s}/100 (mobile; aim for 90+).`);
  return fail(`Lighthouse Performance ${s}/100 (mobile; poor).`);
}
function psiRenderBlock(ctx) {
  if (!ctx.psi) return needPsi();
  const n = ctx.psi.lab.renderBlockingItems;
  if (!n) return pass('No render-blocking resources flagged by Lighthouse.');
  return warn(`${n} render-blocking resource(s) (~${Math.round(ctx.psi.lab.renderBlockingMs || 0)}ms potential savings).`);
}
function psiTbt(ctx) {
  if (!ctx.psi) return needPsi();
  const v = ctx.psi.lab.tbtMs;
  if (v == null) return needPsi();
  if (v <= 200) return pass(`Total Blocking Time ${Math.round(v)}ms.`);
  if (v <= 600) return warn(`Total Blocking Time ${Math.round(v)}ms (target ≤200ms).`);
  return fail(`Total Blocking Time ${Math.round(v)}ms (poor).`);
}
function psiA11y(ctx) {
  if (!ctx.psi || ctx.psi.a11yScore == null) return manual('Run Lighthouse/axe to verify WCAG AA color contrast.');
  const s = ctx.psi.a11yScore;
  if (s >= 95) return pass(`Lighthouse Accessibility ${s}/100 (contrast included).`);
  return warn(`Lighthouse Accessibility ${s}/100 — review contrast and a11y audits.`);
}
function belowFoldLazy(ctx) {
  const imgs = images(ctx.homepage.root);
  if (imgs.length <= 2) return manual('Too few images to assess below-fold lazy-loading.');
  const below = imgs.slice(2);
  const notLazy = below.filter((i) => (i.getAttribute('loading') || '') !== 'lazy');
  if (notLazy.length > below.length / 2) return warn(`${notLazy.length}/${below.length} likely below-fold images are not loading="lazy".`);
  return pass('Below-the-fold images use loading="lazy".');
}

// A few more checks derived from data we already collected.
Object.assign(CHECKS, {
  'urls-no-redirect-chains': (ctx) => {
    const homeHops = ctx.homepage.redirectChain?.length || 0;
    const probes = [ctx.redirects.httpToHttps, ctx.redirects.wwwVariant, ctx.redirects.trailingSlash].filter((p) => p?.tested);
    if (homeHops > 1) return fail(`Homepage resolves through ${homeHops} redirect hops.`);
    return pass('Tested redirects resolve in a single hop.');
  },
  'urls-redirect-type-correct': (ctx) => {
    const issues = [];
    if (ctx.redirects.httpToHttps?.ok && !ctx.redirects.httpToHttps.permanent) issues.push('HTTP→HTTPS is not 301/308');
    if (ctx.redirects.wwwVariant?.ok && !ctx.redirects.wwwVariant.permanent) issues.push('www↔apex is not 301/308');
    if (issues.length) return warn(`Canonicalization redirects should be permanent: ${issues.join('; ')}.`);
    return pass('Canonicalization redirects use permanent 301/308 (where tested).');
  },
  'platform-trailingslash-consistent': (ctx) => CHECKS['foundations-trailing-slash-enforced'](ctx),
  'platform-preview-deployments-noindex': (ctx) => CHECKS['crawlability-preview-deploys-noindexed'](ctx),
  'performance-http2-http3-enabled': () => manual('Verify HTTP/2 or HTTP/3 with a tool like `curl -I --http2`/`--http3` or webpagetest. Cloudflare and Vercel both enable HTTP/2+3 by default on custom domains.'),
  'trust-per-page-head-meta-complete': (ctx) => {
    const bad = [];
    for (const p of htmlPages(ctx)) {
      const miss = [];
      if (!txt(p.root.querySelector('title'))) miss.push('title');
      if (!canonical(p.root)) miss.push('canonical');
      if (!metaMap(p.root)['description']) miss.push('description');
      if (miss.length) bad.push(`${p.url} (${miss.join(',')})`);
    }
    if (bad.length) return warn(`${bad.length} sampled page(s) have an incomplete <head>.`, bad.join('\n'));
    return pass(`All ${htmlPages(ctx).length} sampled pages emit a complete title/canonical/description.`);
  },
  'performance-build-minified': async (ctx) => {
    const asset = ctx.homepage.root.querySelectorAll('link[href], script[src]')
      .map((e) => e.getAttribute('href') || e.getAttribute('src'))
      .find((s) => s && /\/_astro\/.*\.(css|js)(\?|$)/.test(s));
    if (!asset) return manual('No /_astro/ CSS/JS asset found to test minification.');
    const r = await get(abs(asset, ctx.homepage.url));
    if (!r.ok) return manual('Could not fetch a build asset to test minification.');
    const nl = (r.body.match(/\n/g) || []).length;
    const ratio = nl / Math.max(1, r.body.length);
    if (ratio > 0.02) return warn('A build asset looks unminified (many newlines). Ensure production minification is on.');
    if (/\/\/[#@]\s*sourceMappingURL/.test(r.body)) return warn('Source map reference shipped in a production asset.');
    return pass('Build assets are minified.');
  },
  'structured-data-article-blog-posts': (ctx) => {
    const articles = htmlPages(ctx).filter((p) => hasSchemaType(p.root, 'Article') || hasSchemaType(p.root, 'BlogPosting') || /\/(blog|article|post|news)\//i.test(p.url));
    if (!articles.length) return manual('No article/blog pages sampled.');
    const bad = [];
    for (const p of articles) {
      const node = jsonLdNodes(p.root).find((n) => /article|blogposting/i.test([].concat(n['@type'] || []).join(',')));
      if (!node) { bad.push(`${p.url} (no Article schema)`); continue; }
      const miss = ['headline', 'image', 'datePublished', 'author'].filter((k) => !node[k]);
      if (miss.length) bad.push(`${p.url} (missing ${miss.join(',')})`);
    }
    if (bad.length) return warn(`${bad.length}/${articles.length} article page(s) have incomplete Article schema.`, bad.join('\n'));
    return pass(`Article schema complete on ${articles.length} sampled article page(s).`);
  },
  'structured-data-article-author-person': (ctx) => {
    const nodes = htmlPages(ctx).flatMap((p) => jsonLdNodes(p.root)).filter((n) => /article|blogposting/i.test([].concat(n['@type'] || []).join(',')));
    if (!nodes.length) return manual('No Article schema sampled.');
    const bad = nodes.filter((n) => n.author && (Array.isArray(n.author) ? n.author : [n.author]).some((a) => a && a['@type'] && String(a['@type']).toLowerCase() !== 'person'));
    if (bad.length) return warn('Some Article author entries are not @type Person.');
    return pass('Article authors are typed as Person (where present).');
  },
});

// ---------------------------------------------------------------- shared helpers
function slugCheck(ctx) {
  const bad = ctx.pages
    .map((p) => { try { return new URL(p.url).pathname; } catch { return ''; } })
    .filter((path) => path && path !== '/' && (/[A-Z]/.test(path) || /[_ ]/.test(path) || /[^\x00-\x7F]/.test(path)));
  if (bad.length) return warn('Some URLs are not clean (uppercase, underscores, spaces, or non-ASCII).', [...new Set(bad)].join('\n'));
  return pass('Sampled URL slugs are lowercase and hyphenated.');
}
function langCheck(ctx) {
  const html = ctx.homepage.root.querySelector('html');
  const lang = html ? html.getAttribute('lang') : undefined;
  if (!lang) return fail('No lang attribute on <html>.');
  if (!bcp47.test(lang)) return warn(`lang="${lang}" is not a valid BCP 47 code.`);
  return pass(`<html lang="${lang}"> set and valid.`);
}
function h1Check(ctx) {
  const offenders = [];
  for (const p of htmlPages(ctx)) {
    const h1 = p.root.querySelectorAll('h1').length;
    if (h1 !== 1) offenders.push(`${p.url} (${h1} h1)`);
  }
  if (offenders.length) return warn('Pages without exactly one H1.', offenders.join('\n'));
  return pass(`Every sampled page has exactly one H1 (${htmlPages(ctx).length} checked).`);
}
function imgDimensions(ctx) {
  const imgs = images(ctx.homepage.root);
  if (!imgs.length) return manual('No images on the homepage.');
  const missing = imgs.filter((i) => !(i.getAttribute('width') && i.getAttribute('height')) && !/aspect-ratio/i.test(i.getAttribute('style') || ''));
  if (missing.length) return missing.length > imgs.length / 2
    ? fail(`${missing.length}/${imgs.length} images lack explicit width/height — a CLS risk.`)
    : warn(`${missing.length}/${imgs.length} images lack explicit width/height.`);
  return pass(`All ${imgs.length} homepage images have explicit dimensions.`);
}
function altTextCheck(ctx) {
  const imgs = images(ctx.homepage.root);
  if (!imgs.length) return manual('No images on the homepage.');
  const missing = imgs.filter((i) => i.getAttribute('alt') === null || i.getAttribute('alt') === undefined);
  if (missing.length) return fail(`${missing.length}/${imgs.length} images have NO alt attribute (use alt="" for decorative).`, missing.map((i) => i.getAttribute('src')).slice(0, 5).join('\n'));
  return pass(`All ${imgs.length} homepage images have an alt attribute.`);
}
function noKeywords(ctx) {
  return metaMap(ctx.homepage.root)['keywords'] !== undefined
    ? warn('Legacy <meta name="keywords"> present — Google ignores it; remove it.')
    : pass('No legacy keywords meta tag.');
}
function deprecatedSchema(ctx) {
  const found = new Set();
  for (const p of htmlPages(ctx)) for (const n of jsonLdNodes(p.root)) {
    const t = [].concat(n['@type'] || []).map((x) => String(x).toLowerCase());
    if (t.includes('faqpage')) found.add('FAQPage');
    if (t.includes('howto')) found.add('HowTo');
  }
  if (found.size) return warn(`Deprecated rich-result schema in use: ${[...found].join(', ')} (Google retired these rich results for most sites).`);
  return pass('No deprecated FAQPage/HowTo rich-result schema relied upon.');
}
