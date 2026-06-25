// Builds the "audit context": fetches the homepage, robots.txt, sitemap, a
// sample of internal pages, and runs the redirect/asset probes the checks need.
import { get, follow, abs, normalizeTarget, toggleWww } from './util.mjs';
import { parseHtml, internalLinks } from './dom.mjs';

const locRe = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
function extractLocs(xml) {
  const out = [];
  let m;
  while ((m = locRe.exec(xml))) out.push(m[1].trim());
  return out;
}

function parseRobots(body) {
  const lines = (body || '').split(/\r?\n/);
  const sitemaps = [];
  const groups = []; // {agents:[], disallow:[], allow:[]}
  let cur = null;
  for (let raw of lines) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [field, ...rest] = line.split(':');
    const key = field.trim().toLowerCase();
    const val = rest.join(':').trim();
    if (key === 'sitemap') sitemaps.push(val);
    else if (key === 'user-agent') {
      if (!cur || cur.hasRules) { cur = { agents: [], disallow: [], allow: [], hasRules: false }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
    } else if (key === 'disallow' && cur) { cur.disallow.push(val); cur.hasRules = true; }
    else if (key === 'allow' && cur) { cur.allow.push(val); cur.hasRules = true; }
  }
  const star = groups.find((g) => g.agents.includes('*')) || groups[0] || { disallow: [], allow: [] };
  return { sitemaps, groups, star };
}

async function loadSitemap(origin, robots) {
  const candidates = [
    ...(robots?.sitemaps || []),
    `${origin}/sitemap-index.xml`,
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-0.xml`,
  ];
  for (const url of candidates) {
    const res = await get(url);
    if (res.ok && /<(urlset|sitemapindex)/i.test(res.body)) {
      const isIndex = /<sitemapindex/i.test(res.body);
      let urls = extractLocs(res.body);
      let childCount = urls.length;
      if (isIndex && urls.length) {
        const child = await get(urls[0]);
        const childUrls = child.ok ? extractLocs(child.body) : [];
        return {
          ok: true, url, status: res.status, contentType: res.headers['content-type'] || '',
          isIndex: true, childSitemaps: urls, urls: childUrls, childCount: childUrls.length, body: res.body,
        };
      }
      return {
        ok: true, url, status: res.status, contentType: res.headers['content-type'] || '',
        isIndex: false, childSitemaps: [], urls, childCount, body: res.body,
      };
    }
  }
  return { ok: false, url: candidates[candidates.length - 1], status: 0, urls: [], isIndex: false, childSitemaps: [], childCount: 0, body: '' };
}

function makePage(res) {
  const root = parseHtml(res.body);
  return {
    requestedUrl: res.requestedUrl,
    url: res.url,
    status: res.status,
    ok: res.ok,
    headers: res.headers,
    html: res.body,
    bytes: Buffer.byteLength(res.body || '', 'utf8'),
    timeMs: res.timeMs,
    redirected: res.redirected,
    root,
  };
}

export async function buildContext(target, opts = {}) {
  const maxPages = opts.maxPages ?? 6;
  const u = normalizeTarget(target);
  const origin = u.origin;
  const host = u.hostname;

  // Homepage (with redirect chain captured).
  const homeFollow = await follow(u.href);
  const homeRes = await get(homeFollow.final.url || u.href);
  const homepage = makePage({ ...homeRes, requestedUrl: u.href });
  homepage.redirectChain = homeFollow.chain;
  homepage.redirectLoop = homeFollow.loop;

  // robots.txt
  const robotsRes = await get(`${origin}/robots.txt`);
  const robots = {
    ok: robotsRes.ok,
    status: robotsRes.status,
    contentType: robotsRes.headers['content-type'] || '',
    body: robotsRes.body,
    ...parseRobots(robotsRes.ok ? robotsRes.body : ''),
  };

  // sitemap
  const sitemap = await loadSitemap(origin, robots);

  // Sample of internal pages: prefer sitemap URLs, else homepage links.
  let sampleUrls = [];
  if (sitemap.urls.length) {
    sampleUrls = sitemap.urls.filter((x) => x.startsWith('http')).slice(0, maxPages - 1);
  } else {
    const seen = new Set();
    for (const href of internalLinks(homepage.root, origin)) {
      const a = abs(href, homepage.url);
      try {
        const au = new URL(a);
        if (au.origin === origin && au.href !== homepage.url && !au.hash && !seen.has(au.href)) {
          seen.add(au.href);
          sampleUrls.push(au.href);
        }
      } catch {}
      if (sampleUrls.length >= maxPages - 1) break;
    }
  }
  const pages = [homepage];
  for (const su of sampleUrls) {
    const r = await get(su);
    pages.push(makePage({ ...r, requestedUrl: su }));
  }

  // Redirect probes
  const redirects = {};
  // http -> https
  if (u.protocol === 'https:') {
    const httpProbe = await follow(`http://${host}${u.pathname}`);
    const last = httpProbe.chain[0];
    redirects.httpToHttps = {
      tested: true,
      ok: !!last && last.status >= 300 && last.status < 400 && /^https:/i.test(last.location || ''),
      status: last?.status ?? httpProbe.final.status,
      to: last?.location,
      permanent: last ? [301, 308].includes(last.status) : false,
    };
  } else {
    redirects.httpToHttps = { tested: false };
  }
  // www <-> apex
  const altHost = toggleWww(host);
  const altProbe = await follow(`${u.protocol}//${altHost}/`);
  const altFirst = altProbe.chain[0];
  redirects.wwwVariant = {
    tested: true,
    from: altHost,
    canonicalHost: host,
    ok: !!altFirst && altFirst.status >= 300 && altFirst.status < 400,
    status: altFirst?.status ?? altProbe.final.status,
    to: altFirst?.location,
    permanent: altFirst ? [301, 308].includes(altFirst.status) : false,
    sameContent: altProbe.final.status === 200 && !altFirst, // serves 200 on both -> duplicate
  };
  // trailing slash (use a sample non-root page)
  const slashSample = pages.find((p) => { try { return new URL(p.url).pathname !== '/'; } catch { return false; } });
  if (slashSample) {
    const su = new URL(slashSample.url);
    const toggled = su.pathname.endsWith('/') ? su.pathname.replace(/\/+$/, '') : su.pathname + '/';
    const probe = await follow(`${su.origin}${toggled}${su.search}`);
    const first = probe.chain[0];
    redirects.trailingSlash = {
      tested: true,
      from: toggled,
      ok: !!first && first.status >= 300 && first.status < 400,
      status: first?.status ?? probe.final.status,
      bothResolve: !first && probe.final.status === 200,
    };
  } else {
    redirects.trailingSlash = { tested: false };
  }

  // 404 probe
  const notFound = await get(`${origin}/__astro-seo-kit-404-probe-${Math.floor(homepage.timeMs)}xyz`);
  const status404 = { status: notFound.status, isSoft: notFound.status === 200 };

  // Hashed-asset cache probe + compression
  let assetCache = { tested: false };
  const assetEl = homepage.root.querySelectorAll('link[href], script[src]')
    .map((e) => e.getAttribute('href') || e.getAttribute('src'))
    .find((s) => s && /\/_astro\//.test(s));
  if (assetEl) {
    const assetUrl = abs(assetEl, homepage.url);
    const a = await get(assetUrl);
    assetCache = {
      tested: true, url: assetUrl, status: a.status,
      cacheControl: a.headers['cache-control'] || '',
      immutable: /immutable/.test(a.headers['cache-control'] || '') || /max-age=(\d{6,})/.test(a.headers['cache-control'] || ''),
    };
  }

  return {
    input: target,
    origin,
    host,
    protocol: u.protocol,
    homepage,
    pages,
    robots,
    sitemap,
    redirects,
    status404,
    assetCache,
    options: opts,
    psi: null, // filled by runner if a key is provided
  };
}
