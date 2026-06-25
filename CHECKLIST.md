# 🚀 Astro SEO Launch Checklist

> The complete, current, **myth-free** SEO checklist for launching an [Astro](https://astro.build) site on **Cloudflare Pages** or **Vercel** — 209 checks across 11 areas, 185 of them automatable.

Built and maintained by [Nordica Marketing](https://www.nordicamarketing.com). Free to use. Pairs with the included **CLI auditor** and **login dashboard** that verify most of this list for you automatically.

**Legend:** 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low &nbsp;|&nbsp; 🤖 auto-checked by the tool · 👤 manual review &nbsp;|&nbsp; stage: `build` → `pre-launch` → `post-launch`

**How to use this:**
1. Build your Astro site, then run `npx astro-seo-audit https://your-site.com` (see [the repo](./README.md)).
2. Work top-down — 🔴 items are launch blockers.
3. For the *why*, the Astro fix, and exact verification, see [**docs/RULES.md**](./docs/RULES.md).

> **At a glance:** 48 critical · 97 high · 49 medium · 15 low.

## Sections

- [Foundations & Astro Config](#foundations-astro-config) — 18 checks
- [Crawlability & Indexation](#crawlability-indexation) — 29 checks
- [Metadata, Head & Social](#metadata-head-social) — 16 checks
- [Structured Data (Schema.org)](#structured-data-schemaorg) — 16 checks
- [Performance & Core Web Vitals](#performance-core-web-vitals) — 29 checks
- [Images & Media](#images-media) — 10 checks
- [URLs, Redirects & i18n](#urls-redirects-i18n) — 22 checks
- [Accessibility & Mobile UX](#accessibility-mobile-ux) — 21 checks
- [Platform & Deployment (Cloudflare / Vercel)](#platform-deployment-cloudflare-vercel) — 19 checks
- [Analytics, Monitoring & Trust](#analytics-monitoring-trust) — 17 checks
- [Anti-Patterns to Avoid](#anti-patterns-to-avoid) — 12 checks

---

## Foundations & Astro Config

The config and architecture decisions everything else depends on: the site URL, static prerendering, the right adapter, content collections, and how the <head> is assembled.

- [ ] 🔴 **Generate every content-collection page via getStaticPaths (v5 entry.id)** — Compare counts: `find src/content/blog -name '*.md' | wc -l` against `find dist/blog -name '*.html' | wc -l` (allowing for drafts). <sub>`build` · 🤖</sub>
- [ ] 🔴 **Inject JSON-LD with set:html + JSON.stringify inside <head>** — Parse built HTML, select `head script[type='application/ld+json']` (cheerio), assert >= 1 node on pages carrying structured data, and JSON.parse each block's contents — any parse… <sub>`build` · 🤖</sub>
- [ ] 🔴 **robots.txt returns 200 with Content-Type text/plain** — `curl -I https://example.com/robots.txt` -> status 200 and a Content-Type header containing text/plain. <sub>`pre-launch` · 🤖</sub>
- [ ] 🔴 **Set site in astro.config to the exact production HTTPS origin** — GET / and parse <link rel="canonical"> href: assert it is absolute and its scheme+host exactly match the production origin. <sub>`build` · 🤖</sub>
- [ ] 🔴 **Install the correct platform adapter when any route uses SSR** — If any .astro file contains `export const prerender = false` or output is 'server', grep astro.config.* for an adapter import and confirm it matches the deploy target; the build m… <sub>`build` · 🤖</sub>
- [ ] 🔴 **Prerender all indexable pages to static HTML (output static, no needless SSR)** — After build, assert dist/ contains a .html file for every content page and that no server-only route appears in /sitemap-0.xml. <sub>`build` · 🤖</sub>
- [ ] 🟠 **Set base only for subdirectory deployments, otherwise leave it default** — Fetch the homepage and inspect <script src> / <link href> for /_astro/ assets: paths must carry the correct base prefix and return 200. <sub>`build` · 🤖</sub>
- [ ] 🟠 **Use lowercase, hyphen-separated, human-readable URL slugs** — `find dist -name '*[A-Z_]*' -name '*.html'` should return nothing; spot-check several sitemap URLs for lowercase/hyphen formatting. <sub>`build` · 🤖</sub>
- [ ] 🟠 **Enforce required SEO frontmatter via the collection Zod schema** — Add a markdown file missing `title` and run `astro build`; it must throw a Zod validation error and fail the build. <sub>`build` · 🤖</sub>
- [ ] 🟠 **Custom 404 page returns a real HTTP 404 (no soft 404)** — `curl -s -o /dev/null -w '%{http_code}' https://example.com/this-does-not-exist-xyz123` must print 404 (not 200/302). <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Exclude draft entries from production pages and sitemap** — Build, then confirm no known draft slug exists in dist/ (e.g. <sub>`build` · 🤖</sub>
- [ ] 🟠 **Control faceted/filter parameter URLs to prevent index bloat** — Crawl from internal links, collect param-bearing URLs, and verify each is either Disallowed in robots.txt, carries a canonical to the base URL, or simply returns the base content… <sub>`pre-launch` · 👤</sub>
- [ ] 🟠 **Hydrate islands with the least-eager client directive that works** — Run Lighthouse / measure CWV (TBT/INP) and total JS: `find dist/_astro -name '*.js' | xargs wc -c | tail -1` — a content page should ship well under ~20 KB JS. <sub>`build` · 🤖</sub>
- [ ] 🟠 **Keep SEO-critical content out of client:only and server:defer islands** — `curl -s https://example.com/blog/sample-post | grep -o '<h1[^>]*>.*</h1>'` should return the post H1; load a page with JS disabled and confirm primary content is still readable. <sub>`build` · 🤖</sub>
- [ ] 🟠 **Emit all head metadata from one BaseHead component with no duplicate tags** — Static: `grep -r '<title>' src/ --include='*.astro' | grep -v 'BaseHead'` should return nothing. <sub>`build` · 🤖</sub>
- [ ] 🟠 **Enforce one trailing-slash form with a 301 redirect at the platform** — GET the wrong form (e.g. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟡 **Consolidate multiple schemas into one @graph and use JSON-LD only** — Per page, count `script[type='application/ld+json']` blocks; if >1, recommend @graph consolidation, and when @graph is used assert it is a non-empty array. <sub>`build` · 🤖</sub>
- [ ] 🟡 **Prevent layout shift when using View Transitions (ClientRouter)** — Navigate between pages with the DevTools Performance panel recording and look for Layout Shift entries during the transition; CLS should stay < 0.1 across navigation events. <sub>`post-launch` · 👤</sub>

## Crawlability & Indexation

Whether search engines can find, fetch, and index your pages: robots.txt, sitemaps, noindex hygiene, and content/links that exist in the server-rendered HTML.

- [ ] 🔴 **404 pages return HTTP 404/410, not a soft 404** — curl -sI https://example.com/this-does-not-exist-xyz123 -> assert HTTP 404 (or 410). <sub>`post-launch` · 🤖</sub>
- [ ] 🔴 **Structured data marks up only content visible on the same page** — For Article: assert ld+json `headline` matches `<h1>` after normalization. <sub>`pre-launch` · 🤖</sub>
- [ ] 🔴 **Pages with structured data are crawlable and indexable** — For each URL with ld+json: test the path against robots.txt rules (no Disallow match) and GET it asserting no `noindex` in `meta[name=robots]` or the `X-Robots-Tag` header. <sub>`pre-launch` · 🤖</sub>
- [ ] 🔴 **No production page carries an accidental noindex directive** — GET every intended-to-be-indexed page -> parse <head> for `meta[name=robots]` / `meta[name=googlebot]` and assert content does not contain `noindex`; also assert the `X-Robots-Tag… <sub>`pre-launch` · 🤖</sub>
- [ ] 🔴 **Production robots.txt must not block crawling of the site** — GET /robots.txt -> assert HTTP 200 and Content-Type text/plain; parse all User-agent groups and assert no bare `Disallow: /` (or `/*`) applies to `*` or any Googlebot agent. <sub>`pre-launch` · 🤖</sub>
- [ ] 🔴 **sitemap-index.xml is present, returns 200, and uses absolute HTTPS URLs** — GET /sitemap-index.xml -> assert 200, Content-Type contains `xml`, body contains `<sitemapindex`. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Search Console property is verified and indexation is monitored** — GSC URL Inspection API (`searchconsole.urlInspection.index.inspect`) on a sample of key pages -> assert indexingState INDEXING_ALLOWED and crawlState CRAWLED; review the Pages rep… <sub>`post-launch` · 🤖</sub>
- [ ] 🟠 **No broken internal links and no orphaned indexable pages** — Crawl from the homepage following only `<a href>` links: collect all discovered URLs, GET each and assert HTTP 200; then diff the sitemap URL set against the crawled set and flag… <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **noindex pages are crawlable but excluded from the sitemap** — For each noindex URL: assert it is NOT disallowed by robots.txt. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Preview/staging deployments are blocked from indexing** — curl -I against each preview URL (and the *.pages.dev / preview custom domain) -> assert the `X-Robots-Tag` header contains `noindex`. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **robots.txt does not block CSS/JS assets and is syntactically valid** — GET /robots.txt -> resolve all Disallow rules against known asset dirs (/_astro/, /assets/, /js/, /css/) and flag any match -> feed the file to a robots.txt parser and assert 0 pa… <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **robots.txt references the sitemap with an absolute URL** — GET /robots.txt -> grep `^Sitemap:` -> assert value is an absolute https:// URL ending in sitemap-index.xml -> GET that URL -> assert HTTP 200. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Sitemap lists only canonical, indexable, live URLs** — Count `<url>` entries vs `find dist -name '*.html' | wc -l` (minus known non-indexable pages); diff should be zero or explained. <sub>`build` · 🤖</sub>
- [ ] 🟠 **Sitemap files stay within size limits and the index URL is submitted** — Parse sitemap-index.xml -> for each child GET it -> assert `<url>` count <= 50000 and byte size <= 52428800. <sub>`post-launch` · 🤖</sub>
- [ ] 🟠 **Indexable SSR (prerender=false) routes are added to the sitemap manually** — List all routes with `prerender = false` that should be indexed and confirm each appears in /sitemap-0.xml (via customPages or a custom endpoint). <sub>`build` · 👤</sub>
- [ ] 🟠 **Sitemap URLs match the site's trailing-slash convention** — Parse all `<loc>` -> assert consistent trailing slash per config -> GET each and assert the final URL after redirects equals the sitemap URL exactly (no 3xx). <sub>`pre-launch` · 🤖</sub>
- [ ] 🟡 **robots.txt AI crawler policy is intentional (training vs search bots)** — Read /robots.txt and confirm at least one AI crawler (GPTBot/ClaudeBot/Google-Extended) has an explicit Allow/Disallow matching the documented decision, and that the wildcard rule… <sub>`pre-launch` · 👤</sub>
- [ ] 🟡 **Content images use <img>/astro:assets, not CSS background-image** — Audit rendered CSS for `background-image: url()` declarations and cross-reference against the content-image inventory; content-carrying images in background-image are violations (… <sub>`build` · 👤</sub>
- [ ] 🟡 **Indexable content and links are in the server-rendered HTML, not JS-only** — GET the page and inspect the raw HTML body without executing JS -> assert critical text content and internal `<a href>` links are present in the string (e.g. <sub>`build` · 🤖</sub>
- [ ] 🟡 **Image sitemap entries are present for indexable images** — GET /sitemap-0.xml -> assert root declares `xmlns:image='http://www.google.com/schemas/sitemap-image/1.1'` -> count `<image:image>` children (must be >0 for image-heavy sites) ->… <sub>`pre-launch` · 🤖</sub>
- [ ] 🟡 **No deprecated Google rich-result schema types in production** — For every ld+json block (including nested @type), assert none match the hard-deprecated list (HowTo, BookAction, ClaimReview, CourseInstance, EmployerAggregateRating, LearningReso… <sub>`pre-launch` · 🤖</sub>
- [ ] 🟡 **Paginated content uses crawlable URLs, anchor links, and self-canonicals** — GET page 2 of a series -> assert the URL uses a path/query segment and no `#` fragment -> assert `<link rel=canonical>` is self-referencing -> assert at least one visible `<a href… <sub>`pre-launch` · 🤖</sub>
- [ ] 🟡 **RSS feed exists and is autodiscoverable** — GET /rss.xml -> assert 200 and Content-Type application/rss+xml (or xml), with `<channel><title>`, `<link>`, and >=1 `<item>` having `<link>` and `<pubDate>`. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟡 **Sitemap lastmod reflects real content changes (omit changefreq/priority)** — GET /sitemap-0.xml -> parse `<lastmod>` for a page unchanged for weeks -> assert it does not equal today's date. <sub>`build` · 👤</sub>
- [ ] 🟡 **Sitemap XML is UTF-8 encoded with properly escaped URLs** — GET /sitemap-0.xml -> run through an XML parser (xmllint/DOMParser) -> assert 0 parse errors and UTF-8 charset (or absent, which defaults to UTF-8). <sub>`build` · 🤖</sub>
- [ ] 🟡 **Non-HTML files use X-Robots-Tag for indexing control** — curl -I each non-HTML URL meant to be noindexed -> assert the `X-Robots-Tag` response header contains `noindex`. <sub>`pre-launch` · 🤖</sub>
- [ ] ⚪ **Large sites (10k+ pages) block crawl-budget-wasting URLs** — Crawl the site and count URLs bearing ?sort=, ?order=, ?ref=, ?session= -> assert each is robots-blocked or canonicalized to the parameter-free URL. <sub>`post-launch` · 👤</sub>
- [ ] ⚪ **llms.txt (and optional llms-full.txt) for AI/LLM guidance** — GET /llms.txt -> assert 200, Content-Type text/plain, body starts with `#` and contains at least one Markdown link `[text](url)` to a real (200) page. <sub>`pre-launch` · 🤖</sub>
- [ ] ⚪ **Prefetch strategy is appropriate for site size and SSR cost** — Load a content-heavy page (50+ links) with DevTools Network open and count prefetch requests on load; with 'viewport' only visible-link requests should appear (far fewer than 'loa… <sub>`pre-launch` · 👤</sub>

## Metadata, Head & Social

The per-page tags that decide how pages look in search results and when shared: titles, descriptions, Open Graph, Twitter cards, favicons, charset, and language.

- [ ] 🔴 **<meta charset="UTF-8"> first in <head>, within first 1024 bytes** — `curl -s https://example.com | head -c 1024 | grep -i 'charset'` must match, and the charset meta must be the first meta tag in <head>. <sub>`build` · 🤖</sub>
- [ ] 🔴 **html[lang] set to a valid BCP-47 language code** — Assert document.documentElement.getAttribute('lang') is non-empty and matches /^[a-z]{2,3}(-[A-Z]{2,3})?$/. <sub>`build` · 🤖</sub>
- [ ] 🔴 **Valid og:image (and twitter:image) at 1200x630 with absolute HTTPS URL** — Extract og:image from HTML; assert it is absolute https://, then `curl -sI <url>` returns 200 with Content-Type image/*; verify actual dimensions are 1200x630 (image-size lib) and… <sub>`pre-launch` · 🤖</sub>
- [ ] 🔴 **Unique, non-empty <title> on every page** — Parse build output: `find dist -name '*.html' | xargs grep -L '<title>'` must be empty, and `grep -rh '<title>' dist --include='*.html' | sort | uniq -d` must return nothing. <sub>`build` · 🤖</sub>
- [ ] 🔴 **Mobile viewport meta tag present and non-restrictive** — Assert document.querySelector('meta[name="viewport"]').content includes width=device-width and initial-scale=1 and excludes user-scalable=no / maximum-scale=1. <sub>`build` · 🤖</sub>
- [ ] 🟠 **Complete favicon set: favicon.ico, 32px PNG, SVG, and apple-touch-icon** — GET /favicon.ico -> 200 (image/x-icon); GET /favicon.svg -> 200 (image/svg+xml); GET the 32x32 PNG -> 200 (image/png); GET /apple-touch-icon.png -> 200 (image/png), dimensions 180… <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Unique meta description on every page, 130-160 chars** — `grep -rL 'name="description"' dist --include='*.html'` empty (none missing); `grep -roh 'name="description" content="[^"]*"' dist --include='*.html' | sort | uniq -d` empty (no d… <sub>`build` · 🤖</sub>
- [ ] 🟠 **Core Open Graph properties set (title, description, url, type, site_name)** — Assert each og:* tag exists with non-empty content; og:url is absolute https:// and equals link[rel=canonical] href; og:type is lowercase 'website'/'article'; blog posts use 'arti… <sub>`build` · 🤖</sub>
- [ ] 🟠 **twitter:card set to summary_large_image (with Twitter card fields)** — Assert meta[name="twitter:card"].content === 'summary_large_image'. <sub>`build` · 🤖</sub>
- [ ] 🟡 **Per-page dynamic OG images, not one shared fallback** — For sample pages, extract og:image from HTML, GET it, and assert status 200, Content-Type image/png|jpeg, size > ~5 KB, and that the path is page-specific (not one shared /og.png). <sub>`pre-launch` · 🤖</sub>
- [ ] 🟡 **One H1 per page with a logical, unskipped heading hierarchy** — `find dist -name '*.html' | xargs grep -c '<h1' | grep -v ':1$'` lists pages with zero or multiple H1s. <sub>`build` · 🤖</sub>
- [ ] 🟡 **Title length ~50-60 chars with a consistent brand suffix** — Parse each dist title, strip entities, and flag length < 30 or > 65; assert non-home titles match /[|\-] BrandName$/. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟡 **Complete web app manifest with required PWA fields and icons** — GET /manifest.webmanifest -> 200 with Content-Type application/manifest+json; parse JSON and assert name non-empty, display in {standalone,minimal-ui,fullscreen}, start_url presen… <sub>`pre-launch` · 🤖</sub>
- [ ] ⚪ **No legacy <meta name="keywords"> tag** — `grep -r 'name="keywords"' dist/` returns empty. <sub>`build` · 🤖</sub>
- [ ] ⚪ **Service worker registered with an offline fallback (PWA baseline)** — Run Lighthouse and assert the installability/SW checks pass; in DevTools > Application > Service Workers confirm status 'activated and running', then toggle Offline and reload to… <sub>`pre-launch` · 🤖</sub>
- [ ] ⚪ **theme-color meta tag(s) for browser chrome tinting** — Assert meta[name="theme-color"] exists with a valid hex/rgb value; if two are declared, assert both carry a media attribute. <sub>`pre-launch` · 🤖</sub>

## Structured Data (Schema.org)

JSON-LD that makes pages eligible for rich results and helps engines understand entities: Organization, WebSite, Article, Product, and BreadcrumbList.

- [ ] 🔴 **Product/LocalBusiness schema values match visible page content** — For each product/local page: extract offers.price (and address/telephone) from ld+json and the visible price/NAP via a CSS selector. <sub>`post-launch` · 🤖</sub>
- [ ] 🔴 **All JSON-LD is valid and passes the Schema.org validator with zero errors** — Parse every ld+json block as JSON (assert no parse error). <sub>`build` · 🤖</sub>
- [ ] 🟠 **Article author is a Person with name (no titles) and a working bio URL/sameAs** — Parse Article ld+json; assert author['@type'] === 'Person' and author.name is non-empty and does not match title patterns (Dr., CEO, Editor, '|', 'posted by'). <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Article/BlogPosting JSON-LD on every article with headline, image, dates, author** — For each article URL: parse ld+json, find @type Article/BlogPosting; assert headline non-empty; image is a non-empty array whose urls return 200 image content-type; datePublished… <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **BreadcrumbList on inner pages with sequential, canonical item URLs** — For sample inner URLs: parse ld+json, find @type 'BreadcrumbList', assert itemListElement length >= 2, positions are positive integers sequential from 1, names non-empty. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Do not rely on FAQPage or HowTo schema for rich results (deprecated)** — Detect FAQPage, HowTo, or the June 2025 retired types in ld+json and emit an informational warning (not a blocking error) noting no rich result will be generated. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **LocalBusiness JSON-LD on homepage for local/physical businesses** — Fetch homepage ld+json; find @type matching LocalBusiness or subtype; assert name, address.streetAddress, address.addressLocality, address.addressCountry non-empty; assert telepho… <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Organization (or specific subtype) JSON-LD on the homepage with logo and sameAs** — Fetch homepage; parse ld+json; find @type matching Organization or subtype; assert name and url are non-empty. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Product JSON-LD on product pages with name and offers/rating** — For each product URL: parse ld+json, find @type 'Product'; assert name non-empty and at least one of review/aggregateRating/offers present. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Rich Results Test confirms eligibility for each schema type in use** — Call the Rich Results Test API for each representative URL; assert testStatus.status is 'COMPLETE', richResultsItems is non-empty for types expected to produce rich results, and e… <sub>`post-launch` · 🤖</sub>
- [ ] 🟠 **VideoObject JSON-LD on pages where a video is the primary content** — For each page containing an `<iframe>` or `<video>`: parse ld+json, assert a VideoObject node with non-empty name, description, thumbnailUrl, uploadDate (ISO 8601) and at least on… <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **WebSite JSON-LD on homepage for site-name eligibility (no SearchAction)** — Fetch homepage; parse ld+json; find @type 'WebSite'; assert name non-empty and url matches the canonical homepage URL (respecting Astro trailingSlash). <sub>`pre-launch` · 🤖</sub>
- [ ] 🟡 **Monitor Search Console Enhancements for structured-data errors post-launch** — Log in to GSC > Search Appearance > Rich Results and review each enhancement type's error/warning counts; or query the URL Inspection API (requires OAuth/service-account) and flag… <sub>`post-launch` · 👤</sub>
- [ ] 🟡 **Primary content image has ImageObject markup with stable URL and dimensions** — GET page HTML, extract ld+json; assert @type 'ImageObject' (correct casing) OR that the Article/Product/Recipe schema includes an image with url and width/height. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟡 **ProfilePage JSON-LD on author bio pages** — For each author page URL: parse ld+json, assert a ProfilePage node with @id matching the canonical URL, mainEntity['@type'] === 'Person', mainEntity.name non-empty, and mainEntity… <sub>`pre-launch` · 🤖</sub>
- [ ] ⚪ **Connect entities in a single @graph with @id cross-references (WebPage layer)** — For each page @graph, if a WebPage (or subtype) entity is present assert its url matches the canonical URL and its isPartOf/breadcrumb @id references resolve to other entities in… <sub>`pre-launch` · 🤖</sub>

## Performance & Core Web Vitals

The speed and stability signals Google measures from real users: LCP, INP, and CLS, plus the loading, caching, font, and JS tactics that move them.

- [ ] 🔴 **CLS is under 0.1 at the 75th percentile** — Lighthouse: lighthouse <URL> --output=json | jq '.audits["cumulative-layout-shift"].numericValue' must be < 0.1. <sub>`post-launch` · 🤖</sub>
- [ ] 🔴 **All three Core Web Vitals pass in CrUX field data at p75** — CrUX API: POST https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=<KEY> with body {"origin":"https://yourdomain.com","metrics":["largest_contentful_paint","interacti… <sub>`post-launch` · 🤖</sub>
- [ ] 🔴 **Every <img> has explicit width and height (or layout prop) to reserve space** — Parse rendered HTML: document.querySelectorAll('img') with a missing width or height attribute (and no inline aspect-ratio) should be empty. <sub>`build` · 🤖</sub>
- [ ] 🔴 **INP is under 200 ms at the 75th percentile** — CrUX API: POST https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=<KEY> with metrics ["interaction_to_next_paint"] and assert p75 < 200. <sub>`post-launch` · 🤖</sub>
- [ ] 🔴 **LCP/hero image is eager + fetchpriority=high (never lazy-loaded), exactly one per page** — Parse rendered HTML: the LCP <img> must NOT have loading='lazy' and SHOULD have fetchpriority='high'; assert document.querySelectorAll('img[fetchpriority="high"]').length === 1 an… <sub>`build` · 🤖</sub>
- [ ] 🔴 **LCP is under 2.5 s at the 75th percentile** — PSI API: GET https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed?url=<URL>&strategy=mobile&category=performance and assert lighthouseResult.audits['largest-cont… <sub>`post-launch` · 🤖</sub>
- [ ] 🟠 **Hashed assets (_astro/*) are served immutable; HTML is served short/no-cache** — curl -sI <URL>/_astro/FILE.HASH.js | grep -i cache-control must include max-age=31536000 and immutable; curl -sI <URL>/ | grep -i cache-control must show max-age=0/no-cache and mu… <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Dynamic content, banners, and iframes/embeds reserve space (aspect-ratio / fixed)** — curl -sL <URL> | grep '<iframe' | grep -v 'aspect-ratio\|height' flags unsized iframes. <sub>`build` · 👤</sub>
- [ ] 🟠 **Brotli (or zstd/gzip) compression is active for text responses** — curl -sI -H 'Accept-Encoding: br, gzip, zstd' <URL> | grep -i content-encoding should return br (or zstd/gzip). <sub>`post-launch` · 🤖</sub>
- [ ] 🟠 **Web fonts are self-hosted WOFF2 with font-display:swap, preloaded, and fallback-metric tuned** — curl -sL <URL> | grep 'fonts.googleapis' returns nothing; grep 'font-display' shows swap/optional; grep for a font preload link in <head>; @font-face for the system fallback conta… <sub>`build` · 🤖</sub>
- [ ] 🟠 **HTTP/2 or HTTP/3 (QUIC) is enabled on the domain** — curl -sI --http2 <URL> | grep -i 'HTTP/' should show HTTP/2 200; for HTTP/3 use curl --http3 (curl 7.66+) or http2.pro. <sub>`post-launch` · 🤖</sub>
- [ ] 🟠 **LCP image is discoverable in initial HTML and has a <link rel=preload> in <head>** — GET the HTML: the LCP image URL must appear in source (curl -sL <URL> | grep the filename), and document.querySelector('link[rel="preload"][as="image"]') in <head> must exist with… <sub>`build` · 🤖</sub>
- [ ] 🟠 **No render-blocking CSS or synchronous JS in the critical path** — Lighthouse 'Eliminate render-blocking resources' must report 0 blocking resources. <sub>`build` · 🤖</sub>
- [ ] 🟠 **Minimal unused/heavy JS and CSS; Total Blocking Time under 200 ms** — lighthouse <URL> --output=json | jq '.audits["total-blocking-time"].numericValue' < 200; Lighthouse 'Remove unused JavaScript' and 'Remove unused CSS' audits must pass; DevTools C… <sub>`build` · 🤖</sub>
- [ ] 🟠 **Critical third-party origins have preconnect / dns-prefetch hints** — curl -sL <URL> | grep 'preconnect\|dns-prefetch' and cross-reference against high-priority third-party origins in the DevTools Network panel — each render-critical third-party ori… <sub>`build` · 🤖</sub>
- [ ] 🟠 **Third-party scripts (GTM, analytics, chat) are deferred or facade-loaded** — curl -sL <URL> | grep -oP '<script[^>]+src=[^>]+>' | grep -v 'defer\|async\|type="module"' must return nothing. <sub>`build` · 🤖</sub>
- [ ] 🟠 **Time to First Byte (TTFB) is under 800 ms** — curl -w 'TTFB: %{time_starttransfer}s\n' -o /dev/null -s <URL> — assert time_starttransfer < 0.800. <sub>`post-launch` · 🤖</sub>
- [ ] 🟡 **Below-fold images use loading=lazy and decoding=async** — Parse rendered HTML: document.querySelectorAll('img:not([fetchpriority="high"]):not([loading="lazy"])') should be empty (allowing deliberate above-fold eager cases); the fetchprio… <sub>`build` · 🤖</sub>
- [ ] 🟡 **Production build output (HTML, CSS, JS) is minified and source maps are off** — curl -sL <URL>/_astro/HASH.css | wc -l should be ~1 line; Lighthouse 'Minify CSS' and 'Minify JavaScript' audits must pass. <sub>`build` · 🤖</sub>
- [ ] 🟡 **Animations use only transform/opacity (no layout-triggering properties)** — Source audit: grep .astro/.css for 'transition:' or 'animation:' lines that reference layout properties without transform/opacity. <sub>`build` · 🤖</sub>
- [ ] 🟡 **DOM size is under 1400 nodes on initial load** — Lighthouse 'Avoid an excessive DOM size' must not be flagged; lighthouse <URL> --output=json | jq '.audits["dom-size"].numericValue' < 1400. <sub>`build` · 🤖</sub>
- [ ] 🟡 **First Contentful Paint under 1.8 s and Speed Index under 3.4 s (lab)** — lighthouse <URL> --output=json | jq '.audits["first-contentful-paint"].numericValue' < 1800 and '.audits["speed-index"].numericValue' < 3400. <sub>`post-launch` · 🤖</sub>
- [ ] 🟡 **Event handlers over 50 ms break work into smaller tasks / yield** — In the console register a PerformanceObserver for type 'longtask', interact with the page, and assert no interaction produces a task > 50 ms. <sub>`build` · 👤</sub>
- [ ] 🟡 **Lighthouse Performance score is 90+ on both mobile and desktop** — PSI API: GET .../runPagespeed?url=<URL>&strategy=mobile&category=performance and assert lighthouseResult.categories.performance.score * 100 >= 90; repeat with strategy=desktop. <sub>`post-launch` · 🤖</sub>
- [ ] 🟡 **RUM with web-vitals attribution / LoAF is set up for INP root-cause monitoring** — After interaction, confirm the analytics payload contains longAnimationFrameEntries with duration and scripts; in DevTools Performance, record an interaction and confirm the 'Long… <sub>`post-launch` · 👤</sub>
- [ ] 🟡 **No unnecessary redirect chains on the critical path** — curl -sI -L --max-redirs 10 -w '%{num_redirects}' <URL> -o /dev/null must return 0 or 1; for the LCP image, curl -sI -L <IMAGE_URL> should show a single HTTP response. <sub>`post-launch` · 🤖</sub>
- [ ] 🟡 **Vercel ISR does not serve SEO-critical pages indefinitely stale** — curl -sI https://example.com/some-page | grep -i x-vercel-cache (HIT/MISS, not BYPASS) and curl ... <sub>`post-launch` · 🤖</sub>
- [ ] ⚪ **Consider content-visibility:auto for large off-screen sections** — curl -sL <URL> | grep 'content-visibility' to confirm it is applied to appropriate sections; in DevTools Rendering with Paint flashing, off-screen sections should only flash on en… <sub>`build` · 👤</sub>
- [ ] ⚪ **Astro prefetch (and optional client prerender) enabled for instant internal navigation** — Confirm prefetch is not false in astro.config.mjs; in rendered HTML check for data-astro-prefetch attributes (and a <script type=speculationrules> tag in Chromium builds when clie… <sub>`build` · 🤖</sub>

## Images & Media

Fast, accessible, indexable media via astro:assets: explicit dimensions, modern formats, responsive srcset, alt text, and correct lazy/eager loading.

- [ ] 🔴 **Every image has explicit width and height (or aspect-ratio)** — HTML audit: parse every <img> and assert both width and height attributes are present and numeric (curl -sL <URL> | grep -oP '<img[^>]+>' | grep -v 'width=' should return zero row… <sub>`build` · 🤖</sub>
- [ ] 🟠 **Informative images have descriptive alt text; decorative images use alt=""** — HTML audit: assert every <img> has an alt attribute (present, including empty), and that informative images (hero/product/inline content) have non-empty alt. <sub>`build` · 🤖</sub>
- [ ] 🟠 **Below-the-fold images are lazy-loaded with async decoding** — Lighthouse 'Defer offscreen images' must pass. <sub>`build` · 🤖</sub>
- [ ] 🟠 **LCP/hero image is eager-loaded with high fetch priority** — Run Lighthouse/DevTools Performance, identify the LCP element, and assert it is NOT lazy-loaded and carries fetchpriority='high'; LCP must be < 2.5s. <sub>`build` · 🤖</sub>
- [ ] 🟠 **Serve content images as AVIF/WebP with a JPEG/PNG fallback** — Crawl all img src/srcset and <source> URLs, send HEAD requests, and assert the Content-Type response header is image/avif or image/webp for large content images. <sub>`build` · 🤖</sub>
- [ ] 🟠 **Variable-width images use responsive srcset and accurate sizes** — Parse HTML: assert content images have a srcset with at least 2 width descriptors (e.g. <sub>`build` · 🤖</sub>
- [ ] 🟠 **Significant images use <Image>/<Picture> from astro:assets, not bare <img>** — Build/HTML audit: for content images, assert the rendered src points to an optimized /_astro/ path (static) or the platform optimizer endpoint (e.g. <sub>`build` · 🤖</sub>
- [ ] 🟡 **Image filenames are descriptive and kebab-cased** — Crawl all img src / source srcset URLs, extract the filename stem (before the hash), and assert it matches /^[a-z][a-z0-9-]{2,}\.(avif|webp|jpg|jpeg|png|svg)$/i and is not a gener… <sub>`pre-launch` · 🤖</sub>
- [ ] 🟡 **Tune WebP/AVIF quality (≈75-85), never quality 100** — Lighthouse 'Efficiently encode images' must report 0 violations (estimated savings < ~100KB). <sub>`build` · 🤖</sub>
- [ ] 🟡 **Image sitemap entries for key content images** — GET /sitemap-images.xml, parse as XML, and assert: the xmlns:image namespace is declared; at least one <image:image> per content page; every <image:loc> is an absolute HTTPS URL;… <sub>`pre-launch` · 🤖</sub>

## URLs, Redirects & i18n

A clean, canonical, non-duplicating URL surface: canonical tags, www/HTTPS/trailing-slash redirects, parameter handling, and hreflang.

- [ ] 🔴 **Canonical pages are not blocked in robots.txt** — GET /robots.txt, parse Disallow rules, and for each canonical URL in the sitemap assert it is NOT matched by any Disallow rule (use a parser such as the `robots-parser` npm packag… <sub>`pre-launch` · 🤖</sub>
- [ ] 🔴 **Multilingual pages carry complete, reciprocal hreflang annotations with x-default** — GET each localized page: assert hreflang tags exist for every configured locale + x-default, all hrefs are absolute https://, each href GETs to 200 (not 3xx), and the canonical eq… <sub>`pre-launch` · 🤖</sub>
- [ ] 🔴 **All HTTP traffic redirects to HTTPS with a 301/308** — GET http://example.com/ over plain HTTP -> assert status 301/308 with Location `https://example.com/`. <sub>`pre-launch` · 🤖</sub>
- [ ] 🔴 **No redirect loops** — curl -L --max-redirs 20 -o /dev/null -w '%{http_code}' https://example.com/ -> if curl aborts with 'Too many redirects', a loop exists. <sub>`pre-launch` · 🤖</sub>
- [ ] 🔴 **Redirects are real HTTP 301/308, never HTML meta-refresh** — For every defined redirect: `curl -sI https://example.com/old` -> assert status 301/308 with correct Location and NO HTML body. <sub>`build` · 🤖</sub>
- [ ] 🔴 **Self-referencing canonical tag on every page** — GET each sampled page, parse <head>: assert exactly one <link rel="canonical"> exists, its href matches `^https://`, contains no `?`, and equals the page's own served URL byte-for… <sub>`build` · 🤖</sub>
- [ ] 🔴 **Trailing-slash policy is consistent across Astro config, platform, canonicals, and links** — GET /about AND GET /about/ -> exactly one returns 200, the other 301/308 to the canonical form; both must never be 200. <sub>`pre-launch` · 🤖</sub>
- [ ] 🔴 **www and non-www redirect to a single canonical domain** — curl -I against the non-preferred host -> assert 301/308 with a Location header pointing to the canonical host. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Canonical tags do not chain (A -> B -> C)** — For each page, read its canonical URL, GET that URL, read its canonical, and assert the second canonical equals itself (no second hop). <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Canonical, sitemap <loc>, and internal links use one identical URL form** — For a sample of pages, fetch /sitemap-0.xml (or sitemap-index), the page's canonical, and the inbound internal link hrefs, and assert all three strings are identical. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **hreflang language/region codes are valid BCP 47 (ISO 639-1 + ISO 3166-1 Alpha-2)** — Parse all hreflang attribute values across pages and validate each against BCP 47 / ISO 639-1 + ISO 3166-1; flag uk (use en-GB), cz (use cs), cn (use zh-CN), and es-419 (unsupport… <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **i18n prefixDefaultLocale and root-URL behavior are configured correctly** — GET / -> assert 200 (content) or 301/302 to a locale prefix that returns 200. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **No redirect chains; every redirect resolves in one hop** — For each redirect source: `curl -L --max-redirs 10 -w '%{num_redirects}' -o /dev/null https://example.com/old` -> assert num_redirects == 1 (a single 3xx then 200). <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Session tokens, user IDs, and auth tokens never appear in indexable URLs** — Crawl the sitemap and internal links and assert no URL matches `sid=`, `session=`, `token=`, `auth=`, or `PHPSESSID=`. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Renamed or removed pages 301-redirect, not 404** — Pull GSC Coverage > Not Found; for each 404 URL determine if it was previously in the sitemap or has inbound links, and flag any lacking a redirect. <sub>`pre-launch` · 👤</sub>
- [ ] 🟠 **Tracking, filter, sort, and UI-state parameter URLs are not indexed as duplicates** — GET a page with `?utm_source=test&sort=price` -> assert the canonical href has no `?`. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Redirect type matches intent: 301/308 for permanent, 302/307 for temporary** — For each redirect: assert status is in {301, 308} for permanent moves and only in {302, 307} for explicitly temporary ones. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **@astrojs/sitemap emits hreflang xhtml:link entries consistent with the HTML** — GET /sitemap-0.xml; for a multilingual page assert child <xhtml:link rel="alternate" hreflang> elements cover all locales, then compare that set (URLs + lang codes) against the pa… <sub>`build` · 🤖</sub>
- [ ] 🟠 **URL slugs are lowercase, hyphen-separated, and free of special characters** — Crawl sitemap and build output and assert each path segment matches `^[a-z0-9-]+$` (no uppercase, underscore, space, special char, or //). <sub>`build` · 🤖</sub>
- [ ] 🟡 **Internal links point directly to final canonical URLs (no internal redirects)** — Crawl internal links recursively from the homepage; issue a HEAD request for each href and assert status 200 (not 3xx). <sub>`pre-launch` · 🤖</sub>
- [ ] ⚪ **Localized SSR pages set a Content-Language response header** — For SSR deployments only: GET /fr/about -> assert response header `Content-Language: fr`. <sub>`pre-launch` · 🤖</sub>
- [ ] ⚪ **URLs are short, descriptive, keyword-relevant, and shallow** — Crawl the sitemap: programmatically flag URLs over 75/100 chars, URLs with more than 4 path segments, and `?id=\d+` or UUID-only segments; then human-review a sample of 10-20 (tit… <sub>`build` · 👤</sub>

## Accessibility & Mobile UX

Inclusive, mobile-friendly markup that overlaps strongly with quality/UX signals: landmarks, headings, contrast, focus, labels, and tap targets.

- [ ] 🔴 **Set a valid lang attribute on the root html element** — GET each page's HTML, parse <html lang="...">, assert the attribute exists and matches /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/. <sub>`pre-launch` · 🤖</sub>
- [ ] 🔴 **Every image has alt text (descriptive for content, empty for decorative)** — Parse rendered HTML; assert every <img> has an alt attribute present (document.querySelectorAll('img:not([alt])').length === 0). <sub>`pre-launch` · 🤖</sub>
- [ ] 🔴 **Provide a skip-to-content link as the first focusable element** — Parse HTML and assert the first focusable element is an <a> whose href starts with '#' and whose text contains 'skip', and that the target id exists. <sub>`pre-launch` · 🤖</sub>
- [ ] 🔴 **Viewport meta tag must not disable user zoom** — GET the page HTML, extract the content of <meta name="viewport">, assert it does not contain user-scalable=no or maximum-scale < 2. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Use valid, role-appropriate ARIA only when native HTML is insufficient** — Run axe-core against the live page: aria-allowed-attr, aria-required-attr, aria-required-children, aria-required-parent, aria-roles, aria-valid-attr, aria-valid-attr-value, aria-h… <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Buttons and links have descriptive accessible names** — Parse HTML; for each button assert non-empty text OR aria-label OR aria-labelledby. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Meet WCAG AA contrast for text (4.5:1) and UI components (3:1)** — Run Lighthouse/axe color-contrast against the live URL for text. <sub>`pre-launch` · 👤</sub>
- [ ] 🟠 **All form controls have programmatically associated labels** — Parse HTML; for each non-hidden input/select/textarea assert one of: aria-label, aria-labelledby pointing to an existing id, or a <label for> matching the control's id. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Exactly one H1 per page with sequential, non-skipping headings** — Parse HTML; assert exactly one <h1>; extract all headings in DOM order and assert no rank jump greater than 1. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **All functionality is keyboard-operable with no keyboard traps** — Manually navigate the whole page using only Tab, Shift+Tab, Enter, Space, Escape, and Arrows; confirm nothing traps focus and every modal/dropdown closes with Escape and restores… <sub>`pre-launch` · 👤</sub>
- [ ] 🟠 **Legible body text and 16px form inputs to avoid iOS zoom** — Playwright at 390px: read getComputedStyle(el).fontSize per text element and assert >=12px overall and >=16px for <p> body text and <input>. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Layout is responsive with no horizontal scroll on mobile** — Playwright at 390x844: assert document.documentElement.scrollWidth <= clientWidth (no horizontal overflow), repeat at 360px. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **No intrusive interstitials blocking content on mobile load** — Playwright cold visit (no cookies) at mobile viewport, wait ~3s, flag any fixed/absolute element with z-index>100 covering >25% of the viewport; back up with a screenshot. <sub>`post-launch` · 👤</sub>
- [ ] 🟠 **Every page has a unique, descriptive title element** — Parse <title>; assert non-empty and not a placeholder ('Astro', 'My Site'). <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Use semantic landmarks with one main and uniquely labelled navs** — Parse HTML; assert presence of header/nav/main/footer (or equivalent roles), exactly one <main>, and that every <nav> beyond the first has a unique aria-label. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Tap targets are large enough and adequately spaced** — Run Lighthouse with --form-factor=mobile and read the SEO tap-targets audit (flags <48x48px with <48px spacing). <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **All interactive elements have visible keyboard focus indicators** — Manually Tab through the live page in Chrome and Firefox (and dark mode), confirming each element shows a clear ring. <sub>`pre-launch` · 👤</sub>
- [ ] 🟡 **Data tables use th headers with scope; no layout tables** — Parse HTML; for each <table> assert at least one <th>, and that column <th> use scope="col" or sit inside <thead>. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟡 **Respect prefers-reduced-motion for animations** — Static scan of built CSS: assert @keyframes/transition declarations are inside @media (prefers-reduced-motion: no-preference) or paired with a reduce override. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟡 **Name content SVGs and hide decorative SVGs** — Parse HTML; for each <svg>, pass if aria-hidden="true"; otherwise assert aria-label OR aria-labelledby pointing to a <title> with text. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟡 **Prerecorded videos have synchronized captions** — Parse HTML; assert each <video> has a child <track kind="captions|subtitles">. <sub>`pre-launch` · 🤖</sub>

## Platform & Deployment (Cloudflare / Vercel)

Getting the deploy right: the correct adapter, HTTPS/SSL, a single canonical host, security headers, caching, and platform-specific gotchas.

- [ ] 🔴 **Install the correct Astro adapter (or none) for the deployment target** — Inspect astro.config.mjs: if output:'static', assert no adapter; if output:'server', assert exactly one adapter matching the platform. <sub>`build` · 🤖</sub>
- [ ] 🔴 **Cloudflare: set SSL/TLS encryption mode to Full (Strict), never Flexible** — `curl -sIL https://www.example.com` should produce only 1-2 HTTP status lines (no redirect loop); 3+ indicates a loop. <sub>`pre-launch` · 🤖</sub>
- [ ] 🔴 **Attach the production custom domain and match it to astro.config site** — `dig www.example.com +short` returns a Cloudflare/Vercel CNAME or IP; `GET https://www.example.com` returns 200 with cf-ray (Cloudflare) or x-vercel-id (Vercel) header. <sub>`pre-launch` · 🤖</sub>
- [ ] 🔴 **Enforce HTTPS site-wide (HTTP 301/308 to HTTPS) with zero mixed content** — `curl -I http://example.com/` and `http://www.example.com/` must return 301/308 with a Location starting https://. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Cloudflare SSR: set security/cache headers in middleware, not only _headers** — `curl -sI https://www.example.com/<dynamic-ssr-page> | grep -i x-content-type-options` must show nosniff, and a static asset (e.g., /_astro/main.js) must also carry security heade… <sub>`build` · 🤖</sub>
- [ ] 🟠 **Cloudflare SSR: serve 404 via the Worker, not a prerendered 404 page** — `curl -sI https://[project].pages.dev/nonexistent-page-xyz | grep HTTP` must return 404 (not 200 or 5xx); re-test on the custom domain. <sub>`build` · 🤖</sub>
- [ ] 🟠 **Block the platform default domain (*.pages.dev / *.vercel.app) from indexing** — `curl -sI https://mysite.pages.dev | grep -i 'x-robots-tag\|location'` must show noindex or a 301 to the custom domain; `curl -sI https://mysite.vercel.app | grep -i x-robots-tag`… <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Inject JSON-LD only via JSON.stringify, never template literals** — Static analysis: grep Astro source for set:html on script[type='application/ld+json'] and assert every occurrence wraps a JSON.stringify(...) object, not a template literal. <sub>`build` · 🤖</sub>
- [ ] 🟠 **Remove output:'hybrid' (removed in Astro v5) and use per-page prerender opt-in** — Grep astro.config.mjs for output:'hybrid' and assert absent; run `npx astro build` and assert no output-mode errors/deprecation warnings. <sub>`build` · 🤖</sub>
- [ ] 🟠 **Ensure preview/staging deployments return X-Robots-Tag: noindex** — `curl -sI https://<preview-hash>.vercel.app` and `https://<preview-hash>.pages.dev` (and any staging custom domain) | grep -i x-robots-tag must contain noindex; confirm the produc… <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Allowlist remote image domains and configure the right SSR image service** — Assert image.domains/remotePatterns is non-empty if any remote <img src> uses astro:assets, and each remote hostname appears in the allowlist. <sub>`build` · 🤖</sub>
- [ ] 🟠 **Set the baseline security headers (HSTS, nosniff, frame-ancestors, Referrer-Policy, Permissions-Policy)** — `curl -sI https://www.example.com` and assert: strict-transport-security max-age>=31536000+includeSubDomains; x-content-type-options: nosniff; content-security-policy contains fra… <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Keep trailingSlash config consistent with build.format and platform routing** — In dist/ confirm files match the chosen format (/about.html vs /about/index.html). <sub>`build` · 🤖</sub>
- [ ] 🟠 **Pick one canonical host (www or apex) and 301/308 redirect the other** — `curl -sI https://<non-canonical>` returns 301/308 with Location to the canonical host; `curl -sI https://<canonical>` returns 200. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟡 **Cloudflare: stay within _redirects (2000/100) and _headers (100) rule limits** — Assert `wc -l public/_redirects` < 2100 (wildcard rules count toward the 100 dynamic cap) and `grep -c '^/' public/_headers` < 100; after deploy, test a rule near the bottom of ea… <sub>`build` · 🤖</sub>
- [ ] 🟡 **Cloudflare SSR: keep the Worker within the 128 MB isolate memory limit** — Load-test the most complex SSR pages on staging and monitor Cloudflare Analytics > Workers for Error 1102 spikes; run `wrangler tail` during load to catch memory-limit errors. <sub>`build` · 👤</sub>
- [ ] 🟡 **Ship a Content-Security-Policy (use Astro's CSP to drop unsafe-inline)** — `curl -sI https://www.example.com | grep -i content-security-policy` shows at least default-src and frame-ancestors; or in built HTML <head> assert a CSP meta with sha256-/sha384-… <sub>`build` · 🤖</sub>
- [ ] 🟡 **Vercel: avoid duplicate/conflicting headers between vercel.json and adapter output** — Inspect .vercel/output/config.json headers/routes vs root vercel.json. <sub>`build` · 🤖</sub>
- [ ] ⚪ **Serve an RFC 9116 security.txt at /.well-known/security.txt** — `curl -s https://example.com/.well-known/security.txt | grep -E '^(Contact|Expires):'`; assert 200, Content-Type text/plain, and an Expires date in the future. <sub>`pre-launch` · 🤖</sub>

## Analytics, Monitoring & Trust

Proving the site works and earning trust: analytics, Search Console/Bing verification, uptime/error monitoring, and the E-E-A-T pages users and Google expect.

- [ ] 🔴 **Analytics installed sitewide and firing pageviews (including on View Transitions)** — Fetch page HTML and assert an analytics script tag in <head>. <sub>`pre-launch` · 🤖</sub>
- [ ] 🔴 **Cookie consent banner gating non-essential scripts (GDPR / ePrivacy)** — Load the site from an EU locale (Accept-Language: de) in a private window and intercept all network requests for the first 5s: assert no analytics/tracking requests fire before in… <sub>`pre-launch` · 👤</sub>
- [ ] 🔴 **Google Search Console Domain property verified via DNS TXT (not only HTML tag)** — Run dig TXT example.com and assert a google-site-verification= record is present. <sub>`pre-launch` · 🤖</sub>
- [ ] 🔴 **Sitemap submitted to Google Search Console with zero errors** — GET https://example.com/sitemap-index.xml → 200, Content-Type application/xml, valid XML with at least one <sitemap> child. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **About and Contact pages present with real info and a working contact method** — GET the homepage and assert nav/footer <a> links to /about and /contact. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Author bio pages exist for every author referenced in Article schema** — Extract every author.url from Article JSON-LD across the site and GET each one; assert all return 200 with body word count > 100. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Bing Webmaster Tools verified and sitemap submitted** — Query the Bing Webmaster API /sites endpoint and assert the site is verified, or GET the homepage and parse for <meta name='msvalidate.01'> (meta method), or confirm the CNAME via… <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Core Web Vitals monitored via RUM and the GSC CWV report** — Confirm web-vitals (or a verified RUM integration) in package.json and built HTML. <sub>`post-launch` · 🤖</sub>
- [ ] 🟠 **JavaScript error/exception monitoring configured with source maps** — From the live site console run Sentry.captureException(new Error('test')) and confirm it appears in the Sentry dashboard within ~60s with a readable (source-mapped) stack trace. <sub>`post-launch` · 🤖</sub>
- [ ] 🟠 **Post-launch GSC indexing review; no staging noindex/robots leak in production** — GET each key URL and assert no X-Robots-Tag: noindex header and no <meta name='robots' content='noindex'> in HTML. <sub>`post-launch` · 🤖</sub>
- [ ] 🟠 **Every page emits its own complete <head> meta set (no transition persistence assumptions)** — For each sampled page, fetch raw HTML with curl (no JS) and assert <title>, <meta name='description'>, <meta property='og:title'>, <meta property='og:image'>, and <link rel='canon… <sub>`build` · 🤖</sub>
- [ ] 🟠 **Privacy policy page present, footer-linked, and accurate** — GET the homepage and assert the footer contains an <a> with href matching /privacy or /privacy-policy; GET that href → 200 with non-empty, non-placeholder body. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Uptime monitoring with alerting on key URLs** — Query the monitoring service API to confirm active monitors with alert contacts, or as a basic auditor check GET the homepage → 200, Content-Type text/html, response time < 3000ms. <sub>`post-launch` · 🤖</sub>
- [ ] 🟡 **Broken-link check pre-launch and scheduled post-launch** — Run lychee against ./dist/ or the live URL and assert exit code 0; the report lists URL, source page, and HTTP status for any failures. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟡 **Cookieless, consent-free analytics evaluated before defaulting to GA4** — GET page HTML and check <head> for exactly one analytics loader (plausible.io, cloudflareinsights.com, fathom.com, or googletagmanager.com/gtag/js) unless dual-running is intentio… <sub>`pre-launch` · 🤖</sub>
- [ ] 🟡 **GA4 key conversion events configured and verified (if GA4 is used)** — In GA4 DebugView, submit the form on the live site and assert the conversion event appears within ~30s. <sub>`post-launch` · 🤖</sub>
- [ ] 🟡 **IndexNow configured to push changed URLs to Bing and partner engines** — GET https://example.com/<key>.txt → 200 with body equal to the key string. <sub>`build` · 🤖</sub>

## Anti-Patterns to Avoid

Outdated or risky tactics that waste effort or get you penalized: keyword stuffing, cloaking, indexable staging, dead meta tags, and FID-era advice.

- [ ] 🔴 **Do not cloak or show different content to crawlers than to users** — Fetch a page twice with a normal browser UA and with `Googlebot` UA and diff the rendered HTML/main content and final URL; any meaningful difference in body content or redirect ta… <sub>`build` · 🤖</sub>
- [ ] 🔴 **Never let staging or preview deployments get indexed** — Request a preview URL (e.g. <sub>`pre-launch` · 🤖</sub>
- [ ] 🟠 **Don't buy links or build spammy link schemes** — Manual link-profile review (Search Console Links report / a backlink tool) for unnatural anchor patterns and known link-farm sources; audit outbound paid/affiliate links for missi… <sub>`post-launch` · 👤</sub>
- [ ] 🟠 **Avoid doorway pages and mass-generated thin location/keyword pages** — Sample a set of programmatically generated routes and compute body-text similarity; high cross-page similarity with only token substitution flags doorway/thin patterns. <sub>`build` · 👤</sub>
- [ ] 🟠 **No hidden text, sneaky links, or keyword stuffing** — Scan rendered HTML/CSS for text nodes with near-invisible styling (color matching background, font-size <= 1px, large negative text-indent, off-screen absolute positioning contain… <sub>`build` · 🤖</sub>
- [ ] 🟡 **Don't block CSS, JS, or asset directories in robots.txt** — Fetch `/robots.txt` and assert it does not `Disallow` `/_astro/`, `*.css`, `*.js`, or image directories; cross-check with Search Console URL Inspection "Page resources" for blocke… <sub>`build` · 🤖</sub>
- [ ] 🟡 **Don't add fake, invisible, or irrelevant structured data** — Validate every page's JSON-LD with the Rich Results Test / Schema.org validator; assert each declared entity's key fields correspond to on-page visible content, and flag review/ra… <sub>`build` · 🤖</sub>
- [ ] 🟡 **Optimize INP, not the retired FID metric** — Run Lighthouse / PageSpeed Insights and CrUX field data and assert INP is reported and within budget; flag any config, third-party script, or doc still referencing FID as the resp… <sub>`post-launch` · 🤖</sub>
- [ ] 🟡 **Never combine noindex with a robots.txt Disallow on the same URL** — Cross-reference: for each URL carrying noindex, assert it is NOT also Disallowed in robots.txt. <sub>`build` · 🤖</sub>
- [ ] ⚪ **Don't rely on exact-match domains or keyword-stuffed URLs** — Manual review of domain and slug strategy: flag domains/slugs that are long strings of hyphenated target keywords rather than a brand + concise topic. <sub>`build` · 👤</sub>
- [ ] ⚪ **Drop the keywords meta tag (and other dead meta SEO tags)** — Parse the HTML `<head>` and assert `<meta name="keywords">` (and other deprecated SEO meta tags) are absent across pages. <sub>`build` · 🤖</sub>
- [ ] ⚪ **Don't rely on rel=next/prev as a Google SEO tactic** — Parse the head: if rel=next/prev are present, verify paginated pages are ALSO linked via real anchors and present in the sitemap (so discovery doesn't depend on the hints). <sub>`build` · 🤖</sub>

---

<sub>Generated from `seo-rules.json` (rules 2026-06-24). Regenerate with `npm run build:checklist`.</sub>
