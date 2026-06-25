# Astro SEO Launch Kit — Full Rule Reference

Every check in [CHECKLIST.md](../CHECKLIST.md), with the reasoning, the Astro-specific fix, and exactly how to verify it. 209 rules · version 2026-06-24.

## Sections

- [Foundations & Astro Config](#foundations-astro-config)
- [Crawlability & Indexation](#crawlability-indexation)
- [Metadata, Head & Social](#metadata-head-social)
- [Structured Data (Schema.org)](#structured-data-schemaorg)
- [Performance & Core Web Vitals](#performance-core-web-vitals)
- [Images & Media](#images-media)
- [URLs, Redirects & i18n](#urls-redirects-i18n)
- [Accessibility & Mobile UX](#accessibility-mobile-ux)
- [Platform & Deployment (Cloudflare / Vercel)](#platform-deployment-cloudflare-vercel)
- [Analytics, Monitoring & Trust](#analytics-monitoring-trust)
- [Anti-Patterns to Avoid](#anti-patterns-to-avoid)

---

## Foundations & Astro Config

The config and architecture decisions everything else depends on: the site URL, static prerendering, the right adapter, content collections, and how the <head> is assembled.

### 🔴 Generate every content-collection page via getStaticPaths (v5 entry.id)

`foundations-content-collections-routes-generated` · **Critical** · stage: `build` · 🤖 automatable · check: `body_regex`

**What.** Markdown/MDX in content collections does not auto-create pages. A dynamic route (src/pages/blog/[...id].astro in v5) must call getCollection() in getStaticPaths() and return every entry. In the v5 content layer entries expose `id` (the old `slug` property was removed) and the config lives at src/content.config.ts (not src/content/config.ts).

**Why it matters.** Without getStaticPaths the collection content has no URL: no page is built, nothing enters the sitemap, and the content is unindexable.

**Fix (Astro).**

In src/pages/blog/[...id].astro:```js
export async function getStaticPaths() {
  const posts = await getCollection('blog');
  return posts.map(p => ({ params: { id: p.id }, props: { post: p } }));
}
```Use p.id (not p.slug). Define the collection with a loader in src/content.config.ts.

**Cloudflare / Vercel.** None — getStaticPaths runs at build time on both platforms' CI.

**How to verify.** Compare counts: `find src/content/blog -name '*.md' | wc -l` against `find dist/blog -name '*.html' | wc -l` (allowing for drafts). They should match; a mismatch means routes are missing.

**Common mistakes.** Using removed entry.slug in v5; keeping the old src/content/config.ts path; filtering getStaticPaths by an env flag that silently drops posts in production.

**Sources.** <https://docs.astro.build/en/guides/content-collections/> · <https://docs.astro.build/en/guides/upgrade-to/v5/>

---

### 🔴 Inject JSON-LD with set:html + JSON.stringify inside <head>

`foundations-jsonld-injection-safe` · **Critical** · stage: `build` · 🤖 automatable · check: `json_ld`

**What.** Emit every JSON-LD block as `<script type="application/ld+json" set:html={JSON.stringify(schemaObj)} />` and place it in the document <head>. Never build JSON-LD with raw string interpolation or template literals, and avoid injecting it client-side into <body> after hydration.

**Why it matters.** Astro escapes element text by default; set:html bypasses that, and JSON.stringify handles quote/character escaping so titles with quotes or angle brackets cannot corrupt the JSON or open an injection vector. <head> placement also avoids Googlebot's ~2MB crawl cutoff (data low in a large <body> may never be parsed) and is parsed more reliably by AI/third-party crawlers; client-injected schema may be missed before the crawl timeout.

**Fix (Astro).**

In a layout/BaseHead component within <head>: `<script type="application/ld+json" set:html={JSON.stringify(schema)} />`. For typed authoring, optionally use astro-seo-schema (schema-dts backed): `import { Schema } from 'astro-seo-schema'`.

**Cloudflare / Vercel.** None — both platforms serve the prerendered <head> as-is.

**How to verify.** Parse built HTML, select `head script[type='application/ld+json']` (cheerio), assert >= 1 node on pages carrying structured data, and JSON.parse each block's contents — any parse failure or a block found only in <body> is a fail.

**Common mistakes.** Backtick template literals embedding dynamic values instead of JSON.stringify on an object; appending the schema via a client framework after page load.

**Sources.** <https://stephen-lunt.dev/blog/astro-structured-data/> · <https://docs.astro.build/en/reference/directives-reference/> · <https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data>

---

### 🔴 robots.txt returns 200 with Content-Type text/plain

`foundations-robots-txt-200-text-plain` · **Critical** · stage: `pre-launch` · 🤖 automatable · check: `robots`

**What.** GET /robots.txt must return HTTP 200 with Content-Type: text/plain.

**Why it matters.** A 404/5xx robots.txt makes crawlers fall back to crawling everything, while a 401/403 is treated by Google as a site-wide crawl block. A wrong content type can cause the file to download instead of being read.

**Fix (Astro).**

Static sites: put robots.txt in public/. Dynamic: src/pages/robots.txt.ts returning `new Response(body, { headers: { 'Content-Type': 'text/plain' } })`. Avoid having both a public/robots.txt and a conflicting src/pages route.

**Cloudflare / Vercel.** Both Cloudflare Pages and Vercel serve public/ files directly; no extra config for a static robots.txt.

**How to verify.** `curl -I https://example.com/robots.txt` -> status 200 and a Content-Type header containing text/plain.

**Common mistakes.** Two conflicting robots.txt sources; serving application/octet-stream so the browser downloads the file.

**Sources.** <https://ai-kit.net/blog/robots-txt-astro-cloudflare> · <https://docs.astro.build/en/reference/configuration-reference/>

---

### 🔴 Set site in astro.config to the exact production HTTPS origin

`foundations-site-config-production-url` · **Critical** · stage: `build` · 🤖 automatable · check: `html_head`

**What.** The `site` option in astro.config.mjs must be the full production HTTPS origin (e.g. https://www.example.com) with no trailing slash. It must not be localhost, an http:// URL, a *.vercel.app/*.pages.dev preview URL, or undefined.

**Why it matters.** Astro.site is the base for every absolute URL the site emits: canonical tags, og:url, og:image, hreflang hrefs, and all @astrojs/sitemap <loc> values are built from `new URL(path, Astro.site)`. If unset, canonicals become undefined/relative and the sitemap integration refuses to emit absolute URLs; if set to a staging/preview domain, every canonical and sitemap entry points at the wrong host. This is a compound critical failure touching nearly every other SEO signal.

**Fix (Astro).**

defineConfig({ site: 'https://www.example.com' }) with no trailing slash. For multi-environment builds read an env var: `site: process.env.SITE_URL ?? 'https://www.example.com'`, and set SITE_URL in the platform's environment-variable settings (production = canonical domain, preview = preview URL). Build canonicals with `new URL(Astro.url.pathname, Astro.site).href`.

**Cloudflare / Vercel.** Cloudflare Pages: set SITE_URL under Settings > Environment Variables (Production). Vercel: set SITE_URL under Project Settings > Environment Variables (Production). Otherwise build-time only, no platform difference.

**How to verify.** GET / and parse <link rel="canonical"> href: assert it is absolute and its scheme+host exactly match the production origin. In CI also assert dist/sitemap-0.xml exists and every <loc> starts with the production origin, and that `grep -r 'localhost' dist/ --include='*.html' --include='*.xml'` returns nothing.

**Common mistakes.** Never updating the initial scaffold value http://localhost:4321; pointing site at the Vercel/Pages preview URL instead of the custom domain; including a trailing slash, which produces doubled slashes in generated URLs; leaving site unset entirely.

**Sources.** <https://docs.astro.build/en/reference/configuration-reference/> · <https://docs.astro.build/en/guides/integrations-guide/sitemap/>

---

### 🔴 Install the correct platform adapter when any route uses SSR

`foundations-ssr-adapter-installed` · **Critical** · stage: `build` · 🤖 automatable · check: `manual`

**What.** If output is 'server' or any route sets prerender=false, the matching adapter must be installed and configured: @astrojs/cloudflare for Cloudflare Pages/Workers, @astrojs/vercel for Vercel. Pure static sites need no adapter.

**Why it matters.** Without the right adapter, server-rendered routes throw build errors or silently fall back, producing broken pages/404s in production. The adapter also wires up redirects, image optimization, and edge/function deployment.

**Fix (Astro).**

Run `npx astro add cloudflare` or `npx astro add vercel` to add the adapter to defineConfig. On Cloudflare use `adapter: cloudflare({ platformProxy: { enabled: true } })` so local dev simulates D1/KV/R2. Ensure the adapter matches the actual deployment target.

**Cloudflare / Vercel.** Cloudflare: @astrojs/cloudflare with platformProxy for local bindings. Vercel: @astrojs/vercel auto-detects region from Vercel env.

**How to verify.** If any .astro file contains `export const prerender = false` or output is 'server', grep astro.config.* for an adapter import and confirm it matches the deploy target; the build must complete with no adapter-related errors. Then deploy and confirm SSR routes return dynamic (not stale static) content.

**Common mistakes.** Installing @astrojs/vercel but deploying to Cloudflare (or vice versa), causing runtime failures; forgetting platformProxy for Cloudflare local dev.

**Sources.** <https://docs.astro.build/en/guides/on-demand-rendering/> · <https://docs.astro.build/en/guides/deploy/cloudflare/>

---

### 🔴 Prerender all indexable pages to static HTML (output static, no needless SSR)

`foundations-static-prerender-indexable-pages` · **Critical** · stage: `build` · 🤖 automatable · check: `html_element`

**What.** Every SEO-critical route must be statically prerendered. In Astro v5 output defaults to 'static'; routes with `export const prerender = false` are server-rendered per request and excluded from the auto-generated sitemap. output: 'hybrid' was removed in v5 — use 'static' with per-route prerender=false opt-out (or 'server' with explicit prerender=true on static pages).

**Why it matters.** Static HTML is immediately available, cache-friendly at the edge, and delivers identical content to every requester including crawlers. SSR pages are not auto-listed in the sitemap and can drift from the static contract. Data needed at build time should be fetched in getStaticPaths, not by flipping a content page to SSR.

**Fix (Astro).**

Keep the default `output: 'static'` and do nothing extra for content pages. Fetch remote data at build time via getStaticPaths instead of setting prerender=false on an article/listing route. Reserve prerender=false for genuinely request-dependent routes (forms, auth, personalization). Do not use output: 'hybrid' in v5 — it throws a build error.

**Cloudflare / Vercel.** SSR routes require the matching adapter (covered separately). Pure static sites need no adapter.

**How to verify.** After build, assert dist/ contains a .html file for every content page and that no server-only route appears in /sitemap-0.xml. Pages with prerender=false will be absent from dist/.

**Common mistakes.** Setting prerender=false on a blog post just because it calls an API; using output: 'hybrid' (removed in v5).

**Sources.** <https://docs.astro.build/en/guides/on-demand-rendering/> · <https://docs.astro.build/en/guides/upgrade-to/v5/> · <https://astro.build/blog/astro-5/>

---

### 🟠 Set base only for subdirectory deployments, otherwise leave it default

`foundations-base-config-matches-deployment` · **High** · stage: `build` · 🤖 automatable · check: `http_status`

**What.** The astro `base` option must match the deployment path: set `base: '/blog'` only when the site lives at example.com/blog/, and leave it unset (default '/') for root deployments. A wrong base prefixes all asset and internal-link paths incorrectly.

**Why it matters.** A mismatched base breaks asset URLs (404s on /_astro/ files), internal navigation, and canonical URLs. Cloudflare Pages and Vercel both deploy to root by default, so base is usually unnecessary.

**Fix (Astro).**

For subdirectory deployments set `defineConfig({ base: '/blog' })` and reference internal URLs and public/ assets with the base prefix (import.meta.env.BASE_URL). For root deployments on Cloudflare Pages/Vercel, do not set base (avoid even base: '/', which can introduce double-slash issues). Note BASE_URL is also affected by trailingSlash.

**Cloudflare / Vercel.** Cloudflare Pages and Vercel deploy to root by default (no base). GitHub Pages-style subdirectory hosting requires base.

**How to verify.** Fetch the homepage and inspect <script src> / <link href> for /_astro/ assets: paths must carry the correct base prefix and return 200. Confirm <link rel=canonical> has no unexpected path prefix or double slash.

**Common mistakes.** Setting base on a root-deployed site (assets 404); forgetting base on a subdirectory deployment; forgetting to update internal hrefs after setting base.

**Sources.** <https://docs.astro.build/en/reference/configuration-reference/> · <https://github.com/withastro/astro/issues/4229>

---

### 🟠 Use lowercase, hyphen-separated, human-readable URL slugs

`foundations-clean-lowercase-slugs` · **High** · stage: `build` · 🤖 automatable · check: `body_regex`

**What.** Generated URLs should be /blog/my-post-title — lowercase, words separated by hyphens, no uppercase letters or underscores (e.g. not /blog/MyPostTitle or /blog/my_post_title).

**Why it matters.** Search engines and users prefer lowercase hyphenated URLs; case-sensitive hosts can serve mixed-case variants as duplicate content.

**Fix (Astro).**

The v5 content layer derives the entry id from the filename — name files lowercase-hyphenated. To normalize programmatically, supply a custom `generateId()` in the loader that lowercases and slugifies. The frontmatter `slug` override field does not exist in the v5 content layer; use generateId() instead. Add 301 redirects when changing existing URLs.

**Cloudflare / Vercel.** Both Cloudflare Pages and Vercel treat file paths as case-sensitive by default.

**How to verify.** `find dist -name '*[A-Z_]*' -name '*.html'` should return nothing; spot-check several sitemap URLs for lowercase/hyphen formatting.

**Common mistakes.** CMS content with camelCase filenames producing camelCase ids; underscore URLs migrated without redirects; expecting a frontmatter slug field to override the URL in v5.

**Sources.** <https://docs.astro.build/en/guides/content-collections/> · <https://fsjs.dev/build-seo-optimized-static-sites-astro/>

---

### 🟠 Enforce required SEO frontmatter via the collection Zod schema

`foundations-collection-schema-required-seo-fields` · **High** · stage: `build` · 🤖 automatable · check: `manual`

**What.** The defineCollection Zod schema (in src/content.config.ts, the v5 path) must mark title, description, and pubDate as required, ideally with sensible length bounds, and must use a loader. Missing fields should fail the build, not ship.

**Why it matters.** A missing title or description breaks that page's meta tags and OG card. Build-time schema validation catches it before deploy instead of silently publishing SEO-broken content.

**Fix (Astro).**

In src/content.config.ts:```js
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string().min(10).max(65),
    description: z.string().min(50).max(160),
    pubDate: z.coerce.date(),
    draft: z.boolean().default(false),
  }),
});
```Use z.coerce.date() since frontmatter dates are strings.

**Cloudflare / Vercel.** None — Zod validation runs at build time.

**How to verify.** Add a markdown file missing `title` and run `astro build`; it must throw a Zod validation error and fail the build. Statically, confirm title/description are not .optional() in src/content.config.ts.

**Common mistakes.** Making all fields optional; omitting length validation; using the old src/content/config.ts path; using z.date() instead of z.coerce.date(); forgetting the required v5 loader.

**Sources.** <https://docs.astro.build/en/guides/content-collections/> · <https://joost.blog/astro-seo-complete-guide/>

---

### 🟠 Custom 404 page returns a real HTTP 404 (no soft 404)

`foundations-custom-404-returns-404` · **High** · stage: `pre-launch` · 🤖 automatable · check: `http_status`

**What.** src/pages/404.astro must exist and be served with an HTTP 404 status for unknown URLs — never a 200 (soft 404) or a 302.

**Why it matters.** Soft 404s confuse Googlebot, which can index empty error pages as real content and waste crawl budget. A true 404 tells crawlers the URL does not exist.

**Fix (Astro).**

Create src/pages/404.astro. On Cloudflare Pages (static) 404.html is auto-served with a 404 status. On Cloudflare Workers add `not_found_handling` to wrangler.toml. For SSR, return the 404 response from middleware/the adapter. Verify on a real deployment.

**Cloudflare / Vercel.** Cloudflare Pages static: auto 404. Cloudflare Workers: wrangler.toml not_found_handling. Vercel: confirm on a real deploy; may need adapter-level config.

**How to verify.** `curl -s -o /dev/null -w '%{http_code}' https://example.com/this-does-not-exist-xyz123` must print 404 (not 200/302).

**Common mistakes.** Cloudflare Workers missing not_found_handling; Vercel static output showing the platform default 404 without the custom 404 status; assuming dev behavior matches production.

**Sources.** <https://docs.astro.build/en/guides/deploy/cloudflare/> · <https://github.com/withastro/astro/issues/9578>

---

### 🟠 Exclude draft entries from production pages and sitemap

`foundations-drafts-excluded-from-production` · **High** · stage: `build` · 🤖 automatable · check: `sitemap`

**What.** Content entries with draft: true must not generate HTML pages or sitemap entries in production builds — and the filter must be applied to both the listing AND the getStaticPaths route, not just the index.

**Why it matters.** Accidentally published drafts can be indexed, leak unreleased content, and waste crawl budget. Filtering only the index leaves the individual page reachable and indexable.

**Fix (Astro).**

Filter in getStaticPaths and in any listing query: `await getCollection('blog', ({ data }) => import.meta.env.PROD ? !data.draft : true)` (drafts visible in dev, hidden in prod). Define `draft: z.boolean().default(false)` in the schema.

**Cloudflare / Vercel.** import.meta.env.PROD is true in both Cloudflare Pages and Vercel build environments.

**How to verify.** Build, then confirm no known draft slug exists in dist/ (e.g. `find dist -name 'draft-*.html'` empty) and that /sitemap-0.xml contains no draft URLs.

**Common mistakes.** Filtering drafts from the index listing but still generating the individual route, leaving an unlisted-but-live page.

**Sources.** <https://docs.astro.build/en/guides/content-collections/>

---

### 🟠 Control faceted/filter parameter URLs to prevent index bloat

`foundations-faceted-nav-param-urls-managed` · **High** · stage: `pre-launch` · 👤 manual · check: `manual`

**What.** On sites with faceted navigation (filter/sort parameters), parameter combinations that create duplicate or low-value pages must be kept from being crawled/indexed — via robots.txt Disallow patterns, canonicals to the unfiltered page, or by keeping filter state out of indexable URLs (URL fragments or JS-only filtering).

**Why it matters.** Each filter combination is a unique URL; a modest catalogue times several filter dimensions can generate millions of near-duplicate URLs, exhausting crawl budget and bloating the index. Google's GSC URL Parameters tool was removed, so it cannot be relied on.

**Fix (Astro).**

In Astro SSG, implement filtering client-side and keep state in URL fragments (#color=red) or apply it via JS without changing the URL. If filter state lives in query params (?color=red), add Disallow patterns in public/robots.txt (e.g. Disallow: /*?color=) or set a canonical on every filter variant pointing to the unfiltered page.

**Cloudflare / Vercel.** None.

**How to verify.** Crawl from internal links, collect param-bearing URLs, and verify each is either Disallowed in robots.txt, carries a canonical to the base URL, or simply returns the base content with that canonical.

**Common mistakes.** Letting all query params be crawled/indexed; misapplied canonicals on filter pages; relying on the removed GSC URL Parameters tool.

**Sources.** <https://developers.google.com/search/docs/crawling-indexing/crawling-managing-faceted-navigation>

---

### 🟠 Hydrate islands with the least-eager client directive that works

`foundations-minimal-deferred-client-directives` · **High** · stage: `build` · 🤖 automatable · check: `lighthouse`

**What.** Each interactive island should use the least-eager directive that still delivers the needed UX: client:load only for truly critical first-screen interactions, client:idle for secondary above-fold UI, client:visible for below-fold, client:media for viewport-conditional. Avoid wrapping whole layout shells or static lists in hydrated framework components.

**Why it matters.** Every client:load island adds JS to the initial bundle evaluated on the main thread, raising TBT/INP and delaying LCP. client:idle (requestIdleCallback) and client:visible (IntersectionObserver) defer hydration so the first paint and Core Web Vitals improve. A content-focused Astro page should ship very little JS.

**Fix (Astro).**

Audit every `client:` directive and downgrade where possible: nav dropdown above the fold = client:load; comments at page bottom = client:visible; sidebar newsletter = client:idle; mobile-only menu = client:media="(max-width: 768px)". Wrap a list in one island rather than rendering many tiny islands.

**Cloudflare / Vercel.** None.

**How to verify.** Run Lighthouse / measure CWV (TBT/INP) and total JS: `find dist/_astro -name '*.js' | xargs wc -c | tail -1` — a content page should ship well under ~20 KB JS. In DevTools Coverage, unused JS on initial load should be low. Justify each `client:load` occurrence.

**Common mistakes.** Defaulting to client:load everywhere; mapping a list into many small islands; hydrating a framework component that has no interactivity.

**Sources.** <https://docs.astro.build/en/concepts/islands/> · <https://dev.to/lovestaco/astros-client-directives-when-and-where-to-use-each-165g>

---

### 🟠 Keep SEO-critical content out of client:only and server:defer islands

`foundations-no-seo-content-in-unrendered-islands` · **High** · stage: `build` · 🤖 automatable · check: `body_regex`

**What.** H1s, primary article/body text, and important metadata must live in server-rendered HTML, not inside client:only components (which emit zero server HTML) or server:defer Server Islands (whose deferred content is fetched client-side, leaving only the fallback slot server-rendered). client:load/idle/visible components DO include static HTML and are safe for content.

**Why it matters.** Googlebot may not execute the client-side JS that hydrates client:only or fetches server:defer content, so that content can go unindexed. Only what is present in the raw initial HTML is guaranteed to be crawled.

**Fix (Astro).**

Reserve client:only and server:defer for personalized/non-critical UI (avatars, cart counts, recommendations). Keep all crawlable content in the static shell. For Server Islands, ensure the fallback slot contains real content. Audit usages: `grep -r 'client:only\|server:defer' src/`.

**Cloudflare / Vercel.** client:only and Server Islands need an SSR adapter on both platforms; the static shell is served from the edge while island content is fetched from the origin function.

**How to verify.** `curl -s https://example.com/blog/sample-post | grep -o '<h1[^>]*>.*</h1>'` should return the post H1; load a page with JS disabled and confirm primary content is still readable.

**Common mistakes.** Wrapping a whole section (headings + body) in a client:only React component when only one button needed hydration; putting the article H1/body inside a server:defer island for personalization.

**Sources.** <https://docs.astro.build/en/concepts/islands/> · <https://docs.astro.build/en/guides/server-islands/>

---

### 🟠 Emit all head metadata from one BaseHead component with no duplicate tags

`foundations-single-basehead-no-duplicate-tags` · **High** · stage: `build` · 🤖 automatable · check: `html_head`

**What.** All head metadata (title, description, canonical, OG, Twitter, icons, charset, viewport, robots) must come from a single reusable component (e.g. src/components/BaseHead.astro) included once in every layout, and each tag must appear exactly once in the rendered <head> — one <title>, one meta description, one canonical, one of each OG/Twitter tag.

**Why it matters.** A single source of truth guarantees every page has the complete, consistent set of head tags. Astro appends page-level <head> content to layout <head> content rather than replacing it, so defining a tag in both a page and BaseHead produces duplicates; Google uses the first canonical it sees and social scrapers get confused by duplicate OG tags.

**Fix (Astro).**

Build src/components/BaseHead.astro with a typed props interface (title, description, ogImage, ogType, robots, canonicalOverride) and import it in every layout. Pass page/post-specific values as props — never re-declare the same meta tags in a page-level <head> block. Avoid mixing a hand-built BaseHead with a third-party SEO component that emits the same tags.

**Cloudflare / Vercel.** None — build-time concern.

**How to verify.** Static: `grep -r '<title>' src/ --include='*.astro' | grep -v 'BaseHead'` should return nothing. Runtime/built HTML: assert each of <title>, meta[name=description], link[rel=canonical], og:title, twitter:card occurs exactly once per page (count > 1 = fail).

**Common mistakes.** A page bypassing BaseHead via a different layout that also emits <title>; meta description in both BaseHead and a page <head>; astro-seo plus a hand-built BaseHead both rendering the same tags.

**Sources.** <https://eastondev.com/blog/en/posts/dev/20251202-astro-seo-complete-guide/> · <https://joost.blog/astro-seo-complete-guide/> · <https://github.com/jonasmerlin/astro-seo>

---

### 🟠 Enforce one trailing-slash form with a 301 redirect at the platform

`foundations-trailing-slash-enforced` · **High** · stage: `pre-launch` · 🤖 automatable · check: `redirect`

**What.** Pick one trailing-slash convention and enforce it with a server-side redirect: with trailingSlash 'never', /page/ must 301 to /page; with 'always', /page must 301 to /page/. Both forms must never serve 200 simultaneously. Astro's trailingSlash config controls route matching/build output only — it does NOT emit HTTP redirects.

**Why it matters.** /page and /page/ are distinct URLs to Google; serving both is duplicate content and splits link equity.

**Fix (Astro).**

Set trailingSlash in astro.config.mjs, then enforce the matching redirect at the platform. Cloudflare Pages: add `_redirects` entries (or a Redirect Rule). Vercel: set the `trailingSlash` key in vercel.json. Make the platform setting consistent with Astro's config to avoid conflicting redirects.

**Cloudflare / Vercel.** Cloudflare Pages needs explicit _redirects. Vercel uses the trailingSlash key in vercel.json. Both can conflict with Astro config — test on a real deploy.

**How to verify.** GET the wrong form (e.g. /any-page/ when config is 'never') and assert status 301 with Location pointing to the canonical form; run the reverse test for 'always'.

**Common mistakes.** Setting trailingSlash in Astro but nowhere at the platform; platform config conflicting with astro.config; Cloudflare emitting 308 instead of 301.

**Sources.** <https://realmorrisliu.com/thoughts/fixing-astro-seo-cloudflare-trailing-slash/> · <https://mirzapandzo.com/astro-vercel-trailingslash-and-redirects> · <https://developers.cloudflare.com/pages/configuration/serving-pages/>

---

### 🟡 Consolidate multiple schemas into one @graph and use JSON-LD only

`foundations-jsonld-single-graph-no-mixed-formats` · **Medium** · stage: `build` · 🤖 automatable · check: `json_ld`

**What.** When a page needs several schema types (e.g. Article + BreadcrumbList + WebPage), combine them in a single ld+json block using a top-level @graph array with @id cross-references, rather than many separate script blocks. Use JSON-LD exclusively — do not also describe the same entity in Microdata or RDFa.

**Why it matters.** @graph lets entities reference each other via @id (the pattern major SEO frameworks use) and keeps @context declared once. Multiple separate blocks are valid but weaker; describing the same entity in both JSON-LD and Microdata/RDFa sends conflicting signals and adds maintenance overhead (Google treats the three formats as equally valid but duplication is the real risk).

**Fix (Astro).**

Use a SchemaGraph.astro component that emits `{ '@context': 'https://schema.org', '@graph': [...schemas] }`, giving each entity an @id like `${canonicalUrl}#article` / `#breadcrumb`. Remove leftover itemscope/itemprop/typeof/RDFa attributes from migrated themes once JSON-LD is in place.

**Cloudflare / Vercel.** None.

**How to verify.** Per page, count `script[type='application/ld+json']` blocks; if >1, recommend @graph consolidation, and when @graph is used assert it is a non-empty array. Grep rendered HTML for `itemscope`, `itemprop`, `typeof="schema:`, `property="schema:`, `vocab="https://schema.org"` and flag any entity described in both JSON-LD and Microdata/RDFa.

**Common mistakes.** Each component emitting its own ld+json block; repeating @context inside @graph; adding JSON-LD without removing original Microdata attributes from a purchased theme.

**Sources.** <https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data> · <https://developer.yoast.com/features/schema/functional-specification/>

---

### 🟡 Prevent layout shift when using View Transitions (ClientRouter)

`foundations-view-transitions-no-cls` · **Medium** · stage: `post-launch` · 👤 manual · check: `manual`

**What.** If using Astro's <ClientRouter /> (the v5 rename of <ViewTransitions />), page navigations must not cause layout shifts. Shared elements need matching transition:name values and matching computed dimensions across pages, since post-navigation shifts count toward CLS.

**Why it matters.** View Transitions animate between source and target elements; mismatched sizes/positions produce visible jumps that hurt UX and CLS.

**Fix (Astro).**

Add <ClientRouter /> to the layout <head>. Tag shared elements with the same `transition:name` on both pages and give them identical width/height. Test a baseline with `<ClientRouter fallback="none">`. Use the current <ClientRouter /> name (the <ViewTransitions /> alias still works).

**Cloudflare / Vercel.** None — browser feature. Cross-document transitions are native in Chrome/Edge 126+; Firefox 144 and Safari 18.2+ support same-document transitions (cross-document support is partial/in progress).

**How to verify.** Navigate between pages with the DevTools Performance panel recording and look for Layout Shift entries during the transition; CLS should stay < 0.1 across navigation events.

**Common mistakes.** Tagging hero images with transition:name but not matching width/height across pages; assuming post-navigation shifts do not count toward CLS; using the deprecated <ViewTransitions /> name.

**Sources.** <https://docs.astro.build/en/guides/view-transitions/>

---

## Crawlability & Indexation

Whether search engines can find, fetch, and index your pages: robots.txt, sitemaps, noindex hygiene, and content/links that exist in the server-rendered HTML.

### 🔴 404 pages return HTTP 404/410, not a soft 404

`crawlability-404-real-status` · **Critical** · stage: `post-launch` · 🤖 automatable · check: `http_status`

**What.** Requests to non-existent URLs must return HTTP 404 (or 410 for permanently removed pages), not HTTP 200 with not-found content. Empty search/filter result pages must not present as thin 200 pages.

**Why it matters.** Soft 404s waste crawl budget (Googlebot re-fetches them as valid pages), pollute the index with thin pages, and are flagged as errors in Search Console.

**Fix (Astro).**

Create `src/pages/404.astro`. In static output Astro emits a `404.html` served with a true 404 by both platforms. In SSR output you must set `Astro.response.status = 404` in the frontmatter, or it returns 200.

**Cloudflare / Vercel.** Cloudflare Pages SSR/hybrid: do NOT add `export const prerender = true` to 404.astro — it triggers Cloudflare error 1042 (Astro GH #13932, open as of 2025). Vercel SSR has had a 404-status regression (GH #14877) — verify on your adapter version.

**How to verify.** curl -sI https://example.com/this-does-not-exist-xyz123 -> assert HTTP 404 (or 410). Repeat for several random paths and a known empty-results URL.

**Common mistakes.** Catch-all routes returning 200; zero-result search pages returning 200; SSR 404.astro missing the explicit status; old pages redirecting to the homepage (a soft 404).

**Sources.** <https://developers.google.com/crawling/docs/crawl-budget> · <https://github.com/withastro/astro/issues/13932> · <https://vercel.com/kb/guide/custom-404-page>

---

### 🔴 Structured data marks up only content visible on the same page

`crawlability-jsonld-matches-visible-content` · **Critical** · stage: `pre-launch` · 🤖 automatable · check: `json_ld`

**What.** Every JSON-LD field must correspond to content genuinely visible to a human on the same page, and the @type must match the page's primary content. Do not mark up hidden, modal, off-page, or JS-lazy-loaded content. AggregateRating may only appear when the rating and representative reviews are visible (ratingValue 1.0-5.0; ratingCount matching the visible count).

**Why it matters.** Google's policies prohibit marking up hidden or mismatched content; violations trigger a structured-data manual action that suppresses all rich results for the property.

**Fix (Astro).**

Drive schema values from the same frontmatter/API data that renders the visible page. Conditionally include AggregateRating only when `reviews.length > 0` and compute ratingValue from the rendered reviews. Add a build-time check that key fields (e.g. Article.headline) appear in the rendered text/`<h1>`.

**Cloudflare / Vercel.** For Astro SSR on Cloudflare/Vercel, ensure server-rendered HTML matches the data used to build the JSON-LD.

**How to verify.** For Article: assert ld+json `headline` matches `<h1>` after normalization. For Product: assert `offers.price` matches the visible price. For AggregateRating: assert ratingValue 1.0-5.0, integer ratingCount, and at least one visible review element on the page.

**Common mistakes.** AggregateRating with no visible reviews; Article schema on a hub/nav page; `ratingValue: '4.8/5'` (must be `'4.8'`); schema for content injected only by client-side JS.

**Sources.** <https://developers.google.com/search/docs/appearance/structured-data/sd-policies> · <https://developers.google.com/search/docs/appearance/structured-data/review-snippet>

---

### 🔴 Pages with structured data are crawlable and indexable

`crawlability-jsonld-pages-crawlable` · **Critical** · stage: `pre-launch` · 🤖 automatable · check: `json_ld`

**What.** Every page carrying JSON-LD must be crawlable (not Disallowed in robots.txt) and indexable (no noindex meta tag or X-Robots-Tag). Blocked or noindexed pages are ineligible for rich results regardless of markup quality.

**Why it matters.** Google's structured data policies explicitly state pages with restricted Googlebot access cannot be served rich results.

**Fix (Astro).**

Ensure robots.txt does not Disallow key paths (/blog/, /products/) and that those pages set no noindex. For SSR (prerender=false) pages, confirm they do not inherit a stale default noindex from the layout.

**Cloudflare / Vercel.** Audit Cloudflare Pages `_headers` and Vercel `vercel.json` headers for X-Robots-Tag rules affecting these paths.

**How to verify.** For each URL with ld+json: test the path against robots.txt rules (no Disallow match) and GET it asserting no `noindex` in `meta[name=robots]` or the `X-Robots-Tag` header. Confirm via the Rich Results Test (no 'Page could not be fetched').

**Common mistakes.** Staging robots.txt deployed to production blocking the path; SSR pages inheriting a default noindex.

**Sources.** <https://developers.google.com/search/docs/appearance/structured-data/sd-policies>

---

### 🔴 No production page carries an accidental noindex directive

`crawlability-no-accidental-noindex` · **Critical** · stage: `pre-launch` · 🤖 automatable · check: `html_head`

**What.** No page intended to be indexed may contain `<meta name="robots" content="noindex">` / `<meta name="googlebot" content="noindex">`, nor an `X-Robots-Tag: noindex` response header. This is the #1 cause of 'why is my site not in Google' at launch.

**Why it matters.** A stray noindex from dev/staging carried into production removes pages from the index entirely within days, and is invisible to standard uptime monitoring.

**Fix (Astro).**

Audit your base layout for conditional noindex logic. Gate on `import.meta.env.PROD` and never default to noindex: `const robots = import.meta.env.PROD ? undefined : 'noindex,nofollow'`. Only render the tag for genuinely restricted pages. Ensure the production deploy is a true production build (PROD true).

**Cloudflare / Vercel.** Cloudflare Pages `_headers` and Vercel `vercel.json` headers can set `X-Robots-Tag` globally — audit those files for accidental noindex rules.

**How to verify.** GET every intended-to-be-indexed page -> parse <head> for `meta[name=robots]` / `meta[name=googlebot]` and assert content does not contain `noindex`; also assert the `X-Robots-Tag` response header has no `noindex`.

**Common mistakes.** A layout with `noindex={isDev || isPreview}` that evaluates true in prod; a CMS/template field left at noindex from a migration; a per-page default never overridden.

**Sources.** <https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag> · <https://developers.google.com/search/docs/crawling-indexing/block-indexing>

---

### 🔴 Production robots.txt must not block crawling of the site

`crawlability-no-disallow-all-production` · **Critical** · stage: `pre-launch` · 🤖 automatable · check: `robots`

**What.** The production robots.txt must not contain a catch-all `Disallow: /` under `User-agent: *` (or `User-agent: Googlebot`), nor any rule that blocks the main site content. robots.txt must also be reachable at /robots.txt with HTTP 200 and Content-Type text/plain.

**Why it matters.** A staging robots.txt copied to production is the most common catastrophic launch bug: a single `Disallow: /` silently deindexes the entire site within days, and is invisible to uptime monitors. A 5xx on robots.txt makes Googlebot fall back to its last cached version.

**Fix (Astro).**

Prefer a static `public/robots.txt`. For environment-specific rules, generate it from `src/pages/robots.txt.ts` (`export const GET`) gated on `import.meta.env.PROD` (Vite replaces it at build time) and mark `export const prerender = true` for SSR/hybrid. Add a post-deploy CI assertion: `curl -s https://yourdomain.com/robots.txt | grep -i 'disallow: /'` must return nothing.

**Cloudflare / Vercel.** Neither Cloudflare Pages nor Vercel injects a default robots.txt; the file is entirely owned by your project and served from the build output root.

**How to verify.** GET /robots.txt -> assert HTTP 200 and Content-Type text/plain; parse all User-agent groups and assert no bare `Disallow: /` (or `/*`) applies to `*` or any Googlebot agent.

**Common mistakes.** Copying a staging/preview robots.txt to production; a CI pipeline that does not differentiate environments; placing robots.txt in src/ instead of public/.

**Sources.** <https://searchengineland.com/robots-txt-seo-453779> · <https://www.searchviu.com/en/robots-txt-staging-environment/> · <https://docs.astro.build/en/guides/integrations-guide/sitemap/>

---

### 🔴 sitemap-index.xml is present, returns 200, and uses absolute HTTPS URLs

`crawlability-sitemap-present-and-served` · **Critical** · stage: `pre-launch` · 🤖 automatable · check: `sitemap`

**What.** @astrojs/sitemap must be installed and registered, and the generated sitemap-index.xml must be served at the site root with HTTP 200, an XML Content-Type, and a `<sitemapindex>` root. Every `<loc>` in the child sitemaps must be an absolute `https://` URL on the canonical hostname.

**Why it matters.** A missing/404 sitemap or one with relative or wrong-origin URLs is one of the most common crawlability failures on freshly launched sites; without it Google relies solely on link discovery and may index the wrong origin.

**Fix (Astro).**

`npx astro add sitemap`, then set `site: 'https://www.example.com'` in astro.config.mjs (required — the integration uses it as the base for all `<loc>` and throws without it). The sitemap is generated only at build, never by `astro dev`. For SSR/hybrid ensure the sitemap files land in the prerendered (static) portion of the build.

**Cloudflare / Vercel.** Both Cloudflare Pages and Vercel serve the static XML from the build root with no extra config.

**How to verify.** GET /sitemap-index.xml -> assert 200, Content-Type contains `xml`, body contains `<sitemapindex`. GET each child /sitemap-N.xml -> assert every `<loc>` starts with the canonical `https://` origin and none start with `/` or `http://`.

**Common mistakes.** Installing the package but not adding `sitemap()` to integrations; omitting `site:` or pointing it at localhost/staging; checking only in dev; assuming SSR auto-generates sitemap entries.

**Sources.** <https://docs.astro.build/en/guides/integrations-guide/sitemap/> · <https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap>

---

### 🟠 Search Console property is verified and indexation is monitored

`crawlability-gsc-verified-and-monitored` · **High** · stage: `post-launch` · 🤖 automatable · check: `external_tool`

**What.** The production domain must be verified in Google Search Console (Domain property preferred), and the Pages/Coverage report must show no significant unintended exclusions ('Crawled - currently not indexed', 'Discovered - currently not indexed', 'Blocked by robots.txt') for pages you want to rank.

**Why it matters.** GSC is the primary feedback loop for indexation, coverage errors, and crawl-budget pressure — failures here are invisible to plain HTTP checks. High 'Discovered - not indexed' volume signals crawl-budget or quality problems.

**Fix (Astro).**

Verify via a DNS TXT record (easiest on Cloudflare/Vercel) or by placing the HTML verification file in `public/`. Then review the Pages report weekly for the first month and via the URL Inspection API for key pages.

**Cloudflare / Vercel.** DNS TXT verification is simplest when DNS is managed in Cloudflare or Vercel.

**How to verify.** GSC URL Inspection API (`searchconsole.urlInspection.index.inspect`) on a sample of key pages -> assert indexingState INDEXING_ALLOWED and crawlState CRAWLED; review the Pages report's Excluded buckets for important URLs.

**Common mistakes.** Verifying only a URL-prefix property (misses http/https/www variants); ignoring GSC for months; treating all exclusions as harmless.

**Sources.** <https://support.google.com/webmasters/answer/7451001> · <https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap>

---

### 🟠 No broken internal links and no orphaned indexable pages

`crawlability-no-broken-or-orphan-pages` · **High** · stage: `pre-launch` · 🤖 automatable · check: `http_status`

**What.** No internal `<a href>` may point to a 4xx/5xx URL, and every indexable page must be reachable from at least one internal anchor link (not just the XML sitemap).

**Why it matters.** Broken links waste crawl budget and signal poor quality; orphan pages (sitemap-only, no internal links) are crawled rarely, lack hierarchy context, and rank poorly because Google discovers pages primarily through links.

**Fix (Astro).**

Run a post-build/live crawl (e.g. `astro-broken-link-checker`, Screaming Frog) — note `astro check` validates TypeScript, not link targets. Ensure every content-collection entry generated by `getStaticPaths` is linked from an index/archive/category page built via `getCollection`.

**How to verify.** Crawl from the homepage following only `<a href>` links: collect all discovered URLs, GET each and assert HTTP 200; then diff the sitemap URL set against the crawled set and flag any sitemap URL not reachable by link.

**Common mistakes.** Markdown links to deleted pages; renamed slugs without redirects; hardcoded localhost/staging links; customPages entries with no internal links.

**Sources.** <https://developers.google.com/crawling/docs/crawl-budget>

---

### 🟠 noindex pages are crawlable but excluded from the sitemap

`crawlability-noindex-not-disallowed-and-not-in-sitemap` · **High** · stage: `pre-launch` · 🤖 automatable · check: `sitemap`

**What.** Pages you want deindexed must use noindex WITHOUT a robots.txt Disallow (the crawler must fetch the page to see the directive), and they must NOT appear in the XML sitemap. Conversely, sitemap entries must point only to indexable pages.

**Why it matters.** A page blocked by robots.txt can never have its noindex read, so it can persist in the index indefinitely. Listing a noindex page in the sitemap sends contradictory signals, wastes crawl budget, and surfaces GSC data-quality errors.

**Fix (Astro).**

Choose one method per page: noindex (no Disallow) for removal from results; Disallow only for pages you never want crawled. Keep a shared `NOINDEX_PATTERNS` constant referenced by both the layout's noindex logic and the sitemap `filter()`: `sitemap({ filter: (page) => !NOINDEX_PATTERNS.some(p => page.includes(p)) })`.

**How to verify.** For each noindex URL: assert it is NOT disallowed by robots.txt. For each `<loc>` in the sitemap: GET it and assert no `noindex` meta tag or X-Robots-Tag header.

**Common mistakes.** Combining Disallow + noindex thinking they 'double block'; adding noindex in a template but forgetting the sitemap filter.

**Sources.** <https://developers.google.com/search/docs/crawling-indexing/block-indexing> · <https://docs.astro.build/en/guides/integrations-guide/sitemap/>

---

### 🟠 Preview/staging deployments are blocked from indexing

`crawlability-preview-deploys-noindexed` · **High** · stage: `pre-launch` · 🤖 automatable · check: `http_header`

**What.** Preview and staging environments must not be indexable. Both platforms auto-noindex some preview surfaces but leave notable gaps that must be closed manually.

**Why it matters.** Indexed preview deployments create duplicate content that dilutes signals and can cause Google to pick the wrong canonical.

**Fix (Astro).**

Vercel: auto-sets `X-Robots-Tag: noindex` on non-production *.vercel.app previews, but NOT on a custom domain assigned to a non-production branch — add it via vercel.json headers. Cloudflare Pages: auto-noindexes branch preview hash URLs but NOT the production `project.pages.dev` subdomain — add `https://*.pages.dev/* X-Robots-Tag: noindex` to `_headers`.

**Cloudflare / Vercel.** Vercel: gap is custom domains on non-prod branches. Cloudflare Pages: gap is the production project.pages.dev subdomain — must be set in _headers.

**How to verify.** curl -I against each preview URL (and the *.pages.dev / preview custom domain) -> assert the `X-Robots-Tag` header contains `noindex`.

**Common mistakes.** Assuming Vercel auto-noindex covers custom domains on preview branches; assuming the Cloudflare production pages.dev subdomain is auto-noindexed.

**Sources.** <https://vercel.com/kb/guide/are-vercel-preview-deployment-indexed-by-search-engines> · <https://developers.cloudflare.com/pages/configuration/preview-deployments/>

---

### 🟠 robots.txt does not block CSS/JS assets and is syntactically valid

`crawlability-robots-allows-css-js` · **High** · stage: `pre-launch` · 🤖 automatable · check: `robots`

**What.** No Disallow rule may block paths serving CSS or JavaScript Googlebot needs to render pages (Astro emits hashed assets to `/_astro/`). The file must also be valid per the Robots Exclusion Protocol (UTF-8, no BOM, each directive on its own line, User-agent before Allow/Disallow).

**Why it matters.** Googlebot renders with headless Chromium; blocking CSS/JS forces blind rendering that suppresses rankings and can break layout. Malformed robots.txt causes crawlers to mis-parse or ignore rules entirely.

**Fix (Astro).**

Ensure `public/robots.txt` has no `Disallow: /_astro/`, `/assets/`, `/css/`, or `/js/`. Validate with a parser such as the `robots-parser` npm package in a build/CI test, or GSC Settings > robots.txt.

**How to verify.** GET /robots.txt -> resolve all Disallow rules against known asset dirs (/_astro/, /assets/, /js/, /css/) and flag any match -> feed the file to a robots.txt parser and assert 0 parse errors.

**Common mistakes.** Blanket-blocking `/_astro/` to 'hide' design; copy-pasting a CMS robots.txt with legacy paths; missing blank line between agent groups; CRLF line endings.

**Sources.** <https://searchengineland.com/robots-txt-seo-453779> · <https://www.conductor.com/academy/robotstxt/>

---

### 🟠 robots.txt references the sitemap with an absolute URL

`crawlability-robots-references-sitemap` · **High** · stage: `pre-launch` · 🤖 automatable · check: `robots`

**What.** robots.txt must contain a `Sitemap:` directive pointing to the absolute URL of the sitemap index, e.g. `Sitemap: https://example.com/sitemap-index.xml` (not the relative path and not sitemap-0.xml).

**Why it matters.** The `Sitemap:` directive is the lightest-weight way for all crawlers (not just Googlebot) to discover the sitemap without manual submission. The robots spec requires an absolute URL.

**Fix (Astro).**

Add `Sitemap: https://yoursite.com/sitemap-index.xml` to `public/robots.txt`, or in a `src/pages/robots.txt.ts` endpoint return `Sitemap: ${new URL('sitemap-index.xml', site).href}`. The URL must match `site` in astro.config.mjs.

**How to verify.** GET /robots.txt -> grep `^Sitemap:` -> assert value is an absolute https:// URL ending in sitemap-index.xml -> GET that URL -> assert HTTP 200.

**Common mistakes.** Relative path; pointing to sitemap-0.xml instead of the index; omitting the directive.

**Sources.** <https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap> · <https://docs.astro.build/en/guides/integrations-guide/sitemap/>

---

### 🟠 Sitemap lists only canonical, indexable, live URLs

`crawlability-sitemap-only-indexable-canonical-urls` · **High** · stage: `build` · 🤖 automatable · check: `sitemap`

**What.** Every publicly indexable route must appear in the sitemap, and only those: no draft/admin pages, no redirects, no 4xx/5xx, no parameter/facet/tag-archive duplicates. Draft posts should never generate routes in the first place.

**Why it matters.** Omitting published pages causes crawl gaps; including drafts, redirects, or non-canonical URLs wastes crawl budget, weakens the sitemap's (weak) canonical signal, and triggers GSC coverage errors.

**Fix (Astro).**

Filter routes at generation: `getCollection('blog', ({data}) => !data.draft)` so drafts never become pages. Exclude utility paths with the sitemap `filter()` option (e.g. exclude `/admin/`, `/tags/`, URLs with `?`); use `serialize()` returning undefined for fine-grained exclusion. Remember content-collection entries do not auto-create routes.

**How to verify.** Count `<url>` entries vs `find dist -name '*.html' | wc -l` (minus known non-indexable pages); diff should be zero or explained. Then GET each `<loc>` and assert HTTP 200 (no 3xx/4xx) and no noindex.

**Common mistakes.** Including tag/author/paginated pages that are noindexed; including parameter URLs from filters; not removing deleted pages from the sitemap.

**Sources.** <https://docs.astro.build/en/guides/integrations-guide/sitemap/> · <https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap>

---

### 🟠 Sitemap files stay within size limits and the index URL is submitted

`crawlability-sitemap-size-and-index-submission` · **High** · stage: `post-launch` · 🤖 automatable · check: `sitemap`

**What.** Each sitemap file must stay under 50,000 URLs and 50 MB uncompressed; larger sites use a sitemap index of numbered child files. The sitemap-index.xml (not sitemap-0.xml) is what gets submitted to Google Search Console and Bing Webmaster Tools.

**Why it matters.** Google ignores entries beyond the limits, leaving URLs undiscovered. Submitting sitemap-0.xml on a large site submits only the first batch; submitting the index covers every child sitemap.

**Fix (Astro).**

@astrojs/sitemap defaults `entryLimit` to 45,000 and auto-splits into sitemap-index.xml + sitemap-0/1/2.xml. Tune with `sitemap({ entryLimit: 10000 })` if needed. Submit /sitemap-index.xml in GSC and import the GSC property (or submit the index URL) in Bing Webmaster Tools.

**How to verify.** Parse sitemap-index.xml -> for each child GET it -> assert `<url>` count <= 50000 and byte size <= 52428800. Via GSC Sitemaps API assert a submitted sitemap with errors:0 and isPending:false.

**Common mistakes.** Submitting sitemap-0.xml on a large site; submitting before DNS propagates; not re-submitting after a domain migration; skipping Bing.

**Sources.** <https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap> · <https://docs.astro.build/en/guides/integrations-guide/sitemap/> · <https://support.google.com/webmasters/answer/7451001>

---

### 🟠 Indexable SSR (prerender=false) routes are added to the sitemap manually

`crawlability-sitemap-ssr-routes-included` · **High** · stage: `build` · 👤 manual · check: `manual`

**What.** @astrojs/sitemap auto-discovers only statically built routes. On-demand rendered routes (prerender=false / output:'server') that should be indexed must be added via the `customPages` option or a custom sitemap endpoint.

**Why it matters.** Indexable SSR content (e.g. DB-driven product pages) never appears in the auto-generated sitemap, so Googlebot must rely on internal links alone, slowing indexation.

**Fix (Astro).**

Add known SSR URLs via `sitemap({ customPages: ['https://example.com/product/123', ...] })` (note: customPages accepts only a static string array — passing an async function throws a build error). For DB-driven sites, build `src/pages/sitemap.xml.ts` that queries at build/request time, or set `prerender = true` on the pages so the integration discovers them.

**Cloudflare / Vercel.** Applies identically with the @astrojs/cloudflare and @astrojs/vercel SSR adapters.

**How to verify.** List all routes with `prerender = false` that should be indexed and confirm each appears in /sitemap-0.xml (via customPages or a custom endpoint).

**Common mistakes.** Assuming the integration includes SSR routes because they work in the browser; passing a function to customPages; generating a build-time sitemap that omits dynamic DB content.

**Sources.** <https://docs.astro.build/en/guides/integrations-guide/sitemap/> · <https://github.com/withastro/astro/issues/12437>

---

### 🟠 Sitemap URLs match the site's trailing-slash convention

`crawlability-sitemap-trailingslash-consistency` · **High** · stage: `pre-launch` · 🤖 automatable · check: `redirect`

**What.** Every sitemap URL must use the same trailing-slash convention as the live, canonicalized site, and requesting each `<loc>` must not redirect. Align `site`, `trailingSlash`, and `build.format` in astro.config.mjs.

**Why it matters.** Google treats `/page/` and `/page` as distinct URLs. If the sitemap URL redirects to the canonical form, the sitemap entry becomes a non-canonical/soft mismatch that weakens the canonical signal and wastes crawl budget.

**Fix (Astro).**

Set `trailingSlash: 'never'` or `'always'` and a matching `build.format` ('file' = no slash, 'directory' = slash). @astrojs/sitemap inherits trailingSlash. On Cloudflare Pages, add explicit `_redirects` to enforce trailing-slash at the HTTP level (config alone can cause unexpected 308s). On Vercel, set `trailingSlash` in `vercel.json`.

**Cloudflare / Vercel.** Cloudflare Pages needs explicit `_redirects` entries; Vercel honors `trailingSlash` in vercel.json at the edge. Both can override/conflict with Astro's config.

**How to verify.** Parse all `<loc>` -> assert consistent trailing slash per config -> GET each and assert the final URL after redirects equals the sitemap URL exactly (no 3xx).

**Common mistakes.** Mixing `build.format: 'directory'` with `trailingSlash: 'never'`; relying on Astro config alone on Cloudflare Pages without _redirects.

**Sources.** <https://realmorrisliu.com/thoughts/fixing-astro-seo-cloudflare-trailing-slash/> · <https://mirzapandzo.com/astro-vercel-trailingslash-and-redirects> · <https://docs.astro.build/en/reference/configuration-reference/>

---

### 🟡 robots.txt AI crawler policy is intentional (training vs search bots)

`crawlability-ai-crawler-policy-intentional` · **Medium** · stage: `pre-launch` · 👤 manual · check: `manual`

**What.** robots.txt should make a deliberate, documented choice for AI training crawlers (GPTBot, ClaudeBot, Google-Extended, Bytespider) vs AI search/retrieval bots (OAI-SearchBot, Claude-SearchBot, PerplexityBot), which are distinct bots with different purposes.

**Why it matters.** Blocking GPTBot stops training-data collection but does NOT remove the site from ChatGPT search answers (OAI-SearchBot does that). Conflating them causes either unwanted training use or invisible AI-answer presence; AI search drives meaningful referral traffic by 2026.

**Fix (Astro).**

In `public/robots.txt`, add explicit rules per business intent, e.g. allow retrieval bots and block training bots, while keeping `User-agent: *` / `Allow: /` so Googlebot is never blocked. Include the `Sitemap:` directive. The `astro-ai-robots-txt` package can help generate these rules.

**How to verify.** Read /robots.txt and confirm at least one AI crawler (GPTBot/ClaudeBot/Google-Extended) has an explicit Allow/Disallow matching the documented decision, and that the wildcard rule does not block all bots.

**Common mistakes.** An accidental `User-agent: * / Disallow: /` from dev that also blocks Google; blocking GPTBot expecting it to remove the site from ChatGPT search.

**Sources.** <https://www.mersel.ai/blog/how-to-block-or-allow-ai-bots-on-your-website> · <https://delucis.github.io/astro-ai-robots-txt/>

---

### 🟡 Content images use <img>/astro:assets, not CSS background-image

`crawlability-content-images-use-img` · **Medium** · stage: `build` · 👤 manual · check: `manual`

**What.** Information-carrying images (product photos, article heroes, team photos) must be rendered as HTML `<img>` (ideally via astro:assets), not CSS `background-image`, which Google does not index for Google Images. Purely decorative backgrounds (gradients, textures) may stay in CSS.

**Why it matters.** Background images are not indexed for Google Images and cannot carry alt text. Using `<Image>` also enables alt text, srcset/format optimization, and CLS prevention.

**Fix (Astro).**

Replace CSS background-image heroes with `<Image src={heroImg} alt='...' />` plus `object-fit: cover` for the same visual effect.

**How to verify.** Audit rendered CSS for `background-image: url()` declarations and cross-reference against the content-image inventory; content-carrying images in background-image are violations (human judgment required for content-vs-decorative).

**Common mistakes.** Hero/feature sections built with `div style='background-image:url(...)'`, blocking Google Images indexing.

**Sources.** <https://developers.google.com/search/docs/appearance/google-images>

---

### 🟡 Indexable content and links are in the server-rendered HTML, not JS-only

`crawlability-content-in-initial-html` · **Medium** · stage: `build` · 🤖 automatable · check: `body_regex`

**What.** All indexable content (body text, headings, internal links, structured data) must be present in the initial HTML response, not injected only by client-side JavaScript after load.

**Why it matters.** Googlebot indexes raw HTML immediately and re-renders JS at a variable delay (hours to weeks); content available only after JS execution may be indexed late or not at all. Astro SSG delivers full HTML by default — preserve that advantage.

**Fix (Astro).**

Keep primary content in `.astro` templates. Ensure Astro Islands (client:load/visible/idle) render only supplementary UI, never the main indexable text or navigation links.

**How to verify.** GET the page and inspect the raw HTML body without executing JS -> assert critical text content and internal `<a href>` links are present in the string (e.g. disable JS in DevTools and confirm content/links remain).

**Common mistakes.** Loading blog body text via a client:load island; fetching navigation links via JavaScript (orphaning downstream pages).

**Sources.** <https://docs.astro.build/en/reference/configuration-reference/>

---

### 🟡 Image sitemap entries are present for indexable images

`crawlability-image-sitemap-entries` · **Medium** · stage: `pre-launch` · 🤖 automatable · check: `sitemap`

**What.** For sites where image search matters, the sitemap should include `<image:image>` entries (xmlns:image namespace) with `<image:loc>` for indexable images. @astrojs/sitemap declares the namespace by default but does NOT auto-populate image entries.

**Why it matters.** Image sitemaps help Google discover images (especially JS-rendered ones) and are a positive signal for Google Images traffic. Only `image:image` + `image:loc` are supported — Google removed image:caption/title/geo_location/license in May 2022.

**Fix (Astro).**

Populate image entries via the `serialize()` hook in astro.config.mjs, returning an object with an `images` array (each at minimum `{ url }` as an absolute HTTPS URL). For large sites, enumerate images per page with `getCollection()`. Ensure `site:` is set so URLs are absolute.

**How to verify.** GET /sitemap-0.xml -> assert root declares `xmlns:image='http://www.google.com/schemas/sitemap-image/1.1'` -> count `<image:image>` children (must be >0 for image-heavy sites) -> assert every `<image:loc>` is absolute HTTPS and returns 200.

**Common mistakes.** Assuming the integration auto-adds image entries (it only declares the namespace); adding deprecated image child tags; relative image:loc URLs.

**Sources.** <https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps> · <https://docs.astro.build/en/guides/integrations-guide/sitemap/>

---

### 🟡 No deprecated Google rich-result schema types in production

`crawlability-no-deprecated-rich-result-schema` · **Medium** · stage: `pre-launch` · 🤖 automatable · check: `json_ld`

**What.** Remove JSON-LD using types whose Google rich-result support was retired: HowTo, Book Actions, ClaimReview, Course Info/EmployerAggregateRating, Estimated Salary, Learning Video, Special Announcement, Vehicle Listing (June 2025), and Sitelinks Search Box/SearchAction-on-WebSite (Nov 2024). FAQPage rich results retired May 2026 — treat as informational only, not an error.

**Why it matters.** Deprecated rich-result markup generates Search Console warnings and false expectations and bloats markup. These types remain valid schema.org; the issue is the absence of SERP features, not a syntax error.

**Fix (Astro).**

Audit `dist/` for deprecated type names and maintain an allowlist of currently supported types. `schema-dts` helps but may lag Google's deprecations — treat it as a dev aid, not a complete policy check.

**How to verify.** For every ld+json block (including nested @type), assert none match the hard-deprecated list (HowTo, BookAction, ClaimReview, CourseInstance, EmployerAggregateRating, LearningResource, SpecialAnnouncement, Vehicle); flag FAQPage and SearchAction-on-WebSite as informational warnings.

**Common mistakes.** Copying an older Astro SEO template with HowTo/FAQPage; a generic schema library that still ships deprecated types.

**Sources.** <https://www.engagecoders.com/google-retires-7-structured-data-features-to-streamline-search-results/> · <https://developers.google.com/search/blog/2024/10/sitelinks-search-box>

---

### 🟡 Paginated content uses crawlable URLs, anchor links, and self-canonicals

`crawlability-pagination-crawlable-urls` · **Medium** · stage: `pre-launch` · 🤖 automatable · check: `html_element`

**What.** Each page in a paginated series must have a unique crawlable URL via path or query parameter (never a `#` fragment), standard `<a href>` links to adjacent pages, and a self-referencing canonical (page 2 canonicals to page 2, not page 1). Do not rely on rel=next/prev for Google.

**Why it matters.** Google deprecated rel=next/prev (2019) and does not crawl URLs discovered only through them — only via visible anchor links. Fragment-based pagination (`#page=2`) is never sent to the server, so those pages are invisible to crawlers.

**Fix (Astro).**

Use `getStaticPaths` with the `paginate()` helper (generates `/blog/2/`, `/blog/3/`). Render `<a href={page.url.prev}>`/`<a href={page.url.next}>` and a self-canonical: `new URL(Astro.url.pathname, Astro.site).href`. rel=next/prev may stay for Bing/accessibility but not as the only discovery path.

**How to verify.** GET page 2 of a series -> assert the URL uses a path/query segment and no `#` fragment -> assert `<link rel=canonical>` is self-referencing -> assert at least one visible `<a href>` pagination link exists.

**Common mistakes.** Canonicalizing all paginated pages to page 1; rel-only links with no anchors; JS infinite scroll or `#page=2` with no unique URLs.

**Sources.** <https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading> · <https://www.journeyfurther.com/articles/how-does-google-handle-pagination-links-in-2025>

---

### 🟡 RSS feed exists and is autodiscoverable

`crawlability-rss-feed-autodiscoverable` · **Medium** · stage: `pre-launch` · 🤖 automatable · check: `html_head`

**What.** Blog/news sites should expose /rss.xml (or /feed.xml) and include `<link rel='alternate' type='application/rss+xml' href='/rss.xml'>` in the `<head>` of every page.

**Why it matters.** RSS feeds are consumed by aggregators, Google News, and increasingly AI agents; the autodiscovery link lets browsers and crawlers find the feed without guessing the URL.

**Fix (Astro).**

Install @astrojs/rss and create `src/pages/rss.xml.ts` with `export async function GET(ctx)` returning `rss({ title, description, site: ctx.site, items })`. In Astro v5 use `p.id` (not `p.slug`) and build links from it. Add the autodiscovery `<link>` to the shared layout head.

**How to verify.** GET /rss.xml -> assert 200 and Content-Type application/rss+xml (or xml), with `<channel><title>`, `<link>`, and >=1 `<item>` having `<link>` and `<pubDate>`. Fetch the homepage HTML -> assert the `link[rel=alternate][type='application/rss+xml']` is present in `<head>`.

**Common mistakes.** Using `Astro.site` instead of `ctx.site`; using deprecated `export const get`; `p.slug` instead of `p.id` in v5; not adding the autodiscovery link to every page.

**Sources.** <https://docs.astro.build/en/recipes/rss/> · <https://joost.blog/astro-seo-complete-guide/>

---

### 🟡 Sitemap lastmod reflects real content changes (omit changefreq/priority)

`crawlability-sitemap-lastmod-accurate` · **Medium** · stage: `build` · 👤 manual · check: `manual`

**What.** `<lastmod>` should reflect when the page content actually changed, not the build timestamp. changefreq and priority are ignored by Google — omit them or leave at defaults.

**Why it matters.** Google uses lastmod to prioritize re-crawling only when it is consistently accurate; a lastmod that always equals the build date is treated as unreliable and ignored.

**Fix (Astro).**

Use the sitemap `serialize()` hook to derive lastmod from git commit date (`execSync('git log -1 --format=%cI -- <file>')`) or a frontmatter `updatedAt` field (see docs.astro.build/en/recipes/modified-time/). Never set `lastmod: new Date()` globally.

**Cloudflare / Vercel.** Git history is available in both Cloudflare Pages and Vercel build environments for the serialize() hook.

**How to verify.** GET /sitemap-0.xml -> parse `<lastmod>` for a page unchanged for weeks -> assert it does not equal today's date. Edit one post, rebuild, and confirm only its lastmod changed.

**Common mistakes.** Global `lastmod: new Date()` destroying Google's trust in the signal; believing changefreq/priority affect crawl scheduling.

**Sources.** <https://docs.astro.build/en/recipes/modified-time/> · <https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap>

---

### 🟡 Sitemap XML is UTF-8 encoded with properly escaped URLs

`crawlability-sitemap-valid-xml` · **Medium** · stage: `build` · 🤖 automatable · check: `sitemap`

**What.** Sitemap files must be UTF-8 and valid XML: `&`, `'`, `"`, `<`, `>` entity-escaped (e.g. `&` -> `&amp;`) and non-ASCII characters percent-encoded in URLs.

**Why it matters.** An invalid XML sitemap (encoding errors, un-escaped entities) is rejected by Google entirely — a single malformed `<loc>` can invalidate the whole file.

**Fix (Astro).**

@astrojs/sitemap escapes URLs from getStaticPaths automatically. When injecting URLs via `customPages` or `serialize()`, escape `&` as `&amp;` and percent-encode non-ASCII/space characters before injection.

**How to verify.** GET /sitemap-0.xml -> run through an XML parser (xmllint/DOMParser) -> assert 0 parse errors and UTF-8 charset (or absent, which defaults to UTF-8).

**Common mistakes.** Injecting raw DB URLs with `&` into customPages without escaping; URLs with unencoded spaces.

**Sources.** <https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap>

---

### 🟡 Non-HTML files use X-Robots-Tag for indexing control

`crawlability-xrobots-for-non-html` · **Medium** · stage: `pre-launch` · 🤖 automatable · check: `http_header`

**What.** For non-HTML resources (PDFs, Word docs, images) that should not be indexed, use the `X-Robots-Tag: noindex` HTTP response header — `<meta>` robots tags only work in HTML.

**Why it matters.** Meta robots tags are ignored in non-HTML files; X-Robots-Tag is the only mechanism that controls indexing for those file types (and PDFs are crawled).

**Fix (Astro).**

Cloudflare Pages: add `/docs/* \n X-Robots-Tag: noindex` to `_headers`. Vercel: add a rule under `headers` in `vercel.json`. Astro SSR: set the header in the API route/middleware response.

**Cloudflare / Vercel.** Both Cloudflare `_headers` and Vercel `vercel.json` headers support glob patterns for these files.

**How to verify.** curl -I each non-HTML URL meant to be noindexed -> assert the `X-Robots-Tag` response header contains `noindex`.

**Common mistakes.** Putting a meta noindex on the linking HTML instead of the file header; assuming PDFs aren't crawled.

**Sources.** <https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag> · <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Robots-Tag>

---

### ⚪ Large sites (10k+ pages) block crawl-budget-wasting URLs

`crawlability-large-site-crawl-budget` · **Low** · stage: `post-launch` · 👤 manual · check: `manual`

**What.** For sites with 10,000+ frequently-changing indexable pages, audit and eliminate crawl-budget waste: infinite calendar/date paths, session-ID and sort/order/ref parameters, printer-friendly variants, and low-value tag/category combinations. Block via robots.txt or consolidate via canonicals. Typical Astro blogs/portfolios do not need this.

**Why it matters.** Google's crawl-budget guidance is explicitly scoped to large/frequently-updated sites; for smaller sites crawl budget is not a practical concern (per Google's Gary Illyes).

**Fix (Astro).**

Use @astrojs/sitemap `filter()` to exclude low-value pages and robots.txt Disallow patterns for parameter-based duplicates.

**How to verify.** Crawl the site and count URLs bearing ?sort=, ?order=, ?ref=, ?session= -> assert each is robots-blocked or canonicalized to the parameter-free URL. In GSC Crawl Stats, a crawled:indexed ratio > 3:1 indicates waste.

**Common mistakes.** Applying crawl-budget work to small sites; ignoring GSC Crawl Stats; not auditing parameters from tag clouds/sorting controls.

**Sources.** <https://developers.google.com/crawling/docs/crawl-budget>

---

### ⚪ llms.txt (and optional llms-full.txt) for AI/LLM guidance

`crawlability-llms-txt-optional` · **Low** · stage: `pre-launch` · 🤖 automatable · check: `http_status`

**What.** Optionally provide a curated Markdown `/llms.txt` mapping the site's most important pages, and optionally `/llms-full.txt` with full content. Low effort, negligible downside; most useful for developer-tool/documentation sites.

**Why it matters.** Google confirmed (July 2025, Gary Illyes) it does not use llms.txt, and no major LLM provider has committed to production use as of 2026. Some AI coding assistants and developer tools do retrieve it; it has no confirmed effect on Google rankings or AI Overview citations.

**Fix (Astro).**

Create `public/llms.txt` (or `src/pages/llms.txt.ts` with `export const prerender = true`) starting with an H1, a one-line blockquote description, and a curated list of Markdown links to real pages. For llms-full.txt, render content to plain Markdown with `Content-Type: text/plain; charset=utf-8`.

**Cloudflare / Vercel.** Static file in public/ works identically on Cloudflare Pages and Vercel.

**How to verify.** GET /llms.txt -> assert 200, Content-Type text/plain, body starts with `#` and contains at least one Markdown link `[text](url)` to a real (200) page.

**Common mistakes.** Overstating SEO value; dumping all pages instead of a curated subset; serving as text/html; linking to 404/redirect URLs; making llms-full.txt excessively large (>~5 MB).

**Sources.** <https://llmstxt.org/> · <https://www.itechmanthra.com/blog/google-says-normal-seo-works-for-ranking-in-ai-overviews-and-llms-txt-wont-be-used/>

---

### ⚪ Prefetch strategy is appropriate for site size and SSR cost

`crawlability-prefetch-strategy-appropriate` · **Low** · stage: `pre-launch` · 👤 manual · check: `manual`

**What.** Avoid prefetch `strategy: 'load'` with `prefetchAll: true` on large or SSR-heavy sites — it fetches every link on page load, generating excessive requests. Prefer the more conservative `'viewport'` strategy.

**Why it matters.** Prefetch is transparent to Googlebot (it doesn't run prefetch scripts), but 'load' on a link-heavy or SSR site generates thousands of requests per page load, slowing real users and raising server costs.

**Fix (Astro).**

In astro.config: `prefetch: { prefetchAll: true, defaultStrategy: 'viewport' }`. ClientRouter sets prefetchAll: true by default — review it for large/SSR sites.

**Cloudflare / Vercel.** Vercel Serverless Functions cost per invocation — be cautious with 'load' if prefetched routes are server-rendered. Cloudflare Pages has no egress fees for static assets.

**How to verify.** Load a content-heavy page (50+ links) with DevTools Network open and count prefetch requests on load; with 'viewport' only visible-link requests should appear (far fewer than 'load').

**Common mistakes.** prefetchAll with strategy:'load' on a site with hundreds of internal links.

**Sources.** <https://docs.astro.build/en/guides/prefetch/>

---

## Metadata, Head & Social

The per-page tags that decide how pages look in search results and when shared: titles, descriptions, Open Graph, Twitter cards, favicons, charset, and language.

### 🔴 <meta charset="UTF-8"> first in <head>, within first 1024 bytes

`metadata-charset-utf8` · **Critical** · stage: `build` · 🤖 automatable · check: `html_head`

**What.** <meta charset="UTF-8"> is the first child of <head> and appears within the first 1024 bytes of the document.

**Why it matters.** HTML5 requires UTF-8 declared early; otherwise browsers guess the encoding and render mojibake on accented/CJK/emoji characters, and Google can misparse titles and descriptions.

**Fix (Astro).**

Keep Astro's default `<meta charset="UTF-8" />` as the very first child of <head> in BaseHead.astro. Do not let any integration inject elements (scripts, etc.) before it, and do not replace it with the legacy http-equiv Content-Type form.

**How to verify.** `curl -s https://example.com | head -c 1024 | grep -i 'charset'` must match, and the charset meta must be the first meta tag in <head>.

**Common mistakes.** A third-party script injected via injectElement before charset; copying a legacy `<meta http-equiv="Content-Type">` template.

**Sources.** <https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta> · <https://web.dev/learn/html/metadata>

---

### 🔴 html[lang] set to a valid BCP-47 language code

`metadata-html-lang` · **Critical** · stage: `build` · 🤖 automatable · check: `html_element`

**What.** The root <html> element carries a non-empty lang attribute with a valid BCP-47 tag matching the page's actual language (e.g. lang="en", lang="en-US", lang="is").

**Why it matters.** Google and screen readers use lang for language serving, translation suppression, and hreflang matching. Missing lang fails WCAG 3.1.1 (Level A) and breaks Google language targeting.

**Fix (Astro).**

In the root layout: `<html lang={lang ?? 'en'}>`, exposing `lang` as a prop. For multilingual sites set it from Astro's built-in i18n routing via `Astro.currentLocale`.

**How to verify.** Assert document.documentElement.getAttribute('lang') is non-empty and matches /^[a-z]{2,3}(-[A-Z]{2,3})?$/. Lighthouse accessibility audit also flags a missing/invalid lang.

**Common mistakes.** lang left empty; lang="en" on a non-English site; lang missing so the document inherits no language.

**Sources.** <https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta> · <https://www.w3.org/WAI/WCAG21/Understanding/language-of-page.html>

---

### 🔴 Valid og:image (and twitter:image) at 1200x630 with absolute HTTPS URL

`metadata-og-image` · **Critical** · stage: `pre-launch` · 🤖 automatable · check: `html_head`

**What.** Every page has <meta property="og:image"> and <meta name="twitter:image"> pointing to an absolute HTTPS URL that returns HTTP 200 with image/* content type. The image is 1200x630 px (1.91:1), JPEG or PNG (WebP acceptable as of 2025), under ~300 KB, with og:image:width=1200, og:image:height=630, and og:image:alt declared.

**Why it matters.** og:image controls the share preview on Slack, X, LinkedIn, Facebook, iMessage, and WhatsApp; missing or broken images yield blank previews and lost clicks. Relative URLs are not resolved by Facebook/X. Declaring width/height saves the crawler an extra fetch; 1200x630 is the cross-platform standard.

**Fix (Astro).**

In BaseHead.astro build an absolute URL: `<meta property="og:image" content={new URL(ogImage, Astro.site).href} />` (set `site` in astro.config.mjs). Add og:image:width/height/alt and mirror to twitter:image. Store static images at 1200x630 in public/og/, or generate them (see dynamic OG rule).

**Cloudflare / Vercel.** Vercel: generate on demand with @vercel/og in an Astro endpoint. Cloudflare Pages: use workers-og / Satori in a Pages Function.

**How to verify.** Extract og:image from HTML; assert it is absolute https://, then `curl -sI <url>` returns 200 with Content-Type image/*; verify actual dimensions are 1200x630 (image-size lib) and width/height/alt meta are present. Validate visually in opengraph.xyz or the Facebook Sharing Debugger.

**Common mistakes.** Relative path in content; image behind auth (401/403); the homepage image reused on every page; 1200x675 (YouTube ratio); missing og:image:width/height.

**Sources.** <https://opengraphdebug.com/posts/og-image-requirements> · <https://www.krumzi.com/blog/open-graph-image-sizes-for-social-media-the-complete-2026-guide> · <https://myogimage.com/blog/og-image-tips-2025-social-sharing-guide>

---

### 🔴 Unique, non-empty <title> on every page

`metadata-title-present-and-unique` · **Critical** · stage: `build` · 🤖 automatable · check: `html_head`

**What.** Every page has exactly one non-empty <title> element in <head>, and no two pages share the same title value (home, blog index, pagination, tag archives, and 404 all included).

**Why it matters.** The title is the strongest on-page relevance signal; a missing title forces Google to fabricate one. Duplicate titles cause keyword cannibalization and crawl-quality flags in GSC, and Google rewrites duplicated titles.

**Fix (Astro).**

In src/layouts/BaseHead.astro accept a required `title` prop (no default fallback) and render `<title>{title}</title>`; type it as `string` so the build errors when omitted. For content collections, mark `title` required in the Zod schema in src/content.config.ts. Add an `astro:build:done` integration that collects all titles from dist/**/*.html into a Set and fails on duplicates.

**Cloudflare / Vercel.** Build-time concern; no Cloudflare Pages / Vercel difference.

**How to verify.** Parse build output: `find dist -name '*.html' | xargs grep -L '<title>'` must be empty, and `grep -rh '<title>' dist --include='*.html' | sort | uniq -d` must return nothing. In a request, assert document.querySelector('title') exists with trimmed length > 0.

**Common mistakes.** Layout renders an empty <title></title> fallback; blog posts inherit a generic site title; /blog/page/2 reuses the /blog title; 404 reuses the home title.

**Sources.** <https://developers.google.com/search/docs/appearance/title-link> · <https://www.semrush.com/blog/duplicate-title-tags/>

---

### 🔴 Mobile viewport meta tag present and non-restrictive

`metadata-viewport` · **Critical** · stage: `build` · 🤖 automatable · check: `html_head`

**What.** Every page has <meta name="viewport" content="width=device-width, initial-scale=1"> and does NOT set user-scalable=no or maximum-scale=1.

**Why it matters.** Without a viewport tag mobile browsers render at 980px desktop width and scale down, harming mobile-first indexing and Core Web Vitals; Lighthouse flags it as critical. Disabling zoom violates WCAG 1.4.4.

**Fix (Astro).**

In BaseHead.astro: `<meta name="viewport" content="width=device-width, initial-scale=1" />`. Never add user-scalable=no or maximum-scale=1.

**How to verify.** Assert document.querySelector('meta[name="viewport"]').content includes width=device-width and initial-scale=1 and excludes user-scalable=no / maximum-scale=1. Lighthouse 'Viewport' audit automates the presence check.

**Common mistakes.** Adding user-scalable=no or maximum-scale=1; placing the viewport tag after scripts.

**Sources.** <https://developers.google.com/search/docs/crawling-indexing/special-tags> · <https://web.dev/learn/html/metadata>

---

### 🟠 Complete favicon set: favicon.ico, 32px PNG, SVG, and apple-touch-icon

`metadata-favicon-set-complete` · **High** · stage: `pre-launch` · 🤖 automatable · check: `http_status`

**What.** The site serves a complete icon set: /favicon.ico (32x32, no redirect) as universal fallback; a 32x32 PNG (`<link rel=icon type=image/png sizes=32x32>`); an SVG favicon (`<link rel=icon type=image/svg+xml>`, ideally dark-mode aware); and a 180x180 apple-touch-icon (`<link rel=apple-touch-icon>`). All referenced links resolve to HTTP 200 with correct content types.

**Why it matters.** Browsers, OS bookmark folders, RSS readers, and Slack fetch /favicon.ico unconditionally; iOS uses apple-touch-icon for home-screen icons (falling back to an ugly screenshot otherwise); modern browsers prefer SVG/PNG. An incomplete set means blank tab/home-screen icons and 404s in logs - a trust signal.

**Fix (Astro).**

Put favicon.ico, favicon.svg, favicon-32x32.png, apple-touch-icon.png in public/ (copied verbatim to dist root). In BaseHead.astro add `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`, `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />`, `<link rel="icon" href="/favicon.ico" sizes="32x32" />`, `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />`. Use the astro-favicons integration to generate all sizes from one source image.

**Cloudflare / Vercel.** Both Cloudflare Pages and Vercel serve public/ at root automatically. Cloudflare Pages applies long-lived cache headers - rename icon files (or set must-revalidate) when changing them.

**How to verify.** GET /favicon.ico -> 200 (image/x-icon); GET /favicon.svg -> 200 (image/svg+xml); GET the 32x32 PNG -> 200 (image/png); GET /apple-touch-icon.png -> 200 (image/png), dimensions 180x180. Parse <head> and assert all four link tags present. Audit with realfavicongenerator.net/favicon_checker.

**Common mistakes.** favicon.ico in a subdirectory; apple-touch-icon missing or 16x16 upscaled (blurry); rel=apple-touch-icon-precomposed (deprecated since iOS 7); SVG link present but file 404s.

**Sources.** <https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs> · <https://rodneylab.com/astro-js-favicon/>

---

### 🟠 Unique meta description on every page, 130-160 chars

`metadata-meta-description` · **High** · stage: `build` · 🤖 automatable · check: `html_head`

**What.** Every page has a non-empty, page-specific <meta name="description">, no two pages share the same value, and length is roughly 130-160 chars (core message within the first ~120 chars for mobile/rewritten snippets; hard cap 160).

**Why it matters.** Without a description Google pulls an arbitrary body snippet. A unique, well-sized description is the main lever for SERP click-through (though not a ranking factor); duplicate descriptions are flagged in GSC and over-length ones are truncated.

**Fix (Astro).**

Accept a required `description` prop in BaseHead.astro and render `<meta name="description" content={description} />`. In content collections enforce `description: z.string().min(70).max(165)`. Add an astro:build:done check for empties, duplicates, and length outliers.

**How to verify.** `grep -rL 'name="description"' dist --include='*.html'` empty (none missing); `grep -roh 'name="description" content="[^"]*"' dist --include='*.html' | sort | uniq -d` empty (no duplicates); measure content length and flag <70 or >165.

**Common mistakes.** content={description ?? ''} so the tag exists but is empty; tag/pagination pages share one templated description; auto-generated first-paragraph descriptions running 200+ chars.

**Sources.** <https://developers.google.com/search/docs/appearance/snippet> · <https://sitebulb.com/hints/duplicate-content/urls-with-duplicate-title-and-meta-descriptions/>

---

### 🟠 Core Open Graph properties set (title, description, url, type, site_name)

`metadata-og-core-properties` · **High** · stage: `build` · 🤖 automatable · check: `html_head`

**What.** Every page sets og:title, og:description, og:url, og:type, and og:site_name using the `property` attribute. og:url is absolute https:// and equals the canonical href; og:type is 'website' (or 'article' for posts); og:site_name is the brand name (not the URL).

**Why it matters.** These are the required/expected OGP fields that build the link unfurl card on LinkedIn, Slack, Discord, Facebook, and iMessage. Mismatched og:url vs canonical splits social share counts; using `name` instead of `property` is a frequent breakage.

**Fix (Astro).**

In BaseHead.astro: `<meta property="og:title" content={title} />`, `<meta property="og:description" content={description} />`, `<meta property="og:url" content={canonicalURL} />` (reuse the canonical variable), `<meta property="og:type" content={ogType ?? 'website'} />` ('article' in post layouts), and `<meta property="og:site_name" content={SITE_NAME} />` from src/config.ts. Always use `property=`, not `name=`.

**How to verify.** Assert each og:* tag exists with non-empty content; og:url is absolute https:// and equals link[rel=canonical] href; og:type is lowercase 'website'/'article'; blog posts use 'article'. View in opengraph.xyz / LinkedIn Post Inspector.

**Common mistakes.** Using name="og:title"; og:url with UTM params or http://; trailing-slash mismatch with canonical; capital 'Article'; og:site_name set to the domain.

**Sources.** <https://ogp.me/> · <https://env.dev/guides/opengraph>

---

### 🟠 twitter:card set to summary_large_image (with Twitter card fields)

`metadata-twitter-card` · **High** · stage: `build` · 🤖 automatable · check: `html_head`

**What.** Every page has <meta name="twitter:card" content="summary_large_image">. twitter:title, twitter:description, twitter:image, twitter:image:alt and (when the brand has an account) twitter:site=@handle are recommended; all use the `name` attribute. X falls back to og:* for content but NOT for card type, so twitter:card must be set explicitly.

**Why it matters.** Without twitter:card, X renders a minimal/no-image card; summary_large_image produces the large banner that maximizes click-through. Card type has no OG equivalent, so it cannot be inherited. twitter:image:alt provides accessibility for the card.

**Fix (Astro).**

In BaseHead.astro: `<meta name="twitter:card" content="summary_large_image" />` plus `<meta name="twitter:title" content={title} />`, `<meta name="twitter:description" content={description} />`, `<meta name="twitter:image" content={socialImageURL} />`, `<meta name="twitter:image:alt" content={ogImageAlt ?? title} />`. Add twitter:site only if a handle is configured; never render it empty. Use `name=`, not `property=`.

**How to verify.** Assert meta[name="twitter:card"].content === 'summary_large_image'. Assert twitter:image (if present) is absolute https://; twitter:image:alt non-empty; twitter:site (if present) starts with '@'. Validate with a Twitter/X card validator.

**Common mistakes.** property="twitter:card"; using 'summary' instead of summary_large_image; relative twitter:image; rendering empty twitter:site="" when no account exists.

**Sources.** <https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/summary-card-with-large-image> · <https://www.opengraph.to/articles/missing-twitter-card>

---

### 🟡 Per-page dynamic OG images, not one shared fallback

`metadata-dynamic-og-images` · **Medium** · stage: `pre-launch` · 🤖 automatable · check: `http_status`

**What.** Content pages (blog posts, products) reference a unique, programmatically generated 1200x630 OG image embedding the page title/brand, rather than a single static /og.png reused everywhere.

**Why it matters.** Cards showing the actual page title materially lift social click-through. One shared image across all pages triggers duplicate-image warnings in social validators and signals low effort.

**Fix (Astro).**

Create a prerendered Astro endpoint, e.g. src/pages/og/[slug].png.ts with `export const prerender = true`, using @vercel/og (Satori) or astro-og-canvas to render to PNG at build time; reference it per page as `<meta property="og:image" content={new URL(`/og/${slug}.png`, Astro.site).href} />` plus og:image:width/height.

**Cloudflare / Vercel.** Cloudflare Pages SSR runs @vercel/og in the Worker (128 MB limit; prefer prerendered output). Vercel supports @vercel/og natively in Edge Functions.

**How to verify.** For sample pages, extract og:image from HTML, GET it, and assert status 200, Content-Type image/png|jpeg, size > ~5 KB, and that the path is page-specific (not one shared /og.png). Confirm distinct cards in the X Card Validator and Facebook Sharing Debugger.

**Common mistakes.** One static /og.png for all pages; generating at runtime on SSR routes without caching; dimensions not exactly 1200x630; forgetting og:image:width/height.

**Sources.** <https://knaap.dev/posts/dynamic-og-images-with-any-static-site-generator/> · <https://astro-paper.pages.dev/posts/dynamic-og-image-generation-in-astropaper-blog-posts/>

---

### 🟡 One H1 per page with a logical, unskipped heading hierarchy

`metadata-single-h1-heading-hierarchy` · **Medium** · stage: `build` · 🤖 automatable · check: `html_element`

**What.** Each page has exactly one <h1> and headings descend without skipping levels (H1 -> H2 -> H3; H1 -> H3 is invalid). Google does not penalize multiple H1s, but a single focused H1 and ordered headings are the accessibility best practice (WCAG 1.3.1 / 2.4.6).

**Why it matters.** 71.6% of screen-reader users navigate by headings (WebAIM 2024); a single H1 and ordered nesting give clear document structure and help engines infer topic/subtopic relationships. This is best practice, not a hard ranking signal.

**Fix (Astro).**

Keep the H1 in page content (not BaseHead.astro); for Markdown/MDX ensure exactly one top-level `# Heading` and avoid a duplicate H1 in the layout. Enforce heading order in content via a remark/rehype plugin, and add an astro:build:done check (or axe 'heading-order' rule) over dist HTML.

**How to verify.** `find dist -name '*.html' | xargs grep -c '<h1' | grep -v ':1$'` lists pages with zero or multiple H1s. Run axe 'heading-order' to flag skipped levels per page.

**Common mistakes.** Header logo wrapped in H1 plus a content H1; blog template emits H1 for the title and the markdown also starts with '# Title'; jumping H2 -> H4 for visual styling.

**Sources.** <https://yoast.com/how-to-use-headings-on-your-site/> · <https://www.w3.org/WAI/tutorials/page-structure/headings/>

---

### 🟡 Title length ~50-60 chars with a consistent brand suffix

`metadata-title-length-brand-pattern` · **Medium** · stage: `pre-launch` · 🤖 automatable · check: `body_regex`

**What.** Inner-page titles are ~50-60 characters (front-loaded topic) and append the brand as a suffix, e.g. 'Page Title | Brand'; the home page uses 'Brand - Tagline'. Total stays under ~65 chars / ~600 px so the brand isn't truncated.

**Why it matters.** Titles over ~600 px are truncated in SERPs, cutting the brand or key qualifier. Google rewrote 76% of titles in Q1 2025; brand-prefix removal was the most common action (63% of rewrites), so a front-loaded topic with a brand suffix and a controlled length survives rewrites best.

**Fix (Astro).**

In BaseHead.astro: `<title>{title} | {SITE_NAME}</title>` (SITE_NAME from src/config.ts), with a flag for the home-page format. Add a build-time `astro:build:done` warning when title length < 30 or > 65, or when a non-home title doesn't end with the configured ` | Brand` / ` - Brand` suffix.

**How to verify.** Parse each dist title, strip entities, and flag length < 30 or > 65; assert non-home titles match /[|\-] BrandName$/. Confirm no truncation in totheweb.com's title/description pixel tool.

**Common mistakes.** Brand suffix pushes long organic titles over 65 chars; some pages add the brand and others don't; inconsistent brand spelling; not stripping HTML entities before measuring.

**Sources.** <https://searchengineland.com/google-changed-76-of-title-tags-in-q1-2025-heres-what-that-means-454847> · <https://zyppy.com/title-tags/meta-title-tag-length/>

---

### 🟡 Complete web app manifest with required PWA fields and icons

`metadata-web-app-manifest` · **Medium** · stage: `pre-launch` · 🤖 automatable · check: `http_status`

**What.** A manifest.webmanifest is linked in <head> and contains name, short_name, start_url, display (standalone/minimal-ui), background_color, theme_color (matching the theme-color meta), and an icons array with at least 192x192 and 512x512 PNGs plus a maskable variant.

**Why it matters.** A valid manifest is the prerequisite for the browser install prompt and is gated by Lighthouse's installability audit. short_name labels the installed app, theme_color tints chrome, and maskable icons prevent clipping on Android adaptive shapes.

**Fix (Astro).**

Place public/manifest.webmanifest with the required fields and a maskable icon (`purpose: 'maskable'`). In BaseHead.astro: `<link rel="manifest" href="/manifest.webmanifest" />`. Keep manifest theme_color in sync with `<meta name="theme-color">`.

**Cloudflare / Vercel.** Both Cloudflare Pages and Vercel serve public/ at root with the correct Content-Type; no extra config needed.

**How to verify.** GET /manifest.webmanifest -> 200 with Content-Type application/manifest+json; parse JSON and assert name non-empty, display in {standalone,minimal-ui,fullscreen}, start_url present, and icons include 192x192 and 512x512; GET each icon -> 200. Run Lighthouse and assert installable.

**Common mistakes.** display: browser (no install prompt); manifest linked but 404; missing maskable icon; icon paths that 404; theme_color mismatch with the meta tag.

**Sources.** <https://web.dev/learn/pwa/web-app-manifest> · <https://developer.chrome.com/docs/lighthouse/pwa/installable-manifest>

---

### ⚪ No legacy <meta name="keywords"> tag

`metadata-no-keywords-meta` · **Low** · stage: `build` · 🤖 automatable · check: `body_regex`

**What.** No <meta name="keywords"> appears in any page's HTML.

**Why it matters.** Google has ignored the keywords meta since 2009 and Bing/Yandex ignore it too; it adds noise and needlessly exposes keyword strategy to competitors.

**Fix (Astro).**

Remove any `<meta name="keywords">` from Layout/Head components and audit third-party SEO integrations (some inject it by default).

**How to verify.** `grep -r 'name="keywords"' dist/` returns empty.

**Common mistakes.** Legacy SEO component libraries that still inject keywords meta by default.

**Sources.** <https://developers.google.com/search/blog/2009/09/google-does-not-use-keywords-meta-tag>

---

### ⚪ Service worker registered with an offline fallback (PWA baseline)

`metadata-service-worker-offline` · **Low** · stage: `pre-launch` · 🤖 automatable · check: `lighthouse`

**What.** A service worker is registered that caches static assets (cache-first) and returns a branded offline fallback page when the network is unavailable, with the manifest start_url served by the SW.

**Why it matters.** A service worker is required for the PWA install prompt and is checked by Lighthouse; an offline fallback reduces bounce on flaky networks. Not a direct ranking factor, but installable PWAs index reliably and see higher engagement.

**Fix (Astro).**

Add vite-plugin-pwa in astro.config.mjs (VitePWA with registerType:'autoUpdate', a Workbox globPatterns set, and a manifest) and create a src/pages/offline.astro fallback preloaded in the SW install event. For static sites use Workbox generateSW mode.

**Cloudflare / Vercel.** The SW is a plain JS file served identically by Cloudflare Pages and Vercel; for SSR routes the SW can cache responses but not intercept dynamic rendering.

**How to verify.** Run Lighthouse and assert the installability/SW checks pass; in DevTools > Application > Service Workers confirm status 'activated and running', then toggle Offline and reload to confirm the branded fallback renders.

**Common mistakes.** Registering a SW with no offline fallback; caching HTML cache-first indefinitely (stale content); not clearing old caches on update.

**Sources.** <https://vite-pwa-org.netlify.app/frameworks/astro> · <https://web.dev/articles/install-criteria>

---

### ⚪ theme-color meta tag(s) for browser chrome tinting

`metadata-theme-color` · **Low** · stage: `pre-launch` · 🤖 automatable · check: `html_head`

**What.** A <meta name="theme-color" content="#RRGGBB"> is present; sites with dark mode declare two, each with a prefers-color-scheme media attribute. Values are static hex/rgb, not CSS variables.

**Why it matters.** Mobile Chrome and Samsung Internet tint the address bar and task switcher to the brand color, giving a polished, PWA-like feel even when the site is not installed.

**Fix (Astro).**

In BaseHead.astro: `<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />` and `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0a0a0a" />`, matching each mode's background and the manifest theme_color.

**How to verify.** Assert meta[name="theme-color"] exists with a valid hex/rgb value; if two are declared, assert both carry a media attribute. Verify the address bar tint on Android Chrome.

**Common mistakes.** Using a CSS variable like var(--color) (must be a literal); omitting the tag entirely; theme-color not matching the manifest.

**Sources.** <https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/theme-color> · <https://css-tricks.com/meta-theme-color-and-trickery/>

---

## Structured Data (Schema.org)

JSON-LD that makes pages eligible for rich results and helps engines understand entities: Organization, WebSite, Article, Product, and BreadcrumbList.

### 🔴 Product/LocalBusiness schema values match visible page content

`structured-data-product-content-match` · **Critical** · stage: `post-launch` · 🤖 automatable · check: `json_ld`

**What.** Price, priceCurrency, availability, and NAP (name/address/phone) emitted in Product, Offer, or LocalBusiness JSON-LD must match the values visibly rendered on the page (and, for local businesses, the Google Business Profile listing). Markup must never assert data the user cannot see on the page.

**Why it matters.** Google's structured-data spam policies prohibit markup that misrepresents visible content. A mismatch is a documented manual-action trigger that suppresses ALL rich results for the site. The Rich Results Test only validates syntax and does NOT catch this.

**Fix (Astro).**

Derive schema values from the same data source as the rendered HTML. Use one frontmatter/collection field (e.g. post.data.price) for both the visible `<p>{price}</p>` and offers.price, and store NAP once in src/consts.ts for both the visible `<address>` and the LocalBusiness block. Never hardcode values in schema separately from the UI. After a CMS price change, rebuild static pages (webhook-triggered deploy) or use SSR for frequently changing prices.

**Cloudflare / Vercel.** On Cloudflare Pages and Vercel static builds, a CMS data change requires a rebuild to resync schema with HTML; use a deploy webhook or SSR (Workers/Vercel Functions) for volatile data.

**How to verify.** For each product/local page: extract offers.price (and address/telephone) from ld+json and the visible price/NAP via a CSS selector. Normalize (strip currency symbols and whitespace) and assert equality within 0.01 tolerance for price and exact-after-normalization for NAP.

**Common mistakes.** Showing a sale price on the page but the regular price in schema; CMS price updated without a static rebuild; JS-rendered price differing from server-rendered schema; schema phone '555-555-5555' vs visible '(555) 555-5555'.

**Sources.** <https://developers.google.com/search/docs/appearance/structured-data/sd-policies> · <https://developers.google.com/search/docs/appearance/structured-data/local-business>

---

### 🔴 All JSON-LD is valid and passes the Schema.org validator with zero errors

`structured-data-valid-json-ld-clean` · **Critical** · stage: `build` · 🤖 automatable · check: `json_ld`

**What.** Every page's `<script type="application/ld+json">` block must contain syntactically valid JSON and pass the Schema.org Markup Validator (validator.schema.org) with zero errors (warnings reviewed). The schema.org validator catches type mismatches and invalid property values the Google Rich Results Test ignores.

**Why it matters.** Invalid JSON-LD (trailing commas, unescaped quotes from improper serialization) silently disqualifies a page from all rich results. The schema.org validator checks the full vocabulary, not just Google-supported types.

**Fix (Astro).**

Always serialize objects with `<script type="application/ld+json" set:html={JSON.stringify(schema)} />` (Astro's set:html avoids HTML-entity escaping that double-quote interpolation `{...}` introduces and produces invalid JSON). Optionally use `schema-dts` TypeScript types (via astro-seo-schema) for build-time type safety. In CI, extract ld+json from dist/ with cheerio and validate each block; cache results per content hash because validator.schema.org is rate-limited (~50 req/hour) — a third-party validator API or schema-dts is preferable for per-build runs.

**How to verify.** Parse every ld+json block as JSON (assert no parse error). POST each to validator.schema.org/validate (or a third-party equivalent) and assert the errors array is empty; alternatively rely on schema-dts build-time type checking.

**Common mistakes.** Using `{JSON.stringify(...)}` interpolation instead of set:html (escapes quotes -> invalid JSON); only running the Rich Results Test (misses schema.org violations); calling the official validator for every page on every build and getting 429s.

**Sources.** <https://schema.org/docs/validator.html> · <https://stephen-lunt.dev/blog/astro-structured-data/>

---

### 🟠 Article author is a Person with name (no titles) and a working bio URL/sameAs

`structured-data-article-author-person` · **High** · stage: `pre-launch` · 🤖 automatable · check: `json_ld`

**What.** The Article author must be `@type: Person` (not Organization) with author.name containing only the person's name (no job titles, honorifics, or publisher info) and a url to an on-site author bio page plus sameAs to professional profiles. The bio page must actually exist and not 404 (an orphaned author URL is worse than no schema).

**Why it matters.** Author schema tied to a real, linkable bio page is a core E-E-A-T signal in 2026 and feeds author-entity disambiguation against the Knowledge Graph, especially for YMYL content and AI Overview citation. Google documents that titles/honorifics in author.name are a common quality error.

**Fix (Astro).**

Define authors as a content collection in src/content/authors/. In the article schema (Astro v5 uses `id`, not `slug`, for collection entries): `author:{ '@type':'Person', name: author.name, url: new URL(`/authors/${author.id}`, Astro.site).toString(), sameAs: author.sameAs }`. Ensure the bio page at that url is built and linked from the article.

**How to verify.** Parse Article ld+json; assert author['@type'] === 'Person' and author.name is non-empty and does not match title patterns (Dr., CEO, Editor, '|', 'posted by'). If author.url present, GET it and assert 200. Warn (not error) if neither url nor sameAs is present.

**Common mistakes.** author set to @type Organization for human-written content; author.name = 'Jane Smith, CEO of Acme'; author.url pointing at the homepage; orphaned bio pages; using `slug` instead of `id` in Astro v5 collections.

**Sources.** <https://developers.google.com/search/docs/appearance/structured-data/article> · <https://docs.astro.build/en/guides/upgrade-to/v5/>

---

### 🟠 Article/BlogPosting JSON-LD on every article with headline, image, dates, author

`structured-data-article-blog-posts` · **High** · stage: `pre-launch` · 🤖 automatable · check: `json_ld`

**What.** Every blog/editorial page must include an Article or BlogPosting block. Google lists no strictly required properties, but for rich-result eligibility emit headline, image (array of ImageObject, each >=50,000 px area and ideally >=1200px wide), datePublished (ISO 8601, timezone preferred), dateModified, and author. Providing 16:9, 4:3, and 1:1 image variants maximizes eligibility across surfaces.

**Why it matters.** Article structured data enables Top Stories eligibility, article rich snippets, and Google News indexing. Google enforces headline, image, and author most strictly in practice; a missing image is the most common reason for ineligibility.

**Fix (Astro).**

In src/layouts/BlogPost.astro using typed `CollectionEntry<'blog'>` props: `{ '@context':'https://schema.org','@type':'BlogPosting', headline: post.data.title, image:[{ '@type':'ImageObject', url: ogImageUrl, width:1200, height:630 }], datePublished: post.data.pubDate.toISOString(), dateModified:(post.data.updatedDate ?? post.data.pubDate).toISOString(), author:{...} }`. Generate aspect-ratio variants with astro:assets getImage(). Always call .toISOString() on Date objects (type frontmatter as `z.date()` in the collection schema).

**Cloudflare / Vercel.** With static output on Cloudflare Pages/Vercel, JSON-LD is pre-rendered at build; rerun `astro build` after content changes so new posts get schema.

**How to verify.** For each article URL: parse ld+json, find @type Article/BlogPosting; assert headline non-empty; image is a non-empty array whose urls return 200 image content-type; datePublished matches a strict ISO 8601 regex; if dateModified present it is ISO and >= datePublished; author.name non-empty. Warn if no image >=1200px wide.

**Common mistakes.** Omitting image; passing a Date object without .toISOString() (serializes to [object Object] or a locale string); merging multiple authors into one author.name string; single landscape image assumed to cover all surfaces.

**Sources.** <https://developers.google.com/search/docs/appearance/structured-data/article>

---

### 🟠 BreadcrumbList on inner pages with sequential, canonical item URLs

`structured-data-breadcrumblist-inner-pages` · **High** · stage: `pre-launch` · 🤖 automatable · check: `json_ld`

**What.** Every page at depth >= 2 (blog posts, product, category, docs) must include a BreadcrumbList. Each ListItem needs position (integer starting at 1, sequential, no gaps), name, and item (absolute URL); the final ListItem may omit item. Each item URL must exactly match that page's canonical URL (https, same trailing-slash convention, no params).

**Why it matters.** BreadcrumbList unlocks breadcrumb rich results on desktop SERPs (Google removed the mobile visual in January 2025) and helps Google map site structure and entities for AI Overviews. URL/canonical mismatches confuse the URL graph and can void breadcrumb eligibility.

**Fix (Astro).**

Generate breadcrumbs in the layout from `Astro.site` + `Astro.url.pathname` so URLs always match the canonical tag and respect trailingSlash. e.g. `[{pos:1,name:'Home',url:site},{pos:2,name:'Blog',url:`${site}blog/`},{pos:3,name:post.data.title}]` mapped to ListItem objects. Use data-vocabulary-free schema.org markup.

**Cloudflare / Vercel.** Align Cloudflare Pages / Vercel trailing-slash redirect rules with Astro `trailingSlash` to avoid redirect chains in breadcrumb URLs.

**How to verify.** For sample inner URLs: parse ld+json, find @type 'BreadcrumbList', assert itemListElement length >= 2, positions are positive integers sequential from 1, names non-empty. For each item URL: GET (follow redirects) and assert the final URL matches the declared item and the page's canonical tag points to the same URL.

**Common mistakes.** position starting at 0; skipping intermediate levels (Home -> Post without Blog); relative or http:// item URLs while the canonical is https; trailing-slash mismatch causing redirects; using deprecated data-vocabulary.org markup.

**Sources.** <https://developers.google.com/search/docs/appearance/structured-data/breadcrumb> · <https://developers.google.com/search/blog/2025/01/simplifying-breadcrumbs>

---

### 🟠 Do not rely on FAQPage or HowTo schema for rich results (deprecated)

`structured-data-faqpage-howto-deprecated` · **High** · stage: `pre-launch` · 🤖 automatable · check: `json_ld`

**What.** FAQPage rich results stopped appearing in Google Search on May 7, 2026 (Rich Results Test support removed June 2026, Search Console API support August 2026). HowTo was removed from desktop in September 2023. Several other types were retired in June 2025 (ClaimReview, Special Announcement, Estimated Salary, Course Info, Book Actions, Learning Video, Vehicle Listing). The markup remains valid schema.org and causes no penalty, but generates no SERP feature — do not implement it expecting rich results.

**Why it matters.** Teams maintaining FAQPage/HowTo markup expecting expandable rich results are wasting effort and page weight after these deprecations.

**Fix (Astro).**

Do not add new FAQPage/HowTo implementations for SERP enhancement. Existing markup may be left (no penalty) or removed to reduce page weight. Remove HowTo schema if present.

**How to verify.** Detect FAQPage, HowTo, or the June 2025 retired types in ld+json and emit an informational warning (not a blocking error) noting no rich result will be generated.

**Common mistakes.** Following pre-2024 guides that recommend FAQPage on all blog posts; expecting FAQ accordion content to render as expandable SERP rich results after May 2026.

**Sources.** <https://developers.google.com/search/docs/appearance/structured-data/faqpage> · <https://www.engagecoders.com/google-retires-7-structured-data-features-to-streamline-search-results/>

---

### 🟠 LocalBusiness JSON-LD on homepage for local/physical businesses

`structured-data-localbusiness-schema` · **High** · stage: `pre-launch` · 🤖 automatable · check: `json_ld`

**What.** If the site represents a physical or local-service business, the homepage must include a LocalBusiness block (or a specific subtype: Restaurant, MedicalClinic, LegalService). No properties are strictly required, but emit name, a structured PostalAddress (streetAddress, addressLocality, addressRegion, postalCode, addressCountry), telephone in E.164 (+countrycode) format, url, and ideally geo, image, and structured openingHoursSpecification.

**Why it matters.** LocalBusiness schema is a primary input to Google's local pack and Maps. NAP consistency between schema, visible page, and the Google Business Profile is critical for local ranking (NAP inconsistency is a leading cause of local ranking suppression).

**Fix (Astro).**

In the homepage layout for local sites: `{ '@context':'https://schema.org','@type':'LocalBusiness', name: BIZ_NAME, address:{ '@type':'PostalAddress', streetAddress:'...', addressLocality:'...', addressRegion:'...', postalCode:'...', addressCountry:'US' }, telephone:'+1-555-555-5555', url: Astro.site }`. Store all NAP and hours constants once in src/consts.ts and reuse them for the visible `<address>` element.

**How to verify.** Fetch homepage ld+json; find @type matching LocalBusiness or subtype; assert name, address.streetAddress, address.addressLocality, address.addressCountry non-empty; assert telephone (if present) starts with '+'. (NAP-vs-visible matching is covered by the content-match rule.)

**Common mistakes.** Using generic @type 'Organization' when a subtype applies; omitting addressCountry; telephone without country code; free-text opening hours instead of structured dayOfWeek/opens/closes.

**Sources.** <https://developers.google.com/search/docs/appearance/structured-data/local-business>

---

### 🟠 Organization (or specific subtype) JSON-LD on the homepage with logo and sameAs

`structured-data-organization-homepage` · **High** · stage: `pre-launch` · 🤖 automatable · check: `json_ld`

**What.** The homepage must include an Organization block (or a more specific subtype: LocalBusiness, OnlineStore, NGO). Google documents no required properties, but emit @context, @type, name, url, logo, and a sameAs array of official social/directory profiles. The logo must be a publicly reachable raster image (PNG/JPEG/WebP, not SVG) at least 112x112 px. Place Organization schema only on the homepage, not every page.

**Why it matters.** Organization schema is the primary signal Google uses to build the Knowledge Panel, disambiguate brand identity, and attach the logo/social profiles to the site, supporting E-E-A-T and (in 2026) AI Overview brand citation. sameAs links are independent entity-existence evidence; Wikidata is the strongest sameAs target for Knowledge Graph reconciliation.

**Fix (Astro).**

In src/pages/index.astro (or a layout gated on `Astro.url.pathname === '/'`): `{ '@context':'https://schema.org','@type':'Organization', name: SITE_NAME, url: import.meta.env.SITE, logo:{ '@type':'ImageObject', url: LOGO_URL }, sameAs: SOCIAL_LINKS }`. Serve the logo via astro:assets from src/assets/ (PNG >=112px). Keep SITE_NAME and a SOCIAL_LINKS array (LinkedIn, X, Facebook, Instagram, YouTube, GitHub, Wikidata) in src/consts.ts.

**How to verify.** Fetch homepage; parse ld+json; find @type matching Organization or subtype; assert name and url are non-empty. GET logo.url -> assert 200, Content-Type starts with image/ and is not image/svg+xml, dimensions >=112x112. For each sameAs URL assert absolute HTTPS and 200 (warn, not error, if sameAs absent).

**Common mistakes.** Using @type 'WebSite' alone to represent the brand; omitting or pointing logo at an SVG; putting Organization schema on every page; listing a personal social account instead of the brand page; omitting Wikidata.

**Sources.** <https://developers.google.com/search/docs/appearance/structured-data/organization> · <https://ahrefs.com/blog/google-knowledge-graph/>

---

### 🟠 Product JSON-LD on product pages with name and offers/rating

`structured-data-product-schema` · **High** · stage: `pre-launch` · 🤖 automatable · check: `json_ld`

**What.** Every single-product page must include Product JSON-LD with name plus at least one of review, aggregateRating, or offers. In offers, price must be a numeric string with no currency symbol, priceCurrency a valid ISO 4217 code, and availability a schema.org URL. priceValidUntil is optional but, if present, must be a future date.

**Why it matters.** Product schema unlocks product snippets (price, availability, star ratings) in SERPs. Missing name or all three of review/aggregateRating/offers prevents eligibility. An expired priceValidUntil can silently suppress the snippet.

**Fix (Astro).**

In src/layouts/Product.astro: `{ '@context':'https://schema.org','@type':'Product', name: product.name, image:[product.image], offers:{ '@type':'Offer', price: product.price.toString(), priceCurrency:'USD', availability:'https://schema.org/InStock' } }`. Omit priceValidUntil on static sites unless you can keep it current (rebuild cron or SSR); if included, set a future date.

**Cloudflare / Vercel.** For static builds, ensure price data is available at build time or use SSR (Cloudflare Workers / Vercel Functions) for frequently changing prices; a stale priceValidUntil silently suppresses snippets after it passes.

**How to verify.** For each product URL: parse ld+json, find @type 'Product'; assert name non-empty and at least one of review/aggregateRating/offers present. If offers: assert price is numeric-only string, priceCurrency is a 3-letter ISO 4217 code, availability is a schema.org URL. If priceValidUntil present, assert it parses as ISO and is > Date.now().

**Common mistakes.** price formatted as '$19.99'; availability as plain text 'In Stock'; Product schema on a category/listing page; a stale priceValidUntil copied from a template.

**Sources.** <https://developers.google.com/search/docs/appearance/structured-data/product-snippet>

---

### 🟠 Rich Results Test confirms eligibility for each schema type in use

`structured-data-rich-results-test-eligible` · **High** · stage: `post-launch` · 🤖 automatable · check: `external_tool`

**What.** After deploy, run Google's Rich Results Test on at least one representative live URL per schema type in use (homepage for Organization/WebSite, an article for Article, a product page for Product, an inner page for BreadcrumbList, a video page for VideoObject). Each should show eligible with zero ERROR-severity issues.

**Why it matters.** The Rich Results Test exercises Google's actual parser and Google-specific field requirements, not just schema.org validity. It is the authoritative tool for Google rich-result eligibility.

**Fix (Astro).**

Test the live preview URL after deploy. Automate via the API: `POST https://searchconsole.googleapis.com/v1/urlTestingTools/richResultsTest:run?url=<url>` with a Google API key, in a post-deploy CI step against the preview URL.

**Cloudflare / Vercel.** Cloudflare Pages (`<branch>.<project>.pages.dev`) and Vercel (`<project>-<hash>.vercel.app`) preview URLs are public and work with the Rich Results Test.

**How to verify.** Call the Rich Results Test API for each representative URL; assert testStatus.status is 'COMPLETE', richResultsItems is non-empty for types expected to produce rich results, and each item has zero ERROR-severity issues.

**Common mistakes.** Testing only localhost (the tool needs a public URL); checking only the homepage and missing article/product template errors; expecting FAQPage/HowTo to show eligibility (deprecated).

**Sources.** <https://search.google.com/test/rich-results> · <https://developers.google.com/search/docs/appearance/structured-data>

---

### 🟠 VideoObject JSON-LD on pages where a video is the primary content

`structured-data-videoobject-video-pages` · **High** · stage: `pre-launch` · 🤖 automatable · check: `json_ld`

**What.** Any page whose primary content is a video (embedded YouTube/Vimeo, self-hosted, or `<video>`) must include a VideoObject block with name, description, a publicly fetchable thumbnailUrl, uploadDate (ISO 8601), and contentUrl or embedUrl. Include duration (ISO 8601, e.g. PT5M30S) to improve eligibility.

**Why it matters.** VideoObject markup is the only path to Google's Video rich results (video carousel, key moments, SERP thumbnail). Pages embedding video without it get no SERP video treatment, and in 2026 AI search uses VideoObject alongside transcripts for video understanding.

**Fix (Astro).**

In the video/blog layout, inject VideoObject (in the same @graph as Article if applicable): `{ '@type':'VideoObject', name: post.data.videoTitle, description: post.data.videoDescription, thumbnailUrl: post.data.videoThumbnail, uploadDate: post.data.pubDate.toISOString(), contentUrl: post.data.videoUrl, duration:'PT5M30S' }` via `<script type="application/ld+json" set:html={JSON.stringify(schema)} />`.

**Cloudflare / Vercel.** Pure JSON-LD in static HTML on both platforms; ensure the thumbnailUrl domain is not blocked in robots.txt.

**How to verify.** For each page containing an `<iframe>` or `<video>`: parse ld+json, assert a VideoObject node with non-empty name, description, thumbnailUrl, uploadDate (ISO 8601) and at least one of contentUrl/embedUrl. Validate via Rich Results Test selecting 'Video'.

**Common mistakes.** thumbnailUrl behind auth or robots-blocked so Googlebot cannot fetch it; non-ISO uploadDate; VideoObject on a page where the video is not actually watchable; hardcoded view counts that go stale; omitting duration.

**Sources.** <https://developers.google.com/search/docs/appearance/structured-data/video>

---

### 🟠 WebSite JSON-LD on homepage for site-name eligibility (no SearchAction)

`structured-data-website-site-name` · **High** · stage: `pre-launch` · 🤖 automatable · check: `json_ld`

**What.** The homepage must include a WebSite block with @type 'WebSite', name (the display site name), and url (canonical homepage). Do NOT add a potentialAction SearchAction block: Google deprecated the Sitelinks Search Box on November 21, 2024 and it produces no SERP feature (leaving it in causes no error, but should not be added to new builds). Place WebSite schema only on the homepage.

**Why it matters.** Google's site-name feature in SERPs reads from WebSite.name; without it Google guesses from the <title> and may truncate or pick wrongly. The WebSite type and site-name function remain fully supported after the SearchAction deprecation.

**Fix (Astro).**

Co-locate with the Organization block on the homepage: `{ '@context':'https://schema.org','@type':'WebSite', name: SITE_NAME, url: import.meta.env.SITE }`. Set `site:` in astro.config.mjs to the deployed domain so url matches the canonical. If a legacy potentialAction/SearchAction block exists, remove it.

**Cloudflare / Vercel.** Ensure Astro `site` matches the actual deployed domain on Cloudflare Pages or Vercel.

**How to verify.** Fetch homepage; parse ld+json; find @type 'WebSite'; assert name non-empty and url matches the canonical homepage URL (respecting Astro trailingSlash). Flag any potentialAction SearchAction as an informational deprecated-markup notice (not a blocking error).

**Common mistakes.** Relying on <title> instead of WebSite schema; url pointing at a non-root page; name/url mismatch between WebSite and Organization; copying older tutorials that still add SearchAction.

**Sources.** <https://developers.google.com/search/blog/2024/10/sitelinks-search-box> · <https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data>

---

### 🟡 Monitor Search Console Enhancements for structured-data errors post-launch

`structured-data-gsc-enhancements-monitoring` · **Medium** · stage: `post-launch` · 👤 manual · check: `manual`

**What.** After indexing begins, check Google Search Console > Search Appearance > Rich Results (Enhancements). Every active schema type should show a Valid count; investigate and resolve any Error or Warning items. Connect GSC to the property before launch and check within 1-2 weeks of the first crawl.

**Why it matters.** GSC is the only surface that reports structured-data errors at scale across all indexed pages, catching issues Google's crawler finds that the Rich Results Test (single-URL) does not.

**Fix (Astro).**

No Astro code change. Verify ownership (HTML file or DNS TXT; Vercel offers a GSC marketplace integration) before launch, then monitor the Enhancements section. Optionally query the URL Inspection API with a service account for per-URL rich-result status.

**Cloudflare / Vercel.** Both Cloudflare Pages and Vercel support HTML-file or DNS-TXT verification; Vercel has a GSC marketplace integration that simplifies it.

**How to verify.** Log in to GSC > Search Appearance > Rich Results and review each enhancement type's error/warning counts; or query the URL Inspection API (requires OAuth/service-account) and flag any type with error_count > 0. Human interpretation of trends is required, so this is not fully automatable.

**Common mistakes.** Never checking GSC after launch; ignoring warnings that suppress rich results; not connecting GSC before launch; looking for FAQPage/HowTo reports that no longer exist.

**Sources.** <https://support.google.com/webmasters/answer/9044175>

---

### 🟡 Primary content image has ImageObject markup with stable URL and dimensions

`structured-data-imageobject-primary-image` · **Medium** · stage: `pre-launch` · 🤖 automatable · check: `json_ld`

**What.** Pages with a primary content image (articles, products) should expose that image as an ImageObject with @type, url (or contentUrl), width, and height — either standalone or nested as the Article/Product image property. The image URL must be stable across deploys (not a hash that changes every build). For licensing-eligible images, add license and creditText.

**Why it matters.** Google uses ImageObject markup (and og:image) as primary sources for selecting thumbnails in Search and Discover and for Google Images rich features. For Article rich results, the image property with dimensions is what satisfies the recommended image requirement.

**Fix (Astro).**

Inject in <head>: `<script type="application/ld+json" set:html={JSON.stringify({ '@context':'https://schema.org','@type':'ImageObject', url: imageUrl, width:1200, height:800, name:'Alt text' })} />`, or nest the same object as the Article/Product `image` property. Ensure imageUrl is a stable path (avoid a build-hash URL that rotates each deploy).

**Cloudflare / Vercel.** On Cloudflare Pages/Vercel ensure the schema image URL is content-stable (astro:assets content-hashed URLs are stable across deploys when the source is unchanged).

**How to verify.** GET page HTML, extract ld+json; assert @type 'ImageObject' (correct casing) OR that the Article/Product/Recipe schema includes an image with url and width/height. Validate via Rich Results Test.

**Common mistakes.** Omitting width/height; using @type 'image' (lowercase) instead of 'ImageObject'; pointing url at a build-hash URL that changes every deploy.

**Sources.** <https://developers.google.com/search/docs/appearance/google-images> · <https://developers.google.com/search/docs/appearance/structured-data/image-license-metadata>

---

### 🟡 ProfilePage JSON-LD on author bio pages

`structured-data-profilepage-author-bio` · **Medium** · stage: `pre-launch` · 🤖 automatable · check: `json_ld`

**What.** Each author bio page should include a ProfilePage block whose @id is the bio page's canonical URL and whose mainEntity is a Person with name, image, description, and a non-empty sameAs array of absolute social/profile URLs.

**Why it matters.** Google's ProfilePage documentation explicitly supports static author bio pages, enabling the author photo/handle in SERPs. In 2026, Person sameAs in ProfilePage markup aids entity disambiguation against the Knowledge Graph and supports AI Overview author resolution and E-E-A-T.

**Fix (Astro).**

In src/pages/authors/[id].astro or AuthorLayout.astro: `{ '@context':'https://schema.org','@type':'ProfilePage', '@id': Astro.url.href, mainEntity:{ '@type':'Person', name: author.name, image: author.photo, description: author.bio, sameAs:[author.twitter, author.linkedin, author.github] } }` injected with set:html.

**How to verify.** For each author page URL: parse ld+json, assert a ProfilePage node with @id matching the canonical URL, mainEntity['@type'] === 'Person', mainEntity.name non-empty, and mainEntity.sameAs a non-empty array of absolute URLs. Validate via Rich Results Test.

**Common mistakes.** Placing Person schema only on article pages without a dedicated bio page; relative URLs in sameAs; omitting @id; placing the schema on the homepage instead of the bio URL.

**Sources.** <https://developers.google.com/search/docs/appearance/structured-data/profile-page>

---

### ⚪ Connect entities in a single @graph with @id cross-references (WebPage layer)

`structured-data-webpage-graph-linking` · **Low** · stage: `pre-launch` · 🤖 automatable · check: `json_ld`

**What.** As a quality-of-implementation enhancement, emit one @graph per page that links the entities via @id: a WebPage (or subtype AboutPage/ContactPage/CollectionPage/ItemPage) tying together WebSite (isPartOf), BreadcrumbList (breadcrumb), and the primary Article/Product entity. Not required for any current rich result.

**Why it matters.** WebPage entities form the linking layer of a well-formed @graph, giving Google explicit relationships between Page, breadcrumb, primary entity, and site — improving entity understanding in the Knowledge Graph (the pattern used by Yoast and The SEO Framework).

**Fix (Astro).**

Add to the page @graph: `{ '@type':'WebPage', '@id':`${canonicalUrl}#webpage`, url: canonicalUrl, name: pageTitle, isPartOf:{ '@id':`${siteUrl}#website` }, breadcrumb:{ '@id':`${canonicalUrl}#breadcrumb` } }`, and for articles add `mainEntity:{ '@id':`${canonicalUrl}#article` }`. Give each entity a matching @id so they cross-reference.

**How to verify.** For each page @graph, if a WebPage (or subtype) entity is present assert its url matches the canonical URL and its isPartOf/breadcrumb @id references resolve to other entities in the same graph. Absence is an informational note, not an error.

**Common mistakes.** Confusing WebSite (the whole site) with WebPage (one page); emitting disconnected ld+json blocks with no shared @id linking instead of a single @graph.

**Sources.** <https://developer.yoast.com/features/schema/functional-specification/>

---

## Performance & Core Web Vitals

The speed and stability signals Google measures from real users: LCP, INP, and CLS, plus the loading, caching, font, and JS tactics that move them.

### 🔴 CLS is under 0.1 at the 75th percentile

`performance-cls-threshold` · **Critical** · stage: `post-launch` · 🤖 automatable · check: `lighthouse`

**What.** Cumulative Layout Shift must be <=0.1 at the 75th percentile (0.1-0.25 = needs improvement; >0.25 = poor). CLS accumulates across the entire page lifetime, not just load.

**Why it matters.** Layout shifts degrade UX and are a Core Web Vitals ranking input. They commonly spike on launch day when real fonts, ads, banners, or embeds load for the first time.

**Fix (Astro).**

Use astro:assets <Image /> (auto-injects width/height); supply explicit dimensions for public-folder, Markdown/MDX and remote images; self-host fonts with tuned fallback metrics; reserve space for dynamic content and wrap iframes in aspect-ratio containers. See the dedicated image-dimension, font, dynamic-content and iframe CLS rules below.

**Cloudflare / Vercel.** No platform difference for CLS itself.

**How to verify.** Lighthouse: lighthouse <URL> --output=json | jq '.audits["cumulative-layout-shift"].numericValue' must be < 0.1. For field data, CrUX cumulative_layout_shift p75 < 0.1.

**Common mistakes.** Images without explicit width/height; web fonts loaded without preload/fallback tuning; banners or cookie notices injected above-the-fold after load without reserved space.

**Sources.** <https://web.dev/articles/optimize-cls> · <https://docs.astro.build/en/guides/images/>

---

### 🔴 All three Core Web Vitals pass in CrUX field data at p75

`performance-crux-field-data-passing` · **Critical** · stage: `post-launch` · 🤖 automatable · check: `external_tool`

**What.** After ~28 days of real-user traffic, the Chrome User Experience Report (CrUX) field data at the 75th percentile must show 'Good' for LCP (<2.5 s), INP (<200 ms), and CLS (<0.1). This is the ground-truth signal Google uses for the Page Experience ranking input.

**Why it matters.** Google ranks on CrUX field data, not lab scores. A perfect Lighthouse score does not guarantee good field metrics — real users on slow mobile networks frequently experience worse. CrUX is the only authoritative pass/fail.

**Fix (Astro).**

There is no single config change — field metrics are the combined outcome of all LCP/INP/CLS optimizations below. Monitor via Google Search Console's Core Web Vitals report, the PageSpeed Insights field-data panel, the CrUX API, or a RUM tool. Astro's static output gives a strong baseline; keep islands minimal.

**How to verify.** CrUX API: POST https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=<KEY> with body {"origin":"https://yourdomain.com","metrics":["largest_contentful_paint","interaction_to_next_paint","cumulative_layout_shift"]} and assert all three show category FAST at p75. Or open pagespeed.web.dev and verify the field-data panel shows three green 'Good' badges.

**Common mistakes.** Celebrating a 100 lab score on launch day without rechecking ~30 days later; CrUX lags by 28 days. New/low-traffic sites may never appear in CrUX (requires roughly 1000+ Chrome users/month) — fall back to RUM and lab data.

**Sources.** <https://www.corewebvitals.io/core-web-vitals> · <https://github.com/GoogleChrome/web-vitals> · <https://www.digitalapplied.com/blog/core-web-vitals-2026-inp-lcp-cls-optimization-guide>

---

### 🔴 Every <img> has explicit width and height (or layout prop) to reserve space

`performance-img-explicit-dimensions` · **Critical** · stage: `build` · 🤖 automatable · check: `html_element`

**What.** All <img> elements must carry numeric width and height attributes (or an astro:assets layout prop) so the browser can compute the intrinsic aspect ratio and reserve space before the image downloads.

**Why it matters.** Without dimensions, browsers render images at 0x0 until download completes, then reflow — a primary CLS source. The 2025 Web Almanac reports 62% of mobile pages (65% desktop) still have at least one unsized image.

**Fix (Astro).**

Local imports: Astro infers width/height automatically. Public-folder images: pass width/height explicitly. Remote images: pass width+height, or inferSize={true} (build-time request), or layout='constrained'|'full-width'|'fixed' (stable since v5.10) which auto-generates sizes/srcset. In CSS pair with img { height: auto; max-width: 100%; } — never width: auto, which overrides the aspect-ratio hint.

**Cloudflare / Vercel.** No platform difference — this is a build-time HTML output check.

**How to verify.** Parse rendered HTML: document.querySelectorAll('img') with a missing width or height attribute (and no inline aspect-ratio) should be empty. Run Lighthouse --only-audits=cls and assert CLS < 0.1.

**Common mistakes.** Public-folder images without explicit dimensions; CSS width: auto overriding the HTML aspect-ratio hint; inferSize on a remote domain not in image.domains/remotePatterns (silently no-ops).

**Sources.** <https://web.dev/articles/optimize-cls> · <https://docs.astro.build/en/reference/modules/astro-assets/> · <https://almanac.httparchive.org/en/2025/performance>

---

### 🔴 INP is under 200 ms at the 75th percentile

`performance-inp-threshold` · **Critical** · stage: `post-launch` · 🤖 automatable · check: `external_tool`

**What.** Interaction to Next Paint (which replaced FID on 12 March 2024) measures the worst interaction latency across the full page lifetime. Good: <=200 ms; needs improvement: 200-500 ms; poor: >500 ms. Lighthouse cannot measure INP — only field data (CrUX) reveals it.

**Why it matters.** INP is an official Core Web Vitals ranking input. It catches post-load interaction freezes that FID missed. Astro's zero-JS default makes INP failures rare for content sites but they appear once interactive islands and third-party scripts are added.

**Fix (Astro).**

Prefer client:idle / client:visible over client:load for non-critical islands; avoid spawning large islands inside map() loops; keep DOM under ~1400 nodes; break long event handlers into smaller tasks; defer/facade third-party scripts. See dedicated INP/TBT rules below.

**Cloudflare / Vercel.** No platform difference — INP is purely a client-side JS execution concern.

**How to verify.** CrUX API: POST https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=<KEY> with metrics ["interaction_to_next_paint"] and assert p75 < 200. Use Lighthouse TBT (<200 ms) only as a directional lab proxy; for the live page use the Web Vitals Chrome extension while interacting.

**Common mistakes.** Wrapping entire page sections in client:load components; running heavy synchronous JS in click handlers without yielding; loading chat/GTM scripts synchronously.

**Sources.** <https://web.dev/blog/inp-cwv-march-12> · <https://web.dev/articles/optimize-inp>

---

### 🔴 LCP/hero image is eager + fetchpriority=high (never lazy-loaded), exactly one per page

`performance-lcp-image-priority` · **Critical** · stage: `build` · 🤖 automatable · check: `html_element`

**What.** The image that will be the LCP element must use loading='eager' (never loading='lazy') and carry fetchpriority='high', and only one image per page should be marked high priority.

**Why it matters.** Lazy-loading the LCP image is the single largest avoidable LCP regression (the ~16-17% of pages doing it per the 2025 Web Almanac); fetchpriority='high' cuts LCP by 200-800 ms by promoting it past competing scripts/fonts. Multiple high-priority images compete and cancel the benefit.

**Fix (Astro).**

On the hero <Image /> or <Picture />, set priority={true} (Astro v5.10+), which atomically applies loading='eager', fetchpriority='high', and decoding='sync'. Do not set priority on more than one image per page, and do not apply a global lazy default to above-the-fold images.

**Cloudflare / Vercel.** Both Cloudflare Pages and Vercel respect these attributes; no extra config needed.

**How to verify.** Parse rendered HTML: the LCP <img> must NOT have loading='lazy' and SHOULD have fetchpriority='high'; assert document.querySelectorAll('img[fetchpriority="high"]').length === 1 and it is the visual LCP candidate. Lighthouse audit 'lcp-lazy-loaded' must report 0 violations.

**Common mistakes.** Wrapping the hero in a generic component that applies lazy by default; applying priority/fetchpriority to a logo or every image 'just in case'.

**Sources.** <https://unlighthouse.dev/learn-lighthouse/lcp/lcp-lazy-loaded> · <https://addyosmani.com/blog/fetch-priority/> · <https://docs.astro.build/en/reference/modules/astro-assets/>

---

### 🔴 LCP is under 2.5 s at the 75th percentile

`performance-lcp-threshold` · **Critical** · stage: `post-launch` · 🤖 automatable · check: `lighthouse`

**What.** Largest Contentful Paint must be 2.5 s or below at the 75th percentile of real page views (2.5-4 s = needs improvement; >4 s = poor). A slow LCP is the most common reason static sites fail Core Web Vitals.

**Why it matters.** LCP is a direct Core Web Vitals ranking input. Because Astro ships zero JS by default, TTFB and resource-load duration dominate LCP, so it is highly controllable.

**Fix (Astro).**

Set the hero <Image /> with priority={true} (Astro v5.10+, which applies loading='eager', fetchpriority='high', decoding='sync'), use <Picture formats={['avif','webp']} /> for smaller payloads, configure site in astro.config.mjs so assets serve from the CDN edge, and keep TTFB low. See the dedicated LCP-image, preload, TTFB and render-blocking rules below.

**Cloudflare / Vercel.** Cloudflare Pages serves from a 330+ PoP edge with tiered cache; Vercel's edge cache must be warm for real-world LCP.

**How to verify.** PSI API: GET https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed?url=<URL>&strategy=mobile&category=performance and assert lighthouseResult.audits['largest-contentful-paint'].numericValue < 2500. For field data use the CrUX origin/url record.

**Common mistakes.** Lazy-loading the hero, serving the hero from public/ (bypasses astro:assets optimization), and not setting fetchpriority='high' on the LCP candidate.

**Sources.** <https://web.dev/articles/optimize-lcp> · <https://developer.mozilla.org/en-US/blog/fix-image-lcp/>

---

### 🟠 Hashed assets (_astro/*) are served immutable; HTML is served short/no-cache

`performance-cache-hashed-assets-immutable` · **High** · stage: `pre-launch` · 🤖 automatable · check: `http_header`

**What.** Content-hashed assets (CSS/JS/fonts/images under _astro/) must be served Cache-Control: public, max-age=31536000, immutable, while HTML documents must be served no-cache (or public, max-age=0, must-revalidate) and never immutable.

**Why it matters.** Hashed asset URLs never change, so immutable caching eliminates revalidation round trips on repeat visits. But if HTML is long-cached, returning visitors get stale HTML referencing deleted asset hashes, producing broken pages.

**Fix (Astro).**

Cloudflare Pages: add a public/_headers file (copied to dist/) with a /_astro/* rule setting public, max-age=31536000, immutable and a /*.html (or /*) rule setting public, max-age=0, must-revalidate. Vercel: add vercel.json headers rules: an /_astro/(.*) immutable rule and a short-TTL rule for HTML. Do not rely on platform defaults — Cloudflare Pages has shipped max-age=0, must-revalidate for ALL files including _astro/* (GitHub issue #16692), so set the rule explicitly.

**Cloudflare / Vercel.** Cloudflare Pages: _headers file at project root; default for hashed assets is NOT immutable (issue #16692) so override it. Vercel: static HTML is not edge-cached by default; _astro/* needs an explicit vercel.json rule (unlike _next/static which is automatic).

**How to verify.** curl -sI <URL>/_astro/FILE.HASH.js | grep -i cache-control must include max-age=31536000 and immutable; curl -sI <URL>/ | grep -i cache-control must show max-age=0/no-cache and must NOT contain immutable.

**Common mistakes.** Applying the immutable policy to HTML; relying on platform defaults that omit immutable on hashed assets; not adding an explicit /_astro/* rule.

**Sources.** <https://github.com/withastro/astro/issues/16692> · <https://developers.cloudflare.com/pages/configuration/serving-pages/> · <https://vercel.com/docs/caching/cache-control-headers>

---

### 🟠 Dynamic content, banners, and iframes/embeds reserve space (aspect-ratio / fixed)

`performance-cls-dynamic-content-iframes` · **High** · stage: `build` · 👤 manual · check: `manual`

**What.** Any element inserted or expanded after first paint — cookie banners, newsletter popups, ad slots, skeleton loaders, and iframes (YouTube, Maps, Calendly, Twitter/X) — must have its space reserved before content arrives.

**Why it matters.** Content inserted around existing content, or an unsized iframe collapsing to 0 height then expanding, causes layout shift that can push CLS above 0.1 single-handedly. Cookie banners and embeds are the most common post-launch CLS sources.

**Fix (Astro).**

Cookie banners: position: fixed (fixed elements do not contribute to CLS). Iframes/embeds: wrap in <div style='aspect-ratio:16/9;width:100%'> with the iframe absolutely filling it, plus loading='lazy' and title. Ad slots: set min-height to the largest expected size. Skeletons: match real-content dimensions exactly. For YouTube prefer a thumbnail+play facade that swaps in the iframe on click.

**Cloudflare / Vercel.** No platform difference.

**How to verify.** curl -sL <URL> | grep '<iframe' | grep -v 'aspect-ratio\|height' flags unsized iframes. Then throttle to Slow 3G in DevTools, reload, and watch for jumps; check Lighthouse 'Avoid large layout shifts' for dynamic-content/iframe entries.

**Common mistakes.** Injecting a cookie consent banner via JS without reserved space; pasting a YouTube/Twitter embed without an aspect-ratio container; Google Maps embed with width:100% but no height.

**Sources.** <https://web.dev/articles/optimize-cls> · <https://www.corewebvitals.io/core-web-vitals/cumulative-layout-shift>

---

### 🟠 Brotli (or zstd/gzip) compression is active for text responses

`performance-compression-enabled` · **High** · stage: `post-launch` · 🤖 automatable · check: `http_header`

**What.** All text responses (HTML, CSS, JS, SVG, JSON) must be served compressed, negotiated via Accept-Encoding. Brotli is preferred (~14-25% smaller than gzip); Zstandard is also valid on Cloudflare.

**Why it matters.** Compression reduces bytes on the wire, directly improving FCP and LCP for every text asset.

**Fix (Astro).**

No Astro config — handled at the CDN/platform layer. On Cloudflare free plan the default is zstd (not Brotli); if Safari support matters, note Safari does not accept zstd — use Cloudflare Compression Rules (available to all plans since Oct 2024) to force Brotli/gzip. Vercel negotiates Brotli/gzip automatically on all plans.

**Cloudflare / Vercel.** Cloudflare default varies by plan (Free: zstd, Pro/Business: Brotli, Enterprise: gzip); Compression Rules override it. Vercel: Brotli/gzip automatic on all plans.

**How to verify.** curl -sI -H 'Accept-Encoding: br, gzip, zstd' <URL> | grep -i content-encoding should return br (or zstd/gzip). Repeat for a /_astro/*.css or *.js asset. Check the header value even if curl does not decode the body.

**Common mistakes.** Assuming Cloudflare Pages free plan delivers Brotli — it defaults to Zstandard, which breaks compression negotiation on Safari. Brotli is the default only on Pro/Business; Enterprise defaults to gzip.

**Sources.** <https://developers.cloudflare.com/speed/optimization/content/compression/> · <https://vercel.com/docs/edge-network/compression>

---

### 🟠 Web fonts are self-hosted WOFF2 with font-display:swap, preloaded, and fallback-metric tuned

`performance-fonts-self-host-display-swap` · **High** · stage: `build` · 🤖 automatable · check: `html_head`

**What.** Web fonts must be (1) self-hosted from your own domain (not the Google Fonts CDN), (2) WOFF2, (3) declared font-display: swap (or optional), (4) preloaded for the critical subset with <link rel='preload' as='font' crossorigin>, and (5) given tuned fallback metrics (size-adjust / ascent-override / descent-override) so the swap causes near-zero CLS.

**Why it matters.** Third-party font CDNs add an extra DNS+TCP+TLS round trip (100-500 ms) and send the user IP to Google; font-display:swap avoids invisible text (FOIT); preloading makes the font available before first paint; matched fallback metrics eliminate the swap-time layout jump that otherwise pushes CLS above 0.1 on text-heavy pages.

**Fix (Astro).**

Use Astro's Fonts API (experimental experimental.fonts in v5.7+ / stable in Astro 6): configure a provider in astro.config.mjs and add <Font cssVariable='--font-inter' preload /> in the layout — it self-hosts, sets font-display, preloads, and auto-computes fallback overrides (optimizedFallbacks). On Astro 5 without the flag, self-host WOFF2 in public/fonts/ with explicit @font-face + preload, and compute size-adjust via the fontaine package or screenspan.net/fallback. Preload at most ~2 fonts to avoid competing with the LCP image.

**Cloudflare / Vercel.** Fonts are downloaded at build time into the static asset bundle, so behavior is identical on Cloudflare Pages and Vercel; hashed font files cache immutably under _astro/.

**How to verify.** curl -sL <URL> | grep 'fonts.googleapis' returns nothing; grep 'font-display' shows swap/optional; grep for a font preload link in <head>; @font-face for the system fallback contains size-adjust or ascent-override. In DevTools Network filter by Font and confirm all font requests hit your own domain.

**Common mistakes.** Using a Google Fonts <link> embed; font-display: block (FOIT up to 3 s); TTF/OTF instead of WOFF2; preloading too many fonts; swap without fallback-metric overrides.

**Sources.** <https://docs.astro.build/en/reference/experimental-flags/fonts/> · <https://web.dev/articles/optimize-cls> · <https://astro.build/blog/astro-6/>

---

### 🟠 HTTP/2 or HTTP/3 (QUIC) is enabled on the domain

`performance-http2-http3-enabled` · **High** · stage: `post-launch` · 🤖 automatable · check: `http_header`

**What.** The site must be served over HTTP/2 (multiplexing) or HTTP/3 (QUIC). HTTP/1.1 forces serial asset downloads, multiplying latency on asset-heavy pages.

**Why it matters.** HTTP/2 multiplexes many assets over one connection in parallel; HTTP/3 QUIC eliminates head-of-line blocking and offers 0-RTT reconnects, especially impactful on mobile.

**Fix (Astro).**

Platform/CDN setting, no Astro config. Confirm the domain negotiates h2 or h3.

**Cloudflare / Vercel.** Cloudflare Pages: HTTP/2 always on; HTTP/3 available on all plans but verify it is enabled in the dashboard. Vercel: HTTP/2 default; HTTP/3 NOT supported as of mid-2025.

**How to verify.** curl -sI --http2 <URL> | grep -i 'HTTP/' should show HTTP/2 200; for HTTP/3 use curl --http3 (curl 7.66+) or http2.pro. In DevTools enable the Protocol column — requests should show h2 or h3.

**Common mistakes.** Assuming Vercel supports HTTP/3 — as of mid-2025 it does not, with no announced timeline. On Cloudflare, HTTP/3 may need enabling in Dashboard > Speed > Optimization.

**Sources.** <https://developers.cloudflare.com/speed/optimization/protocol/http3/> · <https://community.vercel.com/t/how-do-i-get-http-3-enabled-on-my-site/11723>

---

### 🟠 LCP image is discoverable in initial HTML and has a <link rel=preload> in <head>

`performance-lcp-preload-link` · **High** · stage: `build` · 🤖 automatable · check: `html_head`

**What.** The LCP resource URL must appear in the initial HTML source (not be JS-injected), and a <link rel='preload' as='image' fetchpriority='high'> should be present in <head> (with imagesrcset/imagesizes for responsive images) so the preload scanner fetches it before parsing <body>.

**Why it matters.** fetchpriority raises priority but does not move discovery earlier; a preload link makes the browser start fetching the LCP image before stylesheets/scripts delay the parser. If the LCP image is set via JS (background-image resolved in JS, src in useEffect), it cannot be discovered until JS runs, adding hundreds of ms.

**Fix (Astro).**

Use <Image />/<Picture /> so a native <img src> is emitted at build time. For the preload, call getImage() in the layout <head> and inject <link rel='preload' as='image' href={img.src} imagesrcset={img.srcSet.attribute} imagesizes='100vw' fetchpriority='high' />. Note: priority={true} does NOT auto-inject a preload link — add it manually. Never set the LCP via CSS background-image or a JS-driven first carousel slide unless its URL is also preloaded.

**Cloudflare / Vercel.** Cloudflare Pages static: preload href is a hashed /_astro/ URL. Vercel: href may be /_vercel/image?url=...&w=...&q=... — verify it matches what the <img> actually loads.

**How to verify.** GET the HTML: the LCP image URL must appear in source (curl -sL <URL> | grep the filename), and document.querySelector('link[rel="preload"][as="image"]') in <head> must exist with href/imagesrcset matching the LCP <img>. Lighthouse 'Preload Largest Contentful Paint image' must pass.

**Common mistakes.** Preloading a different URL than the <img> resolves to (hash mismatch); preloading without imagesrcset for a responsive image; LCP src injected by a JS carousel.

**Sources.** <https://web.dev/articles/preload-responsive-images> · <https://www.pagespeedfix.com/blog/astro-image-optimization/> · <https://developer.mozilla.org/en-US/blog/fix-image-lcp/>

---

### 🟠 No render-blocking CSS or synchronous JS in the critical path

`performance-no-render-blocking-resources` · **High** · stage: `build` · 🤖 automatable · check: `html_head`

**What.** Above-the-fold CSS should be inlined or non-blocking, and every external <script src> in <head> must use defer, async, or type='module'. Large global stylesheets and synchronous scripts in <head> block first render.

**Why it matters.** Each blocking stylesheet adds its full load time to the LCP critical path (a 50 KB CDN stylesheet can add 300-800 ms); a synchronous <head> script pauses HTML parsing until it downloads and runs, inflating LCP/TTI and TBT.

**Fix (Astro).**

Astro auto-inlines CSS under 4 KB (tunable via Vite build.assetsInlineLimit) and bundled client scripts are type='module' (deferred) by default. Load non-critical external CSS with the media='print' onload="this.media='all'" pattern. Never paste a third-party snippet into Layout.astro <head> without defer/async; avoid is:inline synchronous scripts unless tiny and critical.

**Cloudflare / Vercel.** No platform difference.

**How to verify.** Lighthouse 'Eliminate render-blocking resources' must report 0 blocking resources. curl -sL <URL> | grep '<link.*stylesheet' | grep -v 'media=' flags potentially blocking CSS; grep <head> script tags with src lacking defer/async/type=module.

**Common mistakes.** Importing a full framework CSS (Bootstrap/Tailwind CDN) via <link> in the layout head; copying Intercom/Hotjar snippets without defer.

**Sources.** <https://web.dev/articles/optimize-lcp> · <https://docs.astro.build/en/guides/styling/> · <https://docs.astro.build/en/reference/directives-reference/>

---

### 🟠 Minimal unused/heavy JS and CSS; Total Blocking Time under 200 ms

`performance-no-unused-js-css-tbt` · **High** · stage: `build` · 🤖 automatable · check: `lighthouse`

**What.** Bundles must not ship large volumes of unused code (target <20% unused on initial load), and Lighthouse Total Blocking Time (the lab proxy for INP) must be under 200 ms.

**Why it matters.** Unused/heavy JS wastes parse and compile time on the main thread, and any task over 50 ms contributes to TBT. High TBT (>200 ms) almost always predicts poor field INP.

**Fix (Astro).**

Rely on Vite tree-shaking; use named imports (import { debounce } from 'lodash-es') not barrel/default imports; replace heavy libs (moment -> Intl, jQuery -> native DOM); import individual icon components, not whole icon libraries. Use Astro's Tailwind integration (v4 purges at build). Audit with npx source-map-explorer dist/_astro/*.js and investigate any JS file over ~50 KB.

**Cloudflare / Vercel.** No platform difference.

**How to verify.** lighthouse <URL> --output=json | jq '.audits["total-blocking-time"].numericValue' < 200; Lighthouse 'Remove unused JavaScript' and 'Remove unused CSS' audits must pass; DevTools Coverage should show <50% unused for any file over 20 KB.

**Common mistakes.** Importing a whole UI framework or icon set for minor interactivity; not tree-shaking lodash; loading a below-fold slideshow library synchronously.

**Sources.** <https://www.debugbear.com/docs/metrics/total-blocking-time> · <https://web.dev/articles/optimize-inp>

---

### 🟠 Critical third-party origins have preconnect / dns-prefetch hints

`performance-preconnect-third-party-origins` · **High** · stage: `build` · 🤖 automatable · check: `html_head`

**What.** Add <link rel='preconnect'> (with dns-prefetch as fallback) in <head> for each third-party origin that serves a render-critical resource, limited to roughly 4-6 origins. Use dns-prefetch only for non-critical origins.

**Why it matters.** A cold connection to a third-party origin (DNS + TCP + TLS) costs 100-500 ms; preconnecting removes that latency before the first fetch. Too many preconnects waste connections.

**Fix (Astro).**

Add hints in Layout.astro <head>, e.g. <link rel='preconnect' href='https://your-cdn.example.com' /> (add crossorigin for font origins). Astro's Fonts API generates font preconnects automatically. Keep the total under ~6.

**Cloudflare / Vercel.** No platform difference.

**How to verify.** curl -sL <URL> | grep 'preconnect\|dns-prefetch' and cross-reference against high-priority third-party origins in the DevTools Network panel — each render-critical third-party origin should have a matching preconnect.

**Common mistakes.** Omitting crossorigin on font-origin preconnects; preconnecting every analytics endpoint instead of using dns-prefetch; forgetting preconnect for an image CDN hosting the LCP candidate.

**Sources.** <https://www.debugbear.com/blog/resource-hints-rel-preload-prefetch-preconnect> · <https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/preconnect>

---

### 🟠 Third-party scripts (GTM, analytics, chat) are deferred or facade-loaded

`performance-third-party-scripts-deferred` · **High** · stage: `build` · 🤖 automatable · check: `body_regex`

**What.** Every non-critical third-party script (GTM, Intercom, Zendesk, Hotjar, Meta Pixel, etc.) must load with defer/async or be replaced by a click-triggered facade. Total third-party main-thread blocking should stay under ~250 ms.

**Why it matters.** A GTM container is 100-500 KB and chat widgets download 200-500 KB; loaded synchronously these are the most common cause of high TBT and poor INP in otherwise clean Astro sites.

**Fix (Astro).**

Add third-party snippets with defer (or at the end of <body>); GTM's head script should use async. For chat widgets, render a static button facade and load the real widget on first click. Consider Cloudflare Zaraz to proxy analytics at the edge. Verify Partytown compatibility before proxying a widget through it (many use APIs incompatible with its worker proxy).

**Cloudflare / Vercel.** Cloudflare Zaraz can proxy analytics through Cloudflare's edge to reduce third-party origin overhead.

**How to verify.** curl -sL <URL> | grep -oP '<script[^>]+src=[^>]+>' | grep -v 'defer\|async\|type="module"' must return nothing. Lighthouse 'Reduce the impact of third-party code' third-party blocking time < 250 ms; in the Network panel no third-party script should show Priority: Highest.

**Common mistakes.** Pasting the GTM head snippet without async; loading a chat widget through Partytown without confirming compatibility.

**Sources.** <https://www.debugbear.com/blog/reduce-the-impact-of-third-party-code> · <https://web.dev/articles/optimize-inp>

---

### 🟠 Time to First Byte (TTFB) is under 800 ms

`performance-ttfb-fast-server-response` · **High** · stage: `post-launch` · 🤖 automatable · check: `external_tool`

**What.** TTFB (navigation request to first byte of HTML) must be under 800 ms ('good'), ideally under 600 ms. A slow TTFB caps achievable LCP.

**Why it matters.** TTFB delays every subsequent resource; a page with 2 s TTFB cannot reach LCP < 2.5 s regardless of other optimizations.

**Fix (Astro).**

Use output: 'static' wherever there is no dynamic content so HTML is pre-rendered and served from the edge; set site in astro.config.mjs. For output: 'server'/hybrid, minimize SSR computation. Serve from Cloudflare Pages or Vercel's global edge.

**Cloudflare / Vercel.** Cloudflare Pages serves cached static responses with ~20-100 ms TTFB from 330+ PoPs. Vercel's first-request TTFB can be higher until the asset is promoted to the regional edge cache.

**How to verify.** curl -w 'TTFB: %{time_starttransfer}s\n' -o /dev/null -s <URL> — assert time_starttransfer < 0.800. Or check PageSpeed Insights 'Server response time (TTFB)'.

**Common mistakes.** Deploying a static site to a single-region origin without a CDN; adding SSR middleware to pages that could be fully static; not setting output: 'static'.

**Sources.** <https://web.dev/articles/optimize-lcp> · <https://developers.cloudflare.com/pages/configuration/serving-pages/>

---

### 🟡 Below-fold images use loading=lazy and decoding=async

`performance-below-fold-image-loading` · **Medium** · stage: `build` · 🤖 automatable · check: `html_element`

**What.** All non-LCP images below the fold should have loading='lazy' (Astro <Image /> default) and decoding='async' so they defer fetching and decode off the main thread. The LCP image must instead use loading='eager' and decoding='sync'.

**Why it matters.** Lazy-loading below-fold images cuts initial page weight and network contention (improving LCP), and async decoding keeps the main thread free during decode (improving INP). decoding='async' on the LCP image is an anti-pattern that delays its paint.

**Fix (Astro).**

Astro <Image /> defaults to loading='lazy' + decoding='async' when priority is not set, and priority={true} switches the LCP image to eager + sync — so correct astro:assets usage needs no manual attributes. For raw <img> in Markdown/MDX/HTML, add loading='lazy' decoding='async' manually. Do not apply a global loading='eager' to below-fold images.

**Cloudflare / Vercel.** No platform difference (Cloudflare Rocket Loader does not affect image loading attributes).

**How to verify.** Parse rendered HTML: document.querySelectorAll('img:not([fetchpriority="high"]):not([loading="lazy"])') should be empty (allowing deliberate above-fold eager cases); the fetchpriority='high' image should have decoding='sync'. Lighthouse 'Defer offscreen images' must pass.

**Common mistakes.** Adding loading='eager' globally to fix a lazy issue then leaving it on below-fold images; raw <img> in .mdx/.html without lazy/async.

**Sources.** <https://docs.astro.build/en/guides/images/> · <https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decoding>

---

### 🟡 Production build output (HTML, CSS, JS) is minified and source maps are off

`performance-build-minified` · **Medium** · stage: `build` · 🤖 automatable · check: `body_regex`

**What.** astro build must emit minified HTML, CSS, and JS with no comments, whitespace, or public source maps.

**Why it matters.** Minification cuts CSS/JS payload by 10-30%, reducing transfer and parse time; source maps in production needlessly expose source code.

**Fix (Astro).**

Astro minifies CSS/JS (via Vite) and HTML by default in production. Ensure astro.config.mjs does NOT contain vite: { build: { minify: false } } left over from debugging, and keep build.sourcemap off (or hidden) for production.

**Cloudflare / Vercel.** No platform difference.

**How to verify.** curl -sL <URL>/_astro/HASH.css | wc -l should be ~1 line; Lighthouse 'Minify CSS' and 'Minify JavaScript' audits must pass.

**Common mistakes.** Leaving minify:false from debugging; shipping build.sourcemap:true to production.

**Sources.** <https://docs.astro.build/en/guides/styling/> · <https://docs.astro.build/en/reference/configuration-reference/>

---

### 🟡 Animations use only transform/opacity (no layout-triggering properties)

`performance-cls-composited-animations` · **Medium** · stage: `build` · 🤖 automatable · check: `body_regex`

**What.** CSS animations/transitions must use transform and opacity rather than layout-triggering properties (top/left/right/bottom/width/height/margin/padding).

**Why it matters.** Animating layout properties forces per-frame layout recalculation, generates layout shifts (CLS), and blocks the main thread (INP); transform/opacity run on the GPU compositor and never trigger layout.

**Fix (Astro).**

In component <style> blocks, replace e.g. animating left:-100%->0 with transform: translateX(-100%)->translateX(0). For accordions use grid-template-rows: 0fr->1fr instead of height:0->auto; for drawers use translateX instead of margin. Add will-change: transform only to elements that genuinely animate.

**Cloudflare / Vercel.** No platform difference.

**How to verify.** Source audit: grep .astro/.css for 'transition:' or 'animation:' lines that reference layout properties without transform/opacity. Lighthouse 'Avoid non-composited animations' must pass; DevTools Rendering > Paint flashing / Layout Shift Regions confirms (green = composited, red = layout).

**Common mistakes.** Animating height:0->auto for accordions; animating top for sticky headers; margin-left:-100% for off-canvas drawers.

**Sources.** <https://web.dev/articles/optimize-cls> · <https://web.dev/articles/optimize-inp>

---

### 🟡 DOM size is under 1400 nodes on initial load

`performance-dom-size-under-1400` · **Medium** · stage: `build` · 🤖 automatable · check: `lighthouse`

**What.** The initial page should have fewer than ~1400 DOM elements (Lighthouse warning threshold); beyond this, JS traversal and style/layout recalculation scale super-linearly and degrade INP.

**Why it matters.** Large DOMs slow hydration and inflate INP in island-based frameworks because Astro hydrates island subtrees within the surrounding static DOM.

**Fix (Astro).**

Paginate or virtualize large lists/tables; use client:visible for content-heavy below-fold components so they hydrate on scroll; avoid deeply nested wrapper components that add dozens of nodes per page.

**Cloudflare / Vercel.** No platform difference.

**How to verify.** Lighthouse 'Avoid an excessive DOM size' must not be flagged; lighthouse <URL> --output=json | jq '.audits["dom-size"].numericValue' < 1400. In the console, document.querySelectorAll('*').length.

**Common mistakes.** Rendering a full post list (200 cards) on the homepage as static HTML; deep mega-menu/wrapper nesting.

**Sources.** <https://web.dev/articles/optimize-inp> · <https://www.debugbear.com/docs/metrics/interaction-to-next-paint>

---

### 🟡 First Contentful Paint under 1.8 s and Speed Index under 3.4 s (lab)

`performance-fcp-speed-index` · **Medium** · stage: `post-launch` · 🤖 automatable · check: `lighthouse`

**What.** Supporting Lighthouse metrics: FCP (first text/image/canvas paint) under 1.8 s and Speed Index (how quickly content visually populates) under 3.4 s on mobile. Neither is a direct ranking signal but both feed the Lighthouse score and correlate with LCP.

**Why it matters.** FCP marks the end of the blank screen; FCP > 2 s almost always implies LCP > 2.5 s. Speed Index captures perceived load completeness (10% of the Lighthouse score).

**Fix (Astro).**

Improved by the same levers as LCP: low TTFB, no render-blocking CSS/JS, inlined critical CSS (<4 KB), optimized/preloaded images, and font-display:swap to avoid FOIT. Astro's static HTML delivers most content in the first response, naturally producing low FCP/Speed Index.

**Cloudflare / Vercel.** No platform difference.

**How to verify.** lighthouse <URL> --output=json | jq '.audits["first-contentful-paint"].numericValue' < 1800 and '.audits["speed-index"].numericValue' < 3400. Both must be green on mobile in PageSpeed Insights.

**Common mistakes.** @import-ing a Google Font in CSS (blocks FCP); media='all' on a non-critical stylesheet.

**Sources.** <https://web.dev/articles/optimize-lcp> · <https://www.corewebvitals.io/core-web-vitals>

---

### 🟡 Event handlers over 50 ms break work into smaller tasks / yield

`performance-inp-long-task-breakup` · **Medium** · stage: `build` · 👤 manual · check: `manual`

**What.** Any event callback (onclick/onsubmit/onchange/keydown) running over 50 ms on the main thread must split work and yield using scheduler.yield(), setTimeout(0), requestAnimationFrame, or React startTransition/useTransition.

**Why it matters.** A long synchronous handler blocks the main thread and delays the next paint, extending INP by hundreds of ms from the interaction until the frame renders.

**Fix (Astro).**

Audit handlers in island components. Prefer await scheduler.yield() but include a cross-browser fallback (await new Promise(r => setTimeout(r, 0))) since scheduler.yield() is Chrome 129+ only (not Firefox/Safari, not Baseline). For React 18+ mark non-urgent state updates with startTransition. Move heavy sort/filter/search work off the keystroke path (debounce + yield).

**Cloudflare / Vercel.** No platform difference.

**How to verify.** In the console register a PerformanceObserver for type 'longtask', interact with the page, and assert no interaction produces a task > 50 ms. In DevTools Performance, record interactions and look for red Long Task markers on the main thread.

**Common mistakes.** Sorting/filtering a list synchronously on every keystroke; synchronous XHR in a handler; setState with a large payload synchronously; using scheduler.yield() without a fallback.

**Sources.** <https://web.dev/articles/optimize-inp> · <https://developer.chrome.com/blog/use-scheduler-yield>

---

### 🟡 Lighthouse Performance score is 90+ on both mobile and desktop

`performance-lighthouse-score-90-plus` · **Medium** · stage: `post-launch` · 🤖 automatable · check: `lighthouse`

**What.** The composite Lighthouse Performance score (FCP, LCP, TBT, CLS, Speed Index) must be 90+ on both mobile (throttled) and desktop, tested against the deployed build — not localhost.

**Why it matters.** A 90+ mobile score means all CWV thresholds pass in lab conditions; below 90, at least one metric is likely failing and will drag down field CWV.

**Fix (Astro).**

Astro content sites routinely score 90-100 with output: 'static' and minimal islands. Set site, run astro build, and test the built output via a preview deployment (not localhost, which skips CDN latency/compression/HTTP-2).

**Cloudflare / Vercel.** No platform difference for the score.

**How to verify.** PSI API: GET .../runPagespeed?url=<URL>&strategy=mobile&category=performance and assert lighthouseResult.categories.performance.score * 100 >= 90; repeat with strategy=desktop.

**Common mistakes.** Testing only desktop (20-30 points higher); testing on localhost; ignoring the mobile score that reflects the median user.

**Sources.** <https://www.corewebvitals.io/core-web-vitals> · <https://web.dev/articles/optimize-lcp>

---

### 🟡 RUM with web-vitals attribution / LoAF is set up for INP root-cause monitoring

`performance-loaf-rum-monitoring` · **Medium** · stage: `post-launch` · 👤 manual · check: `manual`

**What.** Real-user monitoring (the web-vitals v4+ attribution build, or a RUM tool like DebugBear or Sentry) captures Long Animation Frame (LoAF) data alongside INP events so regressions can be attributed to specific scripts/handlers in production.

**Why it matters.** INP is a ranking factor and ~43% of sites still fail the 200 ms threshold. The LoAF API (Chrome 116+) is the only mechanism providing per-frame breakdowns (render/layout time + contributing script URLs); without it you see the symptom but not the cause, and lab tools cannot measure field INP at all.

**Fix (Astro).**

npm i web-vitals@^4. In a client:load inline island: import { onINP } from 'web-vitals/attribution'; onINP(({ value, attribution }) => sendToAnalytics({ value, loafScripts: attribution.longAnimationFrameEntries?.flatMap(e => e.scripts) ?? [] })). Use client:load (not client:idle, which misses early interactions) and send data to a backend for aggregation.

**Cloudflare / Vercel.** Client-side JS integration only — identical on Cloudflare Pages and Vercel.

**How to verify.** After interaction, confirm the analytics payload contains longAnimationFrameEntries with duration and scripts; in DevTools Performance, record an interaction and confirm the 'Long animation frames' section shows frames over 50 ms.

**Common mistakes.** Using the non-attribution web-vitals build (no LoAF); loading the RUM script with client:idle; only console.log-ing instead of aggregating server-side.

**Sources.** <https://github.com/GoogleChrome/web-vitals> · <https://requestmetrics.com/web-performance/long-animation-frame-loaf/>

---

### 🟡 No unnecessary redirect chains on the critical path

`performance-no-redirect-chains` · **Medium** · stage: `post-launch` · 🤖 automatable · check: `redirect`

**What.** The page and its LCP resource should go through 0-1 redirects. Each redirect adds at least one round trip to TTFB.

**Why it matters.** Each redirect costs 50-300 ms; a 2-hop chain adds 100-600 ms before the first HTML byte, pushing LCP above 2.5 s on mobile.

**Fix (Astro).**

Set trailingSlash: 'never' or 'always' consistently in astro.config.mjs and match it in the platform redirect rules to avoid double redirects; redirect HTTP->HTTPS and www<->apex in a single hop directly to the final URL. Cloudflare Pages: _redirects file. Vercel: vercel.json redirects array.

**Cloudflare / Vercel.** Cloudflare Pages: _redirects. Vercel: vercel.json redirects. Keep trailing-slash behavior consistent between Astro and platform.

**How to verify.** curl -sI -L --max-redirs 10 -w '%{num_redirects}' <URL> -o /dev/null must return 0 or 1; for the LCP image, curl -sI -L <IMAGE_URL> should show a single HTTP response.

**Common mistakes.** Astro trailingSlash:'always' clashing with a platform that strips slashes (double redirect); configuring both www and apex without a direct single-hop redirect.

**Sources.** <https://web.dev/articles/optimize-lcp> · <https://realmorrisliu.com/thoughts/fixing-astro-seo-cloudflare-trailing-slash/>

---

### 🟡 Vercel ISR does not serve SEO-critical pages indefinitely stale

`performance-vercel-isr-not-stale` · **Medium** · stage: `post-launch` · 🤖 automatable · check: `http_header`

**What.** When using @astrojs/vercel with ISR, pages are edge-cached indefinitely after first render unless an expiration is set. SEO-critical pages (sitemap, robots, canonical pages) must have a bounded expiration or be excluded from ISR.

**Why it matters.** Stale ISR responses can serve Googlebot outdated titles, canonical URLs, or structured data, causing stale metadata to be indexed.

**Fix (Astro).**

In astro.config.mjs: adapter: vercel({ isr: { expiration: 3600, exclude: ['/sitemap-index.xml', '/sitemap-0.xml', '/robots.txt', /^\/api\/.+/] } }) — exclude supports string paths and RegExp. Prefer export const prerender = true for sitemap/robots so they are static and not subject to ISR; use bypassToken + the Vercel revalidation API for on-demand invalidation.

**Cloudflare / Vercel.** Vercel-specific. The Cloudflare Pages equivalent is edge caching via Cache-Control / Cache Rules, not ISR.

**How to verify.** curl -sI https://example.com/some-page | grep -i x-vercel-cache (HIT/MISS, not BYPASS) and curl ... | grep -i age (bounded, less than expiration). Confirm the sitemap is not served as a stale ISR response.

**Common mistakes.** Enabling isr: true with no expiration (cached until next deploy); including sitemap/robots in the ISR cache.

**Sources.** <https://docs.astro.build/en/guides/integrations-guide/vercel/> · <https://vercel.com/docs/frameworks/frontend/astro>

---

### ⚪ Consider content-visibility:auto for large off-screen sections

`performance-content-visibility-offscreen` · **Low** · stage: `build` · 👤 manual · check: `manual`

**What.** Apply content-visibility: auto (with contain-intrinsic-size) to large, independent below-fold sections (long FAQs, comment lists) to defer their layout/paint/composite until they approach the viewport.

**Why it matters.** It skips layout, style, paint, and compositing for off-screen content, freeing the main thread earlier and improving INP. It became Baseline Newly Available on 15 September 2025 (Chrome/Edge 85+, Firefox 125+, Safari 18+).

**Fix (Astro).**

In component <style>: .faq { content-visibility: auto; contain-intrinsic-size: 0 500px; }. The contain-intrinsic-size placeholder prevents scrollbar jumps before the section renders. Do not apply to subtrees containing position: sticky/fixed children — they do not work inside the containment boundary.

**Cloudflare / Vercel.** No platform difference; safe to use without polyfill as of late 2025.

**How to verify.** curl -sL <URL> | grep 'content-visibility' to confirm it is applied to appropriate sections; in DevTools Rendering with Paint flashing, off-screen sections should only flash on entering the viewport, not on initial load (Lighthouse does not audit this directly).

**Common mistakes.** Applying it to sections with sticky children; omitting contain-intrinsic-size, causing scrollbar jumps.

**Sources.** <https://web.dev/articles/content-visibility> · <https://caniuse.com/css-content-visibility>

---

### ⚪ Astro prefetch (and optional client prerender) enabled for instant internal navigation

`performance-prefetch-prerender-navigation` · **Low** · stage: `build` · 🤖 automatable · check: `html_element`

**What.** Astro's built-in prefetch preloads internal links on hover/focus/viewport, and optionally experimental.clientPrerender upgrades that to full Speculation Rules prerendering in Chromium (with prefetch fallback in Firefox/Safari), making subsequent navigations feel near-instant.

**Why it matters.** Prefetching/prerendering drops perceived LCP and TTFB on navigation toward zero when the next page is already cached, a meaningful perceived-performance win for content sites with heavy internal linking.

**Fix (Astro).**

In astro.config.mjs set prefetch: { prefetchAll: true } (or prefetch: true with per-link data-astro-prefetch). With <ClientRouter /> prefetchAll defaults to true. For full prerender add experimental: { clientPrerender: true } (requires prefetch) and tune eagerness per link (data-astro-prefetch='viewport'|'moderate'|...). Use moderate/conservative on large/dynamic sites; never prerender authenticated or mutation-on-load routes.

**Cloudflare / Vercel.** Works on both Cloudflare Pages and Vercel; for SSR routes on Cloudflare, prerender triggers a real Worker invocation — keep such routes idempotent and watch paid compute.

**How to verify.** Confirm prefetch is not false in astro.config.mjs; in rendered HTML check for data-astro-prefetch attributes (and a <script type=speculationrules> tag in Chromium builds when clientPrerender is on). In DevTools, hovering a link should trigger a low-priority prefetch request.

**Common mistakes.** prefetchAll on a site with thousands of posts (excess bandwidth); prerendering routes that run analytics/session writes or require auth cookies; using 'immediate' eagerness site-wide.

**Sources.** <https://docs.astro.build/en/guides/prefetch/> · <https://docs.astro.build/en/reference/experimental-flags/client-prerender/>

---

## Images & Media

Fast, accessible, indexable media via astro:assets: explicit dimensions, modern formats, responsive srcset, alt text, and correct lazy/eager loading.

### 🔴 Every image has explicit width and height (or aspect-ratio)

`images-explicit-width-height-cls` · **Critical** · stage: `build` · 🤖 automatable · check: `html_element`

**What.** All <img> elements, including those in Markdown/MDX body content, must carry explicit width and height attributes (or an equivalent CSS aspect-ratio) so the browser reserves space before the image loads.

**Why it matters.** Missing intrinsic dimensions are the single largest cause of Cumulative Layout Shift (CLS): the page reflows when each image arrives. CLS is a Core Web Vitals ranking signal and must stay below 0.1.

**Fix (Astro).**

Use <Image /> / <Picture /> from astro:assets — width/height are inferred automatically for local images imported from src/assets/. For remote images, pass explicit width and height props or enable inferSize (Astro 4.4+; requires domain authorization in image.remotePatterns/domains as of 5.17.3+). In Markdown body content, use MDX so you can use the <Image /> component instead of bare ![]() or <img>. Never set CSS width:100% without a matching height or aspect-ratio.

**Cloudflare / Vercel.** No platform difference.

**How to verify.** HTML audit: parse every <img> and assert both width and height attributes are present and numeric (curl -sL <URL> | grep -oP '<img[^>]+>' | grep -v 'width=' should return zero rows). Confirm the Lighthouse 'Image elements do not have explicit width and height' audit passes and CLS < 0.1.

**Common mistakes.** Raw <img> in layouts with no dimensions; CSS width:100% with no aspect-ratio/height; remote images without inferSize and no manual dimensions.

**Sources.** <https://docs.astro.build/en/guides/images/> · <https://web.dev/articles/optimize-cls>

---

### 🟠 Informative images have descriptive alt text; decorative images use alt=""

`images-descriptive-alt-text` · **High** · stage: `build` · 🤖 automatable · check: `html_element`

**What.** Every informative image must have a meaningful, non-empty alt attribute that describes its content/function. Purely decorative images must use alt="" (empty, but present) so assistive tech and crawlers skip them.

**Why it matters.** Alt text is the primary signal Google uses to understand image content for Google Images ranking and accessibility (WCAG). Missing alt hurts a11y and image SEO; alt="" on informative images discards a ranking signal; verbose/keyword-stuffed alt is treated as spam.

**Fix (Astro).**

<Image> from astro:assets requires the alt prop and will error at build if omitted — pass alt={...} with a concise human description, or alt="" explicitly for decorative imagery. Source alt from CMS/frontmatter fields rather than hardcoding when content-driven.

**Cloudflare / Vercel.** No platform difference.

**How to verify.** HTML audit: assert every <img> has an alt attribute (present, including empty), and that informative images (hero/product/inline content) have non-empty alt. Lighthouse 'Image elements have [alt] attributes' audit must pass.

**Common mistakes.** alt='' on informational images; missing alt on bare <img> in Markdown; filename-as-alt or keyword stuffing.

**Sources.** <https://docs.astro.build/en/guides/images/> · <https://developers.google.com/search/docs/appearance/google-images>

---

### 🟠 Below-the-fold images are lazy-loaded with async decoding

`images-lazy-load-below-fold` · **High** · stage: `build` · 🤖 automatable · check: `lighthouse`

**What.** Every image not in the initial viewport must have loading='lazy' (defer the network fetch) and decoding='async' (avoid blocking the main thread during decode).

**Why it matters.** Lazy-loading offscreen images stops the browser from fetching dozens of images at load, reducing initial page weight and freeing bandwidth for the LCP image.

**Fix (Astro).**

Astro's <Image>/<Picture> already apply loading='lazy' and decoding='async' by default — for blog card grids and offscreen content, keep the defaults (do not override to eager). Only the single LCP hero should be overridden to eager.

**Cloudflare / Vercel.** No platform difference.

**How to verify.** Lighthouse 'Defer offscreen images' must pass. HTML check: every <img> except the LCP hero has loading='lazy'.

**Common mistakes.** Setting loading='eager' globally to fix a hero issue and never resetting offscreen images; bare <img> in Markdown body with no loading attribute.

**Sources.** <https://docs.astro.build/en/guides/images/> · <https://web.dev/articles/optimize-lcp>

---

### 🟠 LCP/hero image is eager-loaded with high fetch priority

`images-lcp-eager-priority` · **High** · stage: `build` · 🤖 automatable · check: `lighthouse`

**What.** The largest above-the-fold image (hero/featured) must NOT be lazy-loaded; it should be eager with high fetch priority so the browser discovers and fetches it immediately. Exactly one image per page should get this treatment — the LCP element.

**Why it matters.** Lazy-loading or de-prioritizing the LCP image delays its discovery and significantly worsens LCP, a Core Web Vitals ranking factor (target < 2.5s).

**Fix (Astro).**

Use the stable priority prop (Astro 5.10+): <Image src={hero} alt='...' priority /> — it sets loading='eager', decoding='sync', and fetchpriority='high' together. Apply it to only the one LCP image. Pre-5.10: manually set loading='eager' fetchpriority='high'. Avoid a shared wrapper that forces loading='lazy' on all images without an override for the hero.

**Cloudflare / Vercel.** fetchpriority is a browser hint and behaves identically on Cloudflare Pages and Vercel.

**How to verify.** Run Lighthouse/DevTools Performance, identify the LCP element, and assert it is NOT lazy-loaded and carries fetchpriority='high'; LCP must be < 2.5s. HTML check: the hero <img> has loading != 'lazy' and fetchpriority='high'.

**Common mistakes.** Blanket loading='lazy' via a shared component with no hero override; applying priority to multiple images per page.

**Sources.** <https://docs.astro.build/en/guides/images/> · <https://astro.build/blog/astro-5100/> · <https://web.dev/articles/optimize-lcp>

---

### 🟠 Serve content images as AVIF/WebP with a JPEG/PNG fallback

`images-modern-formats-avif-webp` · **High** · stage: `build` · 🤖 automatable · check: `http_header`

**What.** Content images (especially hero/large images) must be delivered as AVIF (preferred) or WebP rather than raw JPEG/PNG. Use <Picture> listing formats in priority order ['avif','webp'] with a JPEG/PNG fallback for the bare <img>.

**Why it matters.** AVIF is ~50% smaller than JPEG at equal quality and WebP ~25-35% smaller, directly cutting LCP resource-load time and bandwidth. AVIF browser support is ~93-95% as of early 2026 (Chrome 85+, Firefox 93+, Safari 16+); the JPEG/PNG fallback covers pre-iOS-16 devices.

**Fix (Astro).**

<Picture src={img} formats={['avif','webp']} fallbackFormat='jpg' alt='...' /> — Astro's Sharp service generates each format at build time and emits them as <source> elements in order (browser picks the first it supports, so AVIF must be listed first). <Image> alone defaults to WebP single-format. Always import from src/assets/, never serve from public/.

**Cloudflare / Vercel.** Cloudflare Pages static and Vercel static serve build output as-is, so AVIF/WebP must be generated at build time. With the Vercel adapter (SSR), /_vercel/image negotiates AVIF/WebP via the Accept header on demand.

**How to verify.** Crawl all img src/srcset and <source> URLs, send HEAD requests, and assert the Content-Type response header is image/avif or image/webp for large content images. Confirm a <source type='image/avif'> appears first in <picture>. Lighthouse 'Serve images in next-gen formats' must pass.

**Common mistakes.** Listing JPEG before AVIF/WebP in the formats array (browser then always picks JPEG); serving from public/ (no conversion); using <Image> single-format when an AVIF+WebP fallback chain is wanted.

**Sources.** <https://docs.astro.build/en/guides/images/> · <https://caniuse.com/avif> · <https://developers.google.com/search/docs/appearance/google-images>

---

### 🟠 Variable-width images use responsive srcset and accurate sizes

`images-responsive-srcset-sizes` · **High** · stage: `build` · 🤖 automatable · check: `html_element`

**What.** Images that render at different widths across viewports (heroes, blog thumbnails, cards) must ship a srcset with 2-3+ width variants plus a sizes attribute that accurately describes the CSS layout width at each breakpoint, so the browser fetches the smallest adequate image.

**Why it matters.** Serving a 1600px image to a 375px mobile viewport wastes 4-8x bandwidth and directly inflates LCP, where failures are most common. Lighthouse / PageSpeed flag this as 'Properly size images'.

**Fix (Astro).**

Option A (idiomatic, stable since 5.10.0): set a layout attr — <Image layout='constrained' width={800} src={img} alt='...' /> — and enable image.responsiveStyles: true in astro.config.mjs (or set image.layout globally) so Astro auto-generates srcset/sizes and matching CSS. Option B (manual): <Image src={img} widths={[400,800,1200,1600]} sizes='(max-width:768px) 100vw, 800px' alt='...' />. The same widths/sizes props work on <Picture>.

**Cloudflare / Vercel.** Static (Cloudflare/Vercel): srcset entries are hashed build-time assets. Vercel SSR: srcset may use on-demand /_vercel/image?url=...&w=... URLs — ensure the Vercel adapter is installed.

**How to verify.** Parse HTML: assert content images have a srcset with at least 2 width descriptors (e.g. '400w, 800w') and a sizes attribute that is not a blanket '100vw' for non-full-width images. Throttle DevTools to a 375px viewport and confirm the narrowest covering variant is fetched. Lighthouse 'Properly size images' must pass.

**Common mistakes.** widths without an accurate sizes value (over-fetches); sizes='100vw' on a sidebar/card image that only occupies a fraction of the viewport; forgetting that responsiveStyles needs the layout attr to activate.

**Sources.** <https://docs.astro.build/en/guides/images/> · <https://docs.astro.build/en/reference/modules/astro-assets/> · <https://astro.build/blog/astro-5100/>

---

### 🟠 Significant images use <Image>/<Picture> from astro:assets, not bare <img>

`images-use-astro-assets-component` · **High** · stage: `build` · 🤖 automatable · check: `html_element`

**What.** Local and remote content images should be rendered through the Astro <Image> or <Picture> component rather than bare <img> tags. This is the foundation that enables dimension inference, format conversion, responsive srcset, and required alt enforcement.

**Why it matters.** <Image>/<Picture> auto-infer width/height (prevents CLS), generate WebP/AVIF variants and responsive srcset (improves LCP), and enforce an alt attribute. Bare <img> tags and images served from public/ bypass the optimization pipeline entirely and ship the original, unoptimized file.

**Fix (Astro).**

import { Image, Picture } from 'astro:assets' and import local images from src/assets/ (not public/). For remote/CDN images, configure image.domains or image.remotePatterns in astro.config. Use <Image src={img} alt='...' /> for single-format output, <Picture> when you need a multi-format source set.

**Cloudflare / Vercel.** Cloudflare Pages SSR: Sharp is incompatible with the workerd runtime — set the adapter imageService to 'cloudflare-binding' (default on recent adapters) or 'compile'. Vercel adapter auto-configures its image optimization endpoint.

**How to verify.** Build/HTML audit: for content images, assert the rendered src points to an optimized /_astro/ path (static) or the platform optimizer endpoint (e.g. /_vercel/image) rather than a raw /public path, and flag any bare <img> with an original .jpg/.png src in .astro templates.

**Common mistakes.** Using <img src='/photo.jpg'> from public/ which skips Sharp; forgetting to configure remotePatterns for CDN images; using bare <img> in Markdown instead of MDX + <Image>.

**Sources.** <https://docs.astro.build/en/guides/images/> · <https://docs.astro.build/en/reference/modules/astro-assets/>

---

### 🟡 Image filenames are descriptive and kebab-cased

`images-descriptive-filenames` · **Medium** · stage: `pre-launch` · 🤖 automatable · check: `body_regex`

**What.** Image source files must use short, meaningful, hyphen-separated names (e.g. golden-retriever-puppy.webp), not IMG00023.jpg, image1.jpg, or photo_FINAL_v3.jpeg.

**Why it matters.** Google explicitly uses the filename to understand an image's subject for Google Images ranking. Generic names provide no signal; descriptive names reinforce page topic.

**Fix (Astro).**

Rename files in src/assets/ before import. Astro appends a content hash at build (golden-retriever-puppy.Bx9KLmQp.webp) but preserves the descriptive stem, which is what Google reads. For remote/CMS images, ensure descriptive stored filenames or rewrite the URL path; the descriptive name must survive in the ?url= param of any optimizer endpoint.

**Cloudflare / Vercel.** Cloudflare Images and Vercel Image Optimization expose the original URL in the ?url= parameter — that filename is what Google indexes, so it must be descriptive.

**How to verify.** Crawl all img src / source srcset URLs, extract the filename stem (before the hash), and assert it matches /^[a-z][a-z0-9-]{2,}\.(avif|webp|jpg|jpeg|png|svg)$/i and is not a generic token (image, photo, img, banner, hero, pic, untitled, IMG\d+).

**Common mistakes.** Stock-download names (shutterstock_12345.jpg); spaces (become %20); CamelCase; trusting UUID-based CDN slugs.

**Sources.** <https://developers.google.com/search/docs/appearance/google-images>

---

### 🟡 Tune WebP/AVIF quality (≈75-85), never quality 100

`images-quality-tuning` · **Medium** · stage: `build` · 🤖 automatable · check: `lighthouse`

**What.** Set explicit encoder quality for output: WebP ~80 and AVIF ~60-75. Do not ship quality 100, and do not rely on the Sharp AVIF default of 50 for content images (it can show artifacts on text). Quality ~80 is the perceptual sweet spot.

**Why it matters.** Image weight is a top LCP contributor: a 600KB image where 80KB looks identical wastes bandwidth and degrades Core Web Vitals. Lighthouse/PageSpeed flags this as 'Efficiently encode images'.

**Fix (Astro).**

Set codec defaults in astro.config.mjs: image: { service: { entrypoint: 'astro/assets/services/sharp', config: { webp: { quality: 80 }, avif: { quality: 65 } } } }. Override per image with the quality prop: <Image src={img} quality={85} alt='...' />. Do NOT reference squooshImageService() — Squoosh was deprecated in Astro 4.14 and removed in Astro 5.0 and will break the build; use the default Sharp service.

**Cloudflare / Vercel.** Vercel Image Optimization defaults to q=75 in /_vercel/image URLs; Cloudflare Polish applies its own quality reduction. Astro Sharp defaults: WebP 80, AVIF 50.

**How to verify.** Lighthouse 'Efficiently encode images' must report 0 violations (estimated savings < ~100KB). Spot-check built files: ls -la dist/_astro/*.webp dist/_astro/*.avif — a ~1200px WebP hero should land roughly in 50-150KB and content images stay under ~200KB.

**Common mistakes.** Leaving Sharp's AVIF default of 50 for content/text images; setting quality=100 for 'max quality'; using the removed squooshImageService().

**Sources.** <https://docs.astro.build/en/reference/modules/astro-assets/> · <https://sharp.pixelplumbing.com/api-output/> · <https://github.com/withastro/astro/pull/11780>

---

### 🟡 Image sitemap entries for key content images

`images-sitemap-entries` · **Medium** · stage: `pre-launch` · 🤖 automatable · check: `sitemap`

**What.** The XML sitemap includes <image:image> child elements (via the xmlns:image extension) for pages with indexable, SEO-significant images (hero, product, gallery), each with at least <image:loc> and ideally <image:title>.

**Why it matters.** Google Image Search is a meaningful secondary traffic source. Image sitemap entries help Googlebot discover images it may miss during crawl (e.g. lazily/JS-loaded) and improve image indexing eligibility.

**Fix (Astro).**

@astrojs/sitemap does not emit <image:image> automatically. Add a custom endpoint at src/pages/sitemap-images.xml.ts: iterate getCollection('blog'), read each entry's heroImage, and emit an <image:image><image:loc>...</image:loc><image:title>...</image:title></image:image> nested in the parent <url>. Declare xmlns:image='http://www.google.com/schemas/sitemap-image/1.1' and return Content-Type: application/xml. Submit it in Search Console.

**Cloudflare / Vercel.** No platform-specific caveats; submit the image sitemap URL separately in Google Search Console.

**How to verify.** GET /sitemap-images.xml, parse as XML, and assert: the xmlns:image namespace is declared; at least one <image:image> per content page; every <image:loc> is an absolute HTTPS URL; <image:title> is non-empty. Confirm no parse errors in GSC Sitemaps.

**Common mistakes.** Omitting the xmlns:image declaration (invalid sitemap); listing images blocked by robots.txt; including cross-domain images without a Sitemap declaration on that domain; including decorative images.

**Sources.** <https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps> · <https://docs.astro.build/en/guides/integrations-guide/sitemap/>

---

## URLs, Redirects & i18n

A clean, canonical, non-duplicating URL surface: canonical tags, www/HTTPS/trailing-slash redirects, parameter handling, and hreflang.

### 🔴 Canonical pages are not blocked in robots.txt

`urls-canonical-not-blocked-by-robots` · **Critical** · stage: `pre-launch` · 🤖 automatable · check: `robots`

**What.** No URL declared as a canonical (via rel=canonical or sitemap <loc>) is matched by a robots.txt Disallow rule.

**Why it matters.** If a canonical URL is blocked in robots.txt, Googlebot cannot fetch the page to read its canonical tag and the page is dropped from the index. This is one of the most damaging and hard-to-diagnose misconfigurations.

**Fix (Astro).**

Verify public/robots.txt (copied verbatim into the build) contains no Disallow that covers indexable canonical pages. The classic failure is a leftover `Disallow: /` from staging/development reaching production.

**How to verify.** GET /robots.txt, parse Disallow rules, and for each canonical URL in the sitemap assert it is NOT matched by any Disallow rule (use a parser such as the `robots-parser` npm package). Flag any `Disallow: /`.

**Common mistakes.** Deploying a staging `Disallow: /`; adding `Disallow: /blog/` to hide drafts but blocking published posts too.

**Sources.** <https://developers.google.com/search/docs/crawling-indexing/robots/intro> · <https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls>

---

### 🔴 Multilingual pages carry complete, reciprocal hreflang annotations with x-default

`urls-hreflang-annotations` · **Critical** · stage: `pre-launch` · 🤖 automatable · check: `html_head`

**What.** Every localized page includes <link rel="alternate" hreflang="xx"> for all language variants (including a self-referencing one) plus one hreflang="x-default"; all hrefs are absolute HTTPS URLs that return 200 (no redirects), annotations are bidirectional, and the page's canonical is self-referencing (per-locale), not pointing at the default-locale page.

**Why it matters.** Without complete hreflang Google may serve the wrong language or collapse variants as duplicates. Missing reciprocity, relative/protocol-relative hrefs, hrefs that 301, or a canonical pointing to a different locale all cause Google to ignore the annotations entirely.

**Fix (Astro).**

Set `site` in astro.config.mjs, then in the shared layout loop over i18n.locales using `getAbsoluteLocaleUrl(locale, Astro.url.pathname)` from astro:i18n to emit every alternate plus x-default (`getAbsoluteLocaleUrl(i18n.defaultLocale, path)`); the shared-layout loop guarantees reciprocity. Keep canonical self-referencing via `new URL(Astro.url.pathname, Astro.site).href`. Note getAbsoluteLocaleUrl returns a relative URL if `site` is unset.

**How to verify.** GET each localized page: assert hreflang tags exist for every configured locale + x-default, all hrefs are absolute https://, each href GETs to 200 (not 3xx), and the canonical equals the page's own locale URL. For each referenced URL, fetch it and assert a reciprocal hreflang back to the original.

**Common mistakes.** hreflang only on the default locale; missing self/x-default; using getRelativeLocaleUrl or protocol-relative (//example.com/fr); hreflang href that 301-redirects; a layout that strips the locale from the canonical so all pages canonicalize to the default locale.

**Sources.** <https://developers.google.com/search/docs/specialty/international/localized-versions> · <https://docs.astro.build/en/guides/internationalization/> · <https://docs.astro.build/en/reference/modules/astro-i18n/>

---

### 🔴 All HTTP traffic redirects to HTTPS with a 301/308

`urls-http-to-https-redirect` · **Critical** · stage: `pre-launch` · 🤖 automatable · check: `redirect`

**What.** Every HTTP (port 80) request is permanently redirected to its HTTPS equivalent.

**Why it matters.** HTTP and HTTPS versions are distinct URLs; without enforcement, link equity and crawl signals split across them. HTTPS is also a (minor) confirmed ranking signal.

**Fix (Astro).**

Handled at the hosting layer. Both Cloudflare Pages and Vercel enforce HTTPS redirects automatically for custom domains. Verify a custom _redirects rule or upstream reverse proxy is not bypassing it.

**Cloudflare / Vercel.** Automatic on both Cloudflare Pages and Vercel for custom domains; if a custom proxy sits in front, configure HTTPS enforcement there.

**How to verify.** GET http://example.com/ over plain HTTP -> assert status 301/308 with Location `https://example.com/`.

**Common mistakes.** A reverse proxy/load balancer that terminates TLS and serves HTTP without redirecting; a misconfigured _redirects rule overriding the platform default.

**Sources.** <https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls>

---

### 🔴 No redirect loops

`urls-no-redirect-loops` · **Critical** · stage: `pre-launch` · 🤖 automatable · check: `redirect`

**What.** No URL redirects to itself or forms a cycle (A -> B -> A).

**Why it matters.** Redirect loops return ERR_TOO_MANY_REDIRECTS to users and crawlers, making pages completely inaccessible.

**Fix (Astro).**

Avoid stacking conflicting redirect layers. The classic cause is Cloudflare 'Always Use HTTPS' plus a redundant HTTP->HTTPS rule in _redirects, or a www<->apex rule duplicated across dashboard Redirect Rules and _redirects, or a Cloudflare proxy in front of Vercel with both enforcing HTTPS. Consolidate to a single redirect layer.

**Cloudflare / Vercel.** Most common on Cloudflare Pages combining multiple redirect mechanisms, and on a Cloudflare-proxy-in-front-of-Vercel setup.

**How to verify.** curl -L --max-redirs 20 -o /dev/null -w '%{http_code}' https://example.com/ -> if curl aborts with 'Too many redirects', a loop exists. Repeat starting from http:// and from the www host.

**Common mistakes.** Double HTTPS enforcement (Cloudflare 'Always Use HTTPS' + a Vercel/Cloudflare proxy redirect); trailing-slash rules layered on top of platform defaults.

**Sources.** <https://vercel.com/kb/guide/resolve-err-too-many-redirects-when-using-cloudflare-proxy-with-vercel>

---

### 🔴 Redirects are real HTTP 301/308, never HTML meta-refresh

`urls-redirects-are-http-not-meta-refresh` · **Critical** · stage: `build` · 🤖 automatable · check: `redirect`

**What.** All permanent redirects are served as HTTP 301 (or 308 for non-GET) responses, not HTML <meta http-equiv="refresh"> stubs. Critically, Astro's `redirects` config produces server-side 301s ONLY when an SSR/platform adapter is active; in static output without an adapter it generates meta-refresh HTML files.

**Why it matters.** Meta-refresh transfers far less link equity than an HTTP 301, can be treated as a soft 404, and delays users. This is the single most common Astro redirect foot-gun.

**Fix (Astro).**

SSR with @astrojs/cloudflare or @astrojs/vercel: astro.config.mjs `redirects: { '/old': '/new' }` is translated to real HTTP 301/308. Static output without an adapter: do NOT rely on astro.config redirects for SEO-critical moves; instead use public/_redirects (Cloudflare, append `301`) or vercel.json `redirects` (Vercel). Optionally set `build: { redirects: false }` to stop Astro emitting meta-refresh stubs that duplicate your platform rules.

**Cloudflare / Vercel.** Cloudflare Pages: _redirects applies to static assets only and is bypassed under SSR. Vercel: @astrojs/vercel adapter translates config redirects to HTTP redirects in SSR; static mode needs explicit vercel.json.

**How to verify.** For every defined redirect: `curl -sI https://example.com/old` -> assert status 301/308 with correct Location and NO HTML body. If a 200 with a body is returned, grep the body for `<meta http-equiv="refresh"` indicating a static meta-refresh stub.

**Common mistakes.** Assuming astro.config.mjs redirects always emit 301s (they do not without an adapter); on Cloudflare Pages SSR, _redirects is bypassed for routes served by Pages Functions so redirects must be handled in middleware/Worker code.

**Sources.** <https://docs.astro.build/en/guides/routing/> · <https://developers.cloudflare.com/pages/configuration/redirects/> · <https://vercel.com/docs/routing/redirects>

---

### 🔴 Self-referencing canonical tag on every page

`urls-self-referencing-canonical` · **Critical** · stage: `build` · 🤖 automatable · check: `html_head`

**What.** Every HTML page includes exactly one <link rel="canonical"> in <head> whose href is an absolute HTTPS URL pointing to that page's own preferred URL (correct scheme, host, and trailing-slash form), with query strings stripped.

**Why it matters.** Canonicals are the baseline defense against duplicate content from trailing-slash, www/non-www, http/https, and parameter variants. Without one, Google picks a canonical from internal links and sitemaps and may choose a URL you do not want, splitting link equity.

**Fix (Astro).**

In your base layout (e.g. src/layouts/BaseHead.astro) add `<link rel="canonical" href={new URL(Astro.url.pathname, Astro.site).href} />`. Using `.pathname` (not `Astro.url.href`) keeps the URL absolute via Astro.site and automatically drops query parameters. Set `site` in astro.config.mjs to the production domain. For dynamic routes with a different preferred URL, pass an explicit canonical prop. Paginated pages should self-canonicalize (page 2 -> page 2), not all point to page 1.

**Cloudflare / Vercel.** Ensure Astro `site` uses the production custom domain, not the *.pages.dev (Cloudflare) or *.vercel.app (Vercel) preview URL.

**How to verify.** GET each sampled page, parse <head>: assert exactly one <link rel="canonical"> exists, its href matches `^https://`, contains no `?`, and equals the page's own served URL byte-for-byte (including trailing-slash form). `curl -s https://example.com/about/ | grep 'rel="canonical"'` should return the exact self URL.

**Common mistakes.** Using Astro.url.href or Astro.request.url (includes query/UTM params in SSR); relative hrefs; setting canonical via client-side JS so it is absent in pre-rendered HTML; canonical left pointing at a *.pages.dev / *.vercel.app preview or staging domain; pointing all paginated pages to page 1.

**Sources.** <https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls> · <https://docs.astro.build/en/reference/configuration-reference/> · <https://joost.blog/astro-seo-complete-guide/>

---

### 🔴 Trailing-slash policy is consistent across Astro config, platform, canonicals, and links

`urls-trailing-slash-consistency` · **Critical** · stage: `pre-launch` · 🤖 automatable · check: `redirect`

**What.** A page is reachable at only one trailing-slash form: the other 301/308-redirects to it. Astro `trailingSlash` and `build.format` align with the host's serving behavior, and canonicals, sitemap <loc>, and internal links all use that same form.

**Why it matters.** Dual-URL access (/about and /about/) is duplicate content. Misalignment causes 308 redirect loops on Cloudflare or silent dual-200 serving on Vercel, and a build.format/trailingSlash mismatch makes canonicals point to a different URL than the one served, splitting equity.

**Fix (Astro).**

Cloudflare Pages no-slash sites: `build: { format: 'file' }` + `trailingSlash: 'never'` (serves /about.html as /about with no redirect; the default 'directory' format 308-redirects /about -> /about/). Vercel: set `trailingSlash` explicitly (true or false, never undefined) in vercel.json AND a matching Astro `trailingSlash` — leaving vercel.json undefined serves both forms at 200. Note: with format 'file', Astro.url.pathname includes `.html`, which must be stripped when building canonicals.

**Cloudflare / Vercel.** Cloudflare Pages: 'directory' format always 308-redirects to trailing-slash; 'file' serves clean no-slash URLs. Vercel default (undefined trailingSlash) serves both forms without redirect.

**How to verify.** GET /about AND GET /about/ -> exactly one returns 200, the other 301/308 to the canonical form; both must never be 200. Then confirm the canonical href, sitemap <loc>, and internal hrefs all match that form.

**Common mistakes.** Leaving trailingSlash undefined in vercel.json (dual 200s); `trailingSlash:'never'` with default `build.format:'directory'` on Cloudflare (extra 308 hop); hardcoded internal links without the trailing slash while canonicals have it. Astro v5 has documented edge cases (GitHub issue #12833) between trailingSlash/build.format/Astro.url — verify against actual dist output, not config alone.

**Sources.** <https://realmorrisliu.com/thoughts/fixing-astro-seo-cloudflare-trailing-slash/> · <https://mirzapandzo.com/astro-vercel-trailingslash-and-redirects> · <https://vercel.com/docs/project-configuration/vercel-json>

---

### 🔴 www and non-www redirect to a single canonical domain

`urls-www-nonwww-single-domain` · **Critical** · stage: `pre-launch` · 🤖 automatable · check: `redirect`

**What.** Exactly one of https://example.com or https://www.example.com serves content (200); the other 301/308-redirects to it for all paths, and Astro `site` matches the chosen form.

**Why it matters.** Googlebot treats www and non-www as separate hosts. Serving identical content on both is site-wide duplicate content that splits PageRank across two domains.

**Fix (Astro).**

This is a platform/DNS concern, not Astro config. Cloudflare Pages: `public/_redirects` is path-only and cannot match by hostname, so configure a dashboard Redirect Rule (or Bulk Redirect) for the www->apex (or apex->www) redirect. Vercel: add both domains in Project Settings > Domains and mark one primary; Vercel issues the redirect (308) automatically. Ensure Astro `site` uses the canonical form.

**Cloudflare / Vercel.** Cloudflare Pages: use dashboard Redirect Rules (not _redirects) for host-based www<->apex. Vercel: handled in Settings > Domains primary-domain selection.

**How to verify.** curl -I against the non-preferred host -> assert 301/308 with a Location header pointing to the canonical host. GET the preferred host -> assert 200. Verify a subpath redirects too, not just the homepage.

**Common mistakes.** Both variants serving 200 with no redirect; redirecting only the homepage; using 302 instead of 301/308; trying to do www->apex in Cloudflare _redirects (host matching is unsupported there).

**Sources.** <https://developers.cloudflare.com/pages/configuration/redirects/> · <https://vercel.com/docs/routing/redirects> · <https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls>

---

### 🟠 Canonical tags do not chain (A -> B -> C)

`urls-canonical-no-chain` · **High** · stage: `pre-launch` · 🤖 automatable · check: `body_regex`

**What.** If page A canonicalizes to B, page B must canonicalize to itself, not to a third URL. No canonical chains.

**Why it matters.** Google may not fully resolve canonical chains, leaving ranking signals diluted or the wrong page indexed. Chains typically emerge when a CMS slug changes but the old canonical is not updated.

**Fix (Astro).**

Audit at build time: crawl all pages, map each page's URL to its declared canonical, then verify the canonical target's own canonical points to itself. Update stale CMS canonicals and remove canonicals imported from an originating domain.

**How to verify.** For each page, read its canonical URL, GET that URL, read its canonical, and assert the second canonical equals itself (no second hop).

**Common mistakes.** Renaming a slug without updating its canonical; importing content with pre-set canonicals pointing to the original domain.

**Sources.** <https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls>

---

### 🟠 Canonical, sitemap <loc>, and internal links use one identical URL form

`urls-canonical-sitemap-link-consistency` · **High** · stage: `pre-launch` · 🤖 automatable · check: `sitemap`

**What.** For each page, the rel=canonical href, the sitemap <loc>, and every internal <a href> pointing to it are byte-for-byte identical (same scheme, host, case, and trailing-slash form).

**Why it matters.** Inconsistent signals act as votes against your intended canonical and can invalidate the sitemap submission. @astrojs/sitemap derives URLs from Astro.site, build.format, and trailingSlash, so these must match the canonical and link conventions used in layouts.

**Fix (Astro).**

Use a single site-wide href helper (e.g. built from `new URL(path, Astro.site)`) with one trailing-slash convention matching `trailingSlash` in astro.config.mjs, and let @astrojs/sitemap use the same Astro.site/build.format settings.

**How to verify.** For a sample of pages, fetch /sitemap-0.xml (or sitemap-index), the page's canonical, and the inbound internal link hrefs, and assert all three strings are identical.

**Common mistakes.** Trailing slashes in nav links but not in the sitemap; sitemap using http:// while canonical uses https://; inconsistent www prefix.

**Sources.** <https://docs.astro.build/en/guides/integrations-guide/sitemap/> · <https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls>

---

### 🟠 hreflang language/region codes are valid BCP 47 (ISO 639-1 + ISO 3166-1 Alpha-2)

`urls-hreflang-language-codes` · **High** · stage: `pre-launch` · 🤖 automatable · check: `html_attribute`

**What.** Every hreflang value uses a valid ISO 639-1 language code, optionally combined with a valid ISO 3166-1 Alpha-2 region (e.g. en, en-US, en-GB, zh-CN), plus x-default. Non-standard codes are not used.

**Why it matters.** Google silently ignores invalid or non-BCP 47 codes; en-UK (correct: en-GB) and es-419 (unsupported by Google) are common mistakes that break the whole annotation set.

**Fix (Astro).**

Use correct locale codes in astro.config.mjs i18n.locales and as the @astrojs/sitemap i18n `locales` map values (e.g. `{ en: 'en-US', fr: 'fr-FR' }`), keeping the keys matched to Astro's i18n.locales.

**How to verify.** Parse all hreflang attribute values across pages and validate each against BCP 47 / ISO 639-1 + ISO 3166-1; flag uk (use en-GB), cz (use cs), cn (use zh-CN), and es-419 (unsupported).

**Common mistakes.** en-UK instead of en-GB; bare pt/zh where pt-BR/pt-PT or zh-Hans/zh-Hant is meant; es-419.

**Sources.** <https://developers.google.com/search/docs/specialty/international/localized-versions> · <https://backlinko.com/hreflang-tag>

---

### 🟠 i18n prefixDefaultLocale and root-URL behavior are configured correctly

`urls-i18n-routing-and-root` · **High** · stage: `pre-launch` · 🤖 automatable · check: `redirect`

**What.** i18n.routing.prefixDefaultLocale matches the intended URL structure, and the root URL `/` either serves the default-locale homepage (200) or 301/302-redirects to a working default-locale URL.

**Why it matters.** A mismatched prefix generates default-locale pages at the wrong paths, breaking canonicals, hreflang hrefs, and navigation. A root `/` that 404s or is blank is a critical crawlability and usability failure.

**Fix (Astro).**

With prefixDefaultLocale:false (default), the default locale serves at /about and `/` works with no extra config. With prefixDefaultLocale:true, the default locale lives at /en/about and you must ALSO set redirectToDefaultLocale:true to make `/` redirect to /en/ — it defaults to false, so otherwise `/` just renders src/pages/index.astro. Add redirects if you change this structure after launch.

**How to verify.** GET / -> assert 200 (content) or 301/302 to a locale prefix that returns 200. If prefixDefaultLocale:false, GET /en/about -> assert 404 or redirect to /about and GET /about -> 200.

**Common mistakes.** Expecting prefixDefaultLocale:true to auto-redirect `/` to /en/ without redirectToDefaultLocale:true; switching the prefix setting post-launch without adding old->new redirects.

**Sources.** <https://docs.astro.build/en/guides/internationalization/>

---

### 🟠 No redirect chains; every redirect resolves in one hop

`urls-no-redirect-chains` · **High** · stage: `pre-launch` · 🤖 automatable · check: `redirect`

**What.** No URL requires more than one redirect hop to reach its final destination; A -> B -> C chains are collapsed to A -> C.

**Why it matters.** Each hop adds latency (extra round-trip, hurting LCP/TTFB), dilutes link-equity transfer, and Googlebot stops after ~10 hops. Chains commonly arise when an old redirect's target is later moved again, or when HTTP->HTTPS and www->apex rules compound.

**Fix (Astro).**

When adding a redirect in astro.config redirects, _redirects, or vercel.json, point each source directly at the final URL and confirm the destination is not itself a redirect source. Neither platform flattens chains automatically.

**Cloudflare / Vercel.** Cloudflare _redirects and Vercel vercel.json both process rules without collapsing chains.

**How to verify.** For each redirect source: `curl -L --max-redirs 10 -w '%{num_redirects}' -o /dev/null https://example.com/old` -> assert num_redirects == 1 (a single 3xx then 200).

**Common mistakes.** Adding /old -> /interim when /interim already redirects to /final; HTTP->HTTPS plus www->apex compounding into two hops.

**Sources.** <https://www.rankability.com/ranking-factors/google/redirect-chains/> · <https://vercel.com/docs/routing/redirects> · <https://developers.cloudflare.com/pages/configuration/redirects/>

---

### 🟠 Session tokens, user IDs, and auth tokens never appear in indexable URLs

`urls-no-session-tokens` · **High** · stage: `pre-launch` · 🤖 automatable · check: `body_regex`

**What.** No indexable URL contains session IDs (?PHPSESSID=, ?sid=), auth/preview tokens, or personal identifiers as query parameters.

**Why it matters.** Session-parameterized URLs create infinite crawl space, waste crawl budget, and leak security-sensitive identifiers into logs and referrer headers.

**Fix (Astro).**

Astro SSR pages should carry session state in cookies, not URL params. Verify no middleware injects session/preview parameters into page URLs, and keep CMS preview-token URLs out of production output.

**How to verify.** Crawl the sitemap and internal links and assert no URL matches `sid=`, `session=`, `token=`, `auth=`, or `PHPSESSID=`.

**Common mistakes.** CMS preview tokens leaking into production URLs; OAuth callback URLs getting indexed.

**Sources.** <https://devdreaming.com/blogs/seo-friendly-urls-developer-guide-2025>

---

### 🟠 Renamed or removed pages 301-redirect, not 404

`urls-old-urls-redirect-not-404` · **High** · stage: `pre-launch` · 👤 manual · check: `manual`

**What.** Any URL previously indexed or linked that has moved or been deleted 301-redirects to the most relevant current page rather than returning 404.

**Why it matters.** 404s on previously indexed pages forfeit accumulated link equity and rankings. Google recommends keeping 301s in place for at least a year after a URL change.

**Fix (Astro).**

Maintain a redirect map (astro.config.mjs redirects with an adapter, public/_redirects on Cloudflare, or vercel.json on Vercel). Reconcile regularly against Google Search Console's Not Found (404) report. Remember static-without-adapter config redirects emit meta-refresh, not 301s.

**How to verify.** Pull GSC Coverage > Not Found; for each 404 URL determine if it was previously in the sitemap or has inbound links, and flag any lacking a redirect. (Discovery of which old URLs mattered requires human/GSC judgment.)

**Common mistakes.** Relying on astro.config redirects in a static build without an adapter (meta-refresh, not 301); deleting content with no redirect plan.

**Sources.** <https://victorious.com/blog/301-redirects/> · <https://randomgeekery.org/post/2025/01/server-side-redirects-in-astro-ssg-mode/>

---

### 🟠 Tracking, filter, sort, and UI-state parameter URLs are not indexed as duplicates

`urls-parameters-handled` · **High** · stage: `pre-launch` · 🤖 automatable · check: `body_regex`

**What.** Pages reachable via query parameters that duplicate content (?utm_*, ?gclid, ?fbclid, ?sort=, ?color=, ?print=true, ?modal=open, ?sessionid=) carry a canonical pointing to the param-clean base URL, and no parameterized URLs appear in the sitemap.

**Why it matters.** Parameter variants are treated as separate URLs; without a clean canonical, Googlebot crawls all variants, wastes crawl budget, splits ranking signals, and inflates indexed-page counts in Search Console.

**Fix (Astro).**

Build the canonical from `new URL(Astro.url.pathname, Astro.site).href`, which drops all query strings by design — never use Astro.url.href. Do not emit parameterized URLs in social/share <link>/<a> tags or in the sitemap. For pagination, give numbered pages their own real paths (/blog/2/) each self-canonicalizing (Google dropped rel=next/prev support in 2019).

**How to verify.** GET a page with `?utm_source=test&sort=price` -> assert the canonical href has no `?`. Fetch the sitemap and assert no <loc> contains `utm_`, `gclid`, `fbclid`, `sid=`, or other params.

**Common mistakes.** Setting canonical from Astro.url.href (carries the incoming query string in SSR, e.g. when QA opens a UTM share link); sharing modal/print URLs via social meta tags.

**Sources.** <https://developers.google.com/search/docs/crawling-indexing/canonicalization> · <https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls>

---

### 🟠 Redirect type matches intent: 301/308 for permanent, 302/307 for temporary

`urls-redirect-type-correct` · **High** · stage: `pre-launch` · 🤖 automatable · check: `redirect`

**What.** Permanent URL changes return 301 (or 308 for non-GET); only genuinely temporary cases (A/B tests, maintenance, transient locale detection) return 302/307.

**Why it matters.** 302/307 do not pass PageRank or update Googlebot's indexed URL, so a permanent move using 302 leaves the old URL indexed and equity untransferred. Both 301 and 308 are valid permanent redirects.

**Fix (Astro).**

Cloudflare _redirects: append explicit `301`. Vercel vercel.json: `"permanent": true` produces 308 (NOT 301); use `"statusCode": 301` if you specifically need 301. Astro SSR redirects default GET redirects to 301.

**Cloudflare / Vercel.** Vercel `permanent: true` = 308 (per current Vercel docs); both 301 and 308 pass link equity in Google.

**How to verify.** For each redirect: assert status is in {301, 308} for permanent moves and only in {302, 307} for explicitly temporary ones.

**Common mistakes.** Using 302 for a permanent move; not realizing Vercel `permanent: true` = 308.

**Sources.** <https://www.hikeseo.co/learn/technical/301-vs-302-redirects> · <https://vercel.com/docs/redirects/configuration-redirects>

---

### 🟠 @astrojs/sitemap emits hreflang xhtml:link entries consistent with the HTML

`urls-sitemap-hreflang-consistent` · **High** · stage: `build` · 🤖 automatable · check: `sitemap`

**What.** On multilingual sites the generated sitemap includes <xhtml:link rel="alternate" hreflang> entries grouping all language variants per page, and (if hreflang is also in HTML) the URLs and language codes in both implementations are identical.

**Why it matters.** The sitemap is an additional hreflang signal, important for large sites not fully crawled via internal links. Contradictory values between HTML and sitemap confuse Google's consolidation logic.

**Fix (Astro).**

Pass a matching i18n option to the sitemap integration: `sitemap({ i18n: { defaultLocale: 'en', locales: { en: 'en-US', fr: 'fr-FR' } } })`, with `locales` keys matching astro.config i18n.locales exactly. If also rendering hreflang in the layout, build both from getAbsoluteLocaleUrl on the same Astro.site base with the same locale codes.

**How to verify.** GET /sitemap-0.xml; for a multilingual page assert child <xhtml:link rel="alternate" hreflang> elements cover all locales, then compare that set (URLs + lang codes) against the page's HTML hreflang set and assert equality.

**Common mistakes.** Configuring Astro i18n but forgetting the i18n option inside the sitemap() call; mismatched locale key names; fr-CA in HTML vs fr in the sitemap.

**Sources.** <https://docs.astro.build/en/guides/integrations-guide/sitemap/> · <https://developers.google.com/search/docs/specialty/international/localized-versions>

---

### 🟠 URL slugs are lowercase, hyphen-separated, and free of special characters

`urls-slug-hygiene` · **High** · stage: `build` · 🤖 automatable · check: `body_regex`

**What.** Path segments contain only [a-z0-9-/]: all lowercase, hyphens (not underscores) between words, no spaces, no special/non-ASCII characters, and no double slashes (//). Mixed-case URLs 301-redirect to their lowercase form.

**Why it matters.** Servers and Google treat /About and /about as different URLs (Vercel's CDN is explicitly case-sensitive), and Google reads underscores as part of a word but hyphens as word separators, affecting keyword tokenization. Special characters, %20-spaces, and // create unreliable, duplicate, or broken URLs.

**Fix (Astro).**

Name all files/folders in src/pages/ lowercase with hyphens. For CMS slugs normalize: `slug.toLowerCase().replace(/_/g,'-').replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'')`; transliterate diacritics first (e.g. slugify). Build URLs with `new URL(path, Astro.site)` rather than string concatenation to avoid `https://example.com//slug`.

**Cloudflare / Vercel.** Vercel CDN is case-sensitive (no auto-lowercasing) but auto-normalizes consecutive slashes with a 308; Cloudflare Pages does neither — so // risk is a real duplicate on Cloudflare and a redirect-overhead cost on Vercel.

**How to verify.** Crawl sitemap and build output and assert each path segment matches `^[a-z0-9-]+$` (no uppercase, underscore, space, special char, or //). Exclude Astro system paths such as `_astro/`, `_image`, `_actions/`. `find dist/ -name '*.html' | grep -E '[A-Z]'` should return nothing.

**Common mistakes.** snake_case or mixed-case slugs from a headless CMS used unnormalized; component-style filenames like BlogPost.astro producing /BlogPost; concatenating Astro.site (which ends in /) with a leading-slash path producing //.

**Sources.** <https://developers.google.com/search/docs/crawling-indexing/url-structure> · <https://vercel.com/docs/redirects> · <https://devdreaming.com/blogs/seo-friendly-urls-developer-guide-2025>

---

### 🟡 Internal links point directly to final canonical URLs (no internal redirects)

`urls-internal-links-no-redirect` · **Medium** · stage: `pre-launch` · 🤖 automatable · check: `http_status`

**What.** Every internal <a href> resolves with a 200 directly, never through a 301/302 hop.

**Why it matters.** Linking through redirects wastes link equity, adds navigation latency, and signals a stale internal link graph to crawlers.

**Fix (Astro).**

After any slug rename, find-replace all internal hrefs in .astro and markdown/content files to the new URL. For i18n links use Astro's getRelativeLocaleUrl / getAbsoluteLocaleUrl rather than hardcoding paths.

**How to verify.** Crawl internal links recursively from the homepage; issue a HEAD request for each href and assert status 200 (not 3xx). Report every internal link that redirects.

**Common mistakes.** Renaming a slug in getStaticPaths without updating the links that point to it.

**Sources.** <https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls>

---

### ⚪ Localized SSR pages set a Content-Language response header

`urls-content-language-header-ssr` · **Low** · stage: `pre-launch` · 🤖 automatable · check: `http_header`

**What.** For SSR (output: 'server') Astro sites, localized pages return a Content-Language HTTP header matching the page locale (e.g. Content-Language: fr).

**Why it matters.** A very weak signal with no evidence of direct ranking impact; useful for proxy/CDN caching decisions and HTTP client clarity. Far less important than hreflang and not achievable for static output.

**Fix (Astro).**

In Astro SSR middleware or a route handler: `return new Response(html, { headers: { 'Content-Language': Astro.currentLocale ?? 'en' } })`. Only applies with a server adapter.

**Cloudflare / Vercel.** Set in middleware/Edge function on both Cloudflare Pages SSR and Vercel SSR adapters.

**How to verify.** For SSR deployments only: GET /fr/about -> assert response header `Content-Language: fr`.

**Common mistakes.** Treating this as a meaningful ranking factor; attempting it on a static build where it does not apply.

**Sources.** <https://docs.astro.build/en/guides/internationalization/>

---

### ⚪ URLs are short, descriptive, keyword-relevant, and shallow

`urls-descriptive-readable-slugs` · **Low** · stage: `build` · 👤 manual · check: `manual`

**What.** Slugs describe the content in human-readable, keyword-relevant terms (no bare DB IDs or UUIDs), stay roughly under 75 characters (under 100 for SERP display), and sit no more than ~4 path segments deep from root.

**Why it matters.** Descriptive, concise URLs improve click-through and shareability and are a minor relevance signal; deep URLs reduce crawl discovery and priority. URL length itself is not a confirmed ranking factor (per John Mueller) — long URLs are just truncated in SERPs.

**Fix (Astro).**

In content collections, define an intentional `slug` field (not the auto-incremented ID) and keep it to the 3-5 most meaningful words. Avoid nesting categories beyond 3-4 levels (prefer /blog/category/slug over /blog/year/month/day/slug).

**How to verify.** Crawl the sitemap: programmatically flag URLs over 75/100 chars, URLs with more than 4 path segments, and `?id=\d+` or UUID-only segments; then human-review a sample of 10-20 (title, slug) pairs for keyword relevance.

**Common mistakes.** Using numeric CMS IDs as the route param; mirroring the full verbose title (with stop words) as the slug; deep date-based blog nesting.

**Sources.** <https://www.octaria.com/blog/seo-friendly-url-structure-best-practices-2025> · <https://www.collaborada.com/blog/does-url-length-affect-seo-google-says-no>

---

## Accessibility & Mobile UX

Inclusive, mobile-friendly markup that overlaps strongly with quality/UX signals: landmarks, headings, contrast, focus, labels, and tap targets.

### 🔴 Set a valid lang attribute on the root html element

`accessibility-html-lang-valid` · **Critical** · stage: `pre-launch` · 🤖 automatable · check: `html_element`

**What.** The root <html> element must carry a valid BCP 47 language tag (e.g. lang="en" or lang="en-US"), matching the page's actual content language.

**Why it matters.** Missing or wrong lang is a WCAG 3.1.1 (Level A) failure flagged as critical by axe and Lighthouse (html-has-lang, valid-lang). Screen readers pick their pronunciation engine from lang, and search engines use it for geo/language targeting.

**Fix (Astro).**

Set lang on <html> in your base layout: <html lang="en">. For multilingual sites, inject the locale with a fallback because Astro.currentLocale can return undefined on SSG index routes (issue #14228): <html lang={Astro.currentLocale ?? 'en'}>. Build the site and check the emitted HTML, not just the dev server.

**How to verify.** GET each page's HTML, parse <html lang="...">, assert the attribute exists and matches /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/. axe-core rules html-has-lang and valid-lang automate this. Spot-check multiple locale routes in the built output.

**Common mistakes.** Empty lang="", a non-BCP-47 value, hard-coding "en" on non-English pages, or relying on Astro.currentLocale with no fallback on SSG index routes.

**Sources.** <https://dequeuniversity.com/rules/axe/4.7/html-has-lang> · <https://docs.astro.build/en/guides/internationalization/> · <https://github.com/withastro/astro/issues/14228>

---

### 🔴 Every image has alt text (descriptive for content, empty for decorative)

`accessibility-image-alt-text` · **Critical** · stage: `pre-launch` · 🤖 automatable · check: `html_attribute`

**What.** Every <img> must have an alt attribute. Content images need concise, descriptive text (roughly 5-125 chars) describing what the image shows in context. Purely decorative images must use alt="" (explicit empty string, never a missing attribute or a space).

**Why it matters.** WCAG 1.1.1 Non-text Content (Level A); Lighthouse image-alt is weight 10. Google uses alt text as a primary image-understanding signal for Google Images. WebAIM consistently finds missing alt as the most common failure.

**Fix (Astro).**

Astro's <Image /> and <Picture /> from astro:assets require alt at build time (ImageMissingAlt error if omitted). Content: <Image src={hero} alt="Aerial view of downtown Reykjavik at dusk" />. Decorative: <Image src={divider} alt="" />. Raw <img> in .astro/.mdx is NOT enforced, so add alt manually. For CSS background-image, put aria-label on the wrapping element if it conveys meaning.

**How to verify.** Parse rendered HTML; assert every <img> has an alt attribute present (document.querySelectorAll('img:not([alt])').length === 0). For non-decorative images, assert alt is non-empty and reasonable length. Run axe-core / Lighthouse image-alt (no violations); manually review that alt is meaningful, not the filename or keyword-stuffed.

**Common mistakes.** alt="image"/alt="photo"/filename; keyword-stuffing; alt=" " (space) for decorative; omitting alt on raw <img> assuming Astro enforces it; marking informational images as decorative to skip writing alt.

**Sources.** <https://docs.astro.build/en/reference/errors/image-missing-alt/> · <https://developers.google.com/search/docs/appearance/google-images> · <https://docs.astro.build/en/guides/images/>

---

### 🔴 Provide a skip-to-content link as the first focusable element

`accessibility-skip-to-content-link` · **Critical** · stage: `pre-launch` · 🤖 automatable · check: `html_element`

**What.** A visually hidden 'Skip to main content' link must be the very first focusable element in <body>, become visible on focus, and target a <main> that carries id and tabindex="-1".

**Why it matters.** WCAG 2.4.1 Bypass Blocks (Level A). Without it, keyboard and switch-access users must tab through the full header and nav on every page.

**Fix (Astro).**

Immediately after <body> in the base layout: <a href="#main-content" class="skip-link">Skip to main content</a>, and <main id="main-content" tabindex="-1">. CSS: .skip-link{position:absolute;left:-9999px} .skip-link:focus{left:0}. Do not hide it with display:none (that makes it unfocusable).

**Cloudflare / Vercel.** On Cloudflare Pages (Zaraz) or Vercel Analytics, verify injected scripts do not place a focusable element before the skip link.

**How to verify.** Parse HTML and assert the first focusable element is an <a> whose href starts with '#' and whose text contains 'skip', and that the target id exists. Full verification needs a Playwright/Puppeteer Tab-press to confirm it becomes visible and that focus lands on <main>.

**Common mistakes.** Target has no tabindex so focus does not land on it; link hidden with display:none; an injected script (cookie banner, Zaraz, analytics) inserts a focusable element before the skip link.

**Sources.** <https://www.w3.org/WAI/test-evaluate/easy-checks/skip-link/> · <https://www.accessibilitychecker.org/wcag-guides/ensure-all-skip-links-have-a-focusable-target/>

---

### 🔴 Viewport meta tag must not disable user zoom

`accessibility-viewport-allows-zoom` · **Critical** · stage: `pre-launch` · 🤖 automatable · check: `html_head`

**What.** The <meta name="viewport"> tag must set width=device-width, initial-scale=1 and must NOT include user-scalable=no or a maximum-scale below 2.

**Why it matters.** Disabling zoom is a WCAG 1.4.4 Resize Text (Level AA) failure that locks out low-vision users who rely on browser zoom. Lighthouse weights the meta-viewport audit heavily (weight 10).

**Fix (Astro).**

In the base layout <head> use exactly: <meta name="viewport" content="width=device-width, initial-scale=1" />. This is the Astro starter default; do not add user-scalable=no or maximum-scale=1, and check that no UI framework component injects them.

**How to verify.** GET the page HTML, extract the content of <meta name="viewport">, assert it does not contain user-scalable=no or maximum-scale < 2. Lighthouse meta-viewport audit automates this.

**Common mistakes.** Pasting outdated boilerplate with user-scalable=no, or a component library that injects a zoom-locking viewport tag.

**Sources.** <https://www.w3.org/WAI/standards-guidelines/act/rules/b4f0c3/> · <https://developer.chrome.com/docs/lighthouse/accessibility/scoring>

---

### 🟠 Use valid, role-appropriate ARIA only when native HTML is insufficient

`accessibility-aria-valid-and-minimal` · **High** · stage: `pre-launch` · 🤖 automatable · check: `html_attribute`

**What.** ARIA attributes must be spelled correctly, have valid values, match the element's role, and never duplicate semantics that native HTML already provides. First rule of ARIA: prefer a native element over an ARIA role.

**Why it matters.** Invalid ARIA is worse than none and misleads assistive tech. Lighthouse flags several high-weight ARIA checks (aria-allowed-attr, aria-required-attr, aria-roles, aria-valid-attr, aria-valid-attr-value); WCAG 4.1.2 (Level A) requires correct name/role/value.

**Fix (Astro).**

Prefer <button> over <div role="button">, <nav> over <div role="navigation">, <details>/<summary> for disclosures. When using component libraries (Radix, Headless UI) in islands, verify the rendered HTML produces correct ARIA. Avoid pasting unvetted ARIA snippets.

**How to verify.** Run axe-core against the live page: aria-allowed-attr, aria-required-attr, aria-required-children, aria-required-parent, aria-roles, aria-valid-attr, aria-valid-attr-value, aria-hidden-body. Lighthouse maps to these. Manually review custom widgets (accordions, tabs, modals, carousels) in axe DevTools 'Needs Review'.

**Common mistakes.** aria-hidden="true" on <body>; role="button" on a <div> without tabindex and key handlers; aria-labelledby pointing to a missing id; aria-expanded on a static element.

**Sources.** <https://developer.chrome.com/docs/lighthouse/accessibility/scoring> · <https://cerovac.com/a11y/2024/03/common-aria-problems-found-in-accessibility-audits/> · <https://www.w3.org/WAI/ARIA/apg/practices/landmark-regions/>

---

### 🟠 Buttons and links have descriptive accessible names

`accessibility-buttons-links-accessible-names` · **High** · stage: `pre-launch` · 🤖 automatable · check: `html_element`

**What.** Every <button>/<input type=button|submit|reset> must have a discernible name (visible text, aria-label, or aria-labelledby); icon-only buttons use aria-label. Link text (or aria-label) must describe the destination in isolation; generic 'click here', 'read more', 'learn more', 'here' fail WCAG 2.4.4.

**Why it matters.** WCAG 4.1.2 (buttons) and 2.4.4 Link Purpose (links), both Level A; Lighthouse button-name is weight 10. Screen reader users scan link/button lists out of context, so generic names are useless; descriptive link text also strengthens anchor-text SEO.

**Fix (Astro).**

Icon button: <button aria-label="Open navigation menu"><svg aria-hidden="true">...</svg></button>. For 'read more' cards, add hidden context: Read more <span class="sr-only">about {post.title}</span>, or aria-label={`Read more about ${post.title}`}. Add a .sr-only utility in global CSS.

**How to verify.** Parse HTML; for each button assert non-empty text OR aria-label OR aria-labelledby. For links, flag text matching a blocklist ['click here','read more','learn more','more','here','this','link'] (case-insensitive) and flag empty links. Lighthouse/axe button-name and link-name automate the core checks.

**Common mistakes.** Font icon <i class="icon-close"> with no aria-label; button text just '>' or 'X'; using title instead of aria-label; every blog card ending in a bare 'Read more'; pagination links labelled only '<' and '>'.

**Sources.** <https://developer.chrome.com/docs/lighthouse/accessibility/scoring> · <https://www.section508.gov/blog/accessibility-bytes/descriptive-links-and-hypertext/>

---

### 🟠 Meet WCAG AA contrast for text (4.5:1) and UI components (3:1)

`accessibility-color-contrast` · **High** · stage: `pre-launch` · 👤 manual · check: `lighthouse`

**What.** Normal text needs at least 4.5:1 contrast against its background (3:1 for large text >=24px/19px-bold) per WCAG 1.4.3. Non-text UI parts (input borders, custom checkboxes, icon-only buttons, focus rings) need at least 3:1 against adjacent colors per WCAG 1.4.11. Both are Level AA.

**Why it matters.** Low contrast makes content unreadable for low-vision users and in bright light, and is a basis for ADA/EAA claims. Lighthouse/axe color-contrast catch only ~30% of cases; non-text contrast (1.4.11) is only partially automatable, so manual review is required.

**Fix (Astro).**

Enforce contrast in Tailwind tokens / CSS design tokens; avoid light-grey text on white and thin light-grey (#ccc) input borders. Verify in both light and dark themes and for hover/focus/active states. Test scoped-style output in the rendered page since scoping does not change ratios.

**How to verify.** Run Lighthouse/axe color-contrast against the live URL for text. For UI components, inspect computed border/background/icon colors in DevTools and run them through the WebAIM Contrast Checker. Manually check gradient/image backgrounds and dynamic color combinations.

**Common mistakes.** Light-grey text on white; text over hero images that passes only in dark areas; untested hover/focus states; custom inputs with thin light-grey borders (e.g. ~1.6:1); low-contrast SVG icons next to white.

**Sources.** <https://webaim.org/articles/contrast/> · <https://dequeuniversity.com/rules/axe/4.8/color-contrast> · <https://www.makethingsaccessible.com/guides/contrast-requirements-for-wcag-2-2-level-aa/>

---

### 🟠 All form controls have programmatically associated labels

`accessibility-form-inputs-labeled` · **High** · stage: `pre-launch` · 🤖 automatable · check: `html_element`

**What.** Every <input> (except hidden), <select>, and <textarea> must have an accessible name via an explicit <label for="id">, aria-label, or aria-labelledby referencing visible text. Placeholder alone is never a label.

**Why it matters.** WCAG 1.3.1 and 4.1.2 (both Level A); Lighthouse label is weight 10. Unlabeled inputs leave screen-reader users unsure what to enter, and placeholders vanish on input, hurting cognitive-disability users.

**Fix (Astro).**

Use <label for="email">Email address</label><input id="email" type="email" />. For label-less search: <input type="search" aria-label="Search the site" />. For errors: <input aria-describedby="email-error" aria-invalid="true" />. Never rely on placeholder alone.

**How to verify.** Parse HTML; for each non-hidden input/select/textarea assert one of: aria-label, aria-labelledby pointing to an existing id, or a <label for> matching the control's id. Lighthouse label and axe label automate this.

**Common mistakes.** Placeholder as the only label; aria-label text that omits the visible label (violates WCAG 2.5.3); input missing an id when using <label for>; nav search box with no accessible name.

**Sources.** <https://cerovac.com/a11y/2024/03/common-aria-problems-found-in-accessibility-audits/> · <https://developer.chrome.com/docs/lighthouse/accessibility/scoring>

---

### 🟠 Exactly one H1 per page with sequential, non-skipping headings

`accessibility-heading-structure` · **High** · stage: `pre-launch` · 🤖 automatable · check: `html_element`

**What.** Each page has exactly one <h1> describing the main topic (closely matching the <title>), and subsequent heading levels descend without skipping ranks (H1 then H2, never H1 then H3). Headings reflect content hierarchy, not visual styling.

**Why it matters.** Screen reader users navigate by heading; duplicate/absent H1 and skipped levels break the document outline (WCAG 2.4.6, Level AA; Lighthouse heading-order). A single descriptive H1 is also a clear content signal.

**Fix (Astro).**

Put the H1 in the page-level template, not the layout: <h1>{title}</h1>. Map content-collection `title` to the H1. In MDX/Markdown, do not also emit an H1 in the prose body (avoid leading #). Use CSS classes for visual size; use heading tags only for semantic rank.

**How to verify.** Parse HTML; assert exactly one <h1>; extract all headings in DOM order and assert no rank jump greater than 1. Optionally diff H1 text vs <title>. axe-core heading-order automates the sequence check.

**Common mistakes.** Layout adds a site-name H1 while the template also has an article H1; MDX uses # producing a second H1; jumping to H4 for accordion/FAQ headers because they 'look right'.

**Sources.** <https://www.w3.org/WAI/tutorials/page-structure/headings/> · <https://developer.chrome.com/docs/lighthouse/accessibility/scoring>

---

### 🟠 All functionality is keyboard-operable with no keyboard traps

`accessibility-keyboard-operable` · **High** · stage: `pre-launch` · 👤 manual · check: `manual`

**What.** Every interactive element must be reachable and operable with the keyboard alone, in a logical tab order following visual reading order, with no permanent focus trap (WCAG 2.1.2 No Keyboard Trap, Level A). Modals/menus must close with Escape and return focus to their trigger.

**Why it matters.** Keyboard access is required for motor-disability and screen-reader users. Traps prevent leaving modals, date pickers, or menus with Tab/Shift+Tab/Escape/Arrows. axe-core cannot detect keyboard traps algorithmically, so manual testing is mandatory.

**Fix (Astro).**

For React/Preact/Svelte islands (modals, dropdowns, drawers), return focus to the trigger on close and support Escape. Avoid positive tabindex values that disrupt natural order. With Astro's ClientRouter, view transitions restore focus on navigation, but verify any custom transitions do too.

**How to verify.** Manually navigate the whole page using only Tab, Shift+Tab, Enter, Space, Escape, and Arrows; confirm nothing traps focus and every modal/dropdown closes with Escape and restores focus. Playwright can partially assert no permanent trap and Escape behavior.

**Common mistakes.** Cookie dialogs that trap focus; dropdowns that respond only to mouse; carousels without arrow-key support; custom view transitions that fail to restore focus.

**Sources.** <https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html> · <https://docs.astro.build/en/guides/view-transitions/>

---

### 🟠 Legible body text and 16px form inputs to avoid iOS zoom

`accessibility-legible-font-size` · **High** · stage: `pre-launch` · 🤖 automatable · check: `lighthouse`

**What.** Body copy should be at least 16px on mobile and text inputs must be at least 16px to prevent iOS Safari auto-zoom. Secondary text should not drop below 12px (Lighthouse legible-font-sizes flags pages where 40%+ of text is under 12px).

**Why it matters.** iOS Safari auto-zooms when a focused input has font-size < 16px, breaking layout. Lighthouse 'legible font sizes' (SEO category) checks the 12px/60% coverage threshold. (Do not use GSC's old 'text too small' report; Google removed it in Dec 2023.)

**Fix (Astro).**

Set base size in global CSS: html{font-size:16px} or Tailwind text-base as the body default; input{font-size:1rem} (never below 16px). Prefer rem/em units for scaling.

**How to verify.** Playwright at 390px: read getComputedStyle(el).fontSize per text element and assert >=12px overall and >=16px for <p> body text and <input>. Lighthouse 'legible font sizes' (SEO) automates the 12px/60% coverage check.

**Common mistakes.** px sizes that look fine on desktop but render tiny on mobile; a component library default input font-size of 14px triggering iOS auto-zoom.

**Sources.** <https://developer.chrome.com/docs/lighthouse/seo/font-size> · <https://searchengineland.com/google-officially-drops-mobile-usability-report-mobile-friendly-test-tool-and-mobile-friendly-test-api-435377>

---

### 🟠 Layout is responsive with no horizontal scroll on mobile

`accessibility-mobile-responsive-no-overflow` · **High** · stage: `pre-launch` · 🤖 automatable · check: `lighthouse`

**What.** Page content must fit the viewport at common mobile widths (360, 390, 414px) with no horizontal scrolling and no element overflowing wider than the viewport.

**Why it matters.** Google uses mobile-first indexing, so the mobile rendering is what gets crawled and indexed. Horizontal overflow is poor UX and a negative page-experience signal; mobile-friendliness remains a ranking factor even after GSC retired the Mobile Usability report.

**Fix (Astro).**

Use Tailwind responsive prefixes (sm:/md:/lg:) and avoid fixed pixel widths on containers. In global CSS add box-sizing:border-box on *, *::before, *::after and img,video{max-width:100%}. Test with astro dev plus Chrome DevTools device simulator.

**Cloudflare / Vercel.** Neither platform transforms HTML, but confirm Cloudflare Rocket Loader / Auto Minify do not break responsive CSS.

**How to verify.** Playwright at 390x844: assert document.documentElement.scrollWidth <= clientWidth (no horizontal overflow), repeat at 360px. Run Lighthouse mobile audit and check 'content properly sized for viewport'.

**Common mistakes.** Fixed-width tables, long unbroken URLs/code blocks, fixed-width third-party embeds, absolute-positioned elements running off-canvas.

**Sources.** <https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing>

---

### 🟠 No intrusive interstitials blocking content on mobile load

`accessibility-no-intrusive-interstitials` · **High** · stage: `post-launch` · 👤 manual · check: `manual`

**What.** On mobile, pages must not show full-screen popups, newsletter modals, or app-install prompts that cover the main content immediately on load. Legally required dialogs (cookie consent, age gates) and small persistent banners are exempt; Google advises overlays cover no more than 15-25% of the mobile viewport.

**Why it matters.** Google's intrusive-interstitial policy (since Jan 2017) penalizes overlays that block content access (the violatesMobileInterstitialPolicy signal feeds page experience ranking), and analyses of the Dec 2025 / Feb 2026 Core Updates point to increased weight on page-experience signals.

**Fix (Astro).**

Make any Astro modal/overlay delayed (not on first arrival from search), dismissible, and never full-screen on mobile. Configure cookie consent as a banner, not a blocking overlay. Never gate newsletter signups behind a full-page interstitial.

**Cloudflare / Vercel.** Cloudflare Zaraz can inject scripts that fire popups; Vercel Edge Middleware can set a cookie to suppress first-visit modals. Neither platform blocks intrusive overlays automatically.

**How to verify.** Playwright cold visit (no cookies) at mobile viewport, wait ~3s, flag any fixed/absolute element with z-index>100 covering >25% of the viewport; back up with a screenshot. Human judgment needed for edge cases (no fully reliable automated check exists).

**Common mistakes.** Newsletter modal firing after ~0.5s; full-screen cookie banner on mobile; service-worker app-install prompt on first visit.

**Sources.** <https://developers.google.com/search/docs/appearance/avoid-intrusive-interstitials> · <https://www.tba-berlin.de/en/seo-topics/intrusive-overlays-and-google-rankings/>

---

### 🟠 Every page has a unique, descriptive title element

`accessibility-page-title-unique` · **High** · stage: `pre-launch` · 🤖 automatable · check: `html_head`

**What.** Each page must have a non-empty, unique <title> in <head> that describes the page (WCAG 2.4.2 Page Titled, Level A). Convention: 'Page Topic | Site Name'. Titles must not be identical across pages or left as the starter default.

**Why it matters.** Screen readers announce the title first on load; duplicate or missing titles disorient AT users. The title is also Google's primary SERP link-text signal. Lighthouse document-title flags missing titles.

**Fix (Astro).**

Use a Layout that accepts a title prop: <title>{title} | My Site</title>. Map content-collection frontmatter `title` to the prop and ensure each template passes a unique value. An astro-seo or custom <SEO> component helps keep head meta consistent.

**How to verify.** Parse <title>; assert non-empty and not a placeholder ('Astro', 'My Site'). For a full crawl, fetch all titles and assert uniqueness across pages. Lighthouse document-title automates the single-page check.

**Common mistakes.** Same title on every page; leftover Astro starter 'Astro' title; title containing only the site name with no page-specific text.

**Sources.** <https://developer.chrome.com/docs/lighthouse/accessibility/scoring> · <https://www.w3.org/WAI/tutorials/page-structure/headings/>

---

### 🟠 Use semantic landmarks with one main and uniquely labelled navs

`accessibility-semantic-landmarks` · **High** · stage: `pre-launch` · 🤖 automatable · check: `html_element`

**What.** Each page uses semantic landmark elements: a <header>, <nav>, exactly one <main>, and a <footer>. When more than one <nav> exists (main, breadcrumb, footer), each must carry a unique, non-empty aria-label.

**Why it matters.** Landmarks let screen reader users jump between regions and expose correct ARIA roles automatically. Multiple unlabelled navs collapse into indistinguishable 'navigation' entries (axe region, landmark-one-main, landmark-unique). Good structure is a quality signal.

**Fix (Astro).**

Base layout: <header>...</header><main><slot /></main><footer>...</footer>. Label multiple navs: <nav aria-label="Main">, <nav aria-label="Breadcrumb">, <nav aria-label="Footer">. Do not add redundant role="banner"/role="main" on semantic elements; their implicit roles suffice.

**How to verify.** Parse HTML; assert presence of header/nav/main/footer (or equivalent roles), exactly one <main>, and that every <nav> beyond the first has a unique aria-label. axe-core landmark-one-main, region, and landmark-unique partially cover this; confirm with a screen reader landmark list.

**Common mistakes.** <div class="header"> instead of <header>; no <main>; multiple unlabelled <nav>; mobile hamburger nav duplicating the desktop nav's label; <main> nested inside <header>.

**Sources.** <https://www.w3.org/WAI/ARIA/apg/practices/landmark-regions/> · <https://a11y-guidelines.orange.com/en/articles/landmarks/>

---

### 🟠 Tap targets are large enough and adequately spaced

`accessibility-tap-target-size` · **High** · stage: `pre-launch` · 🤖 automatable · check: `lighthouse`

**What.** Tappable elements must be at least 24x24 CSS px (WCAG 2.5.8 Target Size (Minimum), Level AA, WCAG 2.2) with at least 24px clearance from adjacent targets. Best practice and Lighthouse's threshold is larger: 44x44 (Apple HIG) / 48x48 with ~48px spacing (Lighthouse SEO tap-targets audit).

**Why it matters.** Small targets cause mis-taps for motor-impaired and mobile users. WCAG 2.5.8 is Level AA; Lighthouse tap-targets (in the SEO category) flags elements below 48x48px with insufficient spacing.

**Fix (Astro).**

Give <a>/<button> enough padding to hit the target size. Tailwind: p-3 (a 0px element becomes ~24px) or, for icon buttons, p-2 min-h-[44px] min-w-[44px]. Never rely on the icon's visual size for the tap area.

**How to verify.** Run Lighthouse with --form-factor=mobile and read the SEO tap-targets audit (flags <48x48px with <48px spacing). For the WCAG 2.5.8 minimum, use Puppeteer to read each interactive element's bounding rect and assert width>=24 and height>=24.

**Common mistakes.** 16x16px social icon links; inline links in dense nav; tiny modal close (X) buttons; footer links with zero padding.

**Sources.** <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html> · <https://developer.chrome.com/docs/lighthouse/seo/tap-targets>

---

### 🟠 All interactive elements have visible keyboard focus indicators

`accessibility-visible-focus-indicators` · **High** · stage: `pre-launch` · 👤 manual · check: `manual`

**What.** Every focusable element must show a clearly visible focus indicator on keyboard focus. Never apply outline:none/outline:0 without a replacement. WCAG 2.4.7 Focus Visible (AA) requires a visible indicator; WCAG 2.4.13 Focus Appearance (AA, new in 2.2) adds minimum area and 3:1 contrast for the indicator.

**Why it matters.** WebAIM finds ~78% of sites have focus-indicator issues. Without visible focus, keyboard-only users cannot tell where they are. :focus-visible shows rings for keyboard nav while suppressing them for mouse clicks.

**Fix (Astro).**

Remove any global *:focus{outline:none} reset. Add :focus-visible styles, e.g. .interactive:focus-visible{outline:3px solid #005fcc;outline-offset:2px} or Tailwind focus-visible:ring-2 focus-visible:ring-blue-600. Confirm no CSS framework strips outlines globally.

**How to verify.** Manually Tab through the live page in Chrome and Firefox (and dark mode), confirming each element shows a clear ring. Partially automatable: grep CSS for outline:0/outline:none not paired with a :focus-visible replacement; Playwright can focus each element and screenshot to assert a non-default appearance.

**Common mistakes.** Global *:focus{outline:none} with no :focus-visible replacement; focus ring color below 3:1 contrast; styles applied only with :focus (not :focus-visible) so mouse users also see rings.

**Sources.** <https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html> · <https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible>

---

### 🟡 Data tables use th headers with scope; no layout tables

`accessibility-data-tables-headers` · **Medium** · stage: `pre-launch` · 🤖 automatable · check: `html_element`

**What.** Any <table> of tabular data must use <th> elements with scope="col"/scope="row" (or be inside <thead>); complex multi-level headers need id/headers. Tables must not be used for layout.

**Why it matters.** Screen readers use headers to give each cell context; without them a table is an unnavigable stream of values (WCAG 1.3.1, Level A). Lighthouse td-has-header is weight 10.

**Fix (Astro).**

Author tables with <thead><tr><th scope="col">Name</th></tr></thead>. Avoid CMS-generated tables that omit thead. Markdown via remark-gfm correctly emits <thead> and <th>. Use CSS Grid/Flexbox for layout, never tables.

**How to verify.** Parse HTML; for each <table> assert at least one <th>, and that column <th> use scope="col" or sit inside <thead>. Lighthouse td-has-header and axe td-headers-attr automate this; confirm cell announcements with a screen reader.

**Common mistakes.** CMS/markdown tables with all <td> and no <th>; tables used for page layout; missing scope on row-header cells.

**Sources.** <https://developer.chrome.com/docs/lighthouse/accessibility/scoring> · <https://www.w3.org/WAI/tutorials/tables/>

---

### 🟡 Respect prefers-reduced-motion for animations

`accessibility-reduced-motion` · **Medium** · stage: `pre-launch` · 🤖 automatable · check: `body_regex`

**What.** Non-essential animations and transitions must be reduced or disabled when the OS 'Reduce Motion' preference is set via prefers-reduced-motion. (WCAG 2.3.3 is Level AAA, but honoring this preference is a widely expected baseline.)

**Why it matters.** Animations can trigger nausea, vertigo, or seizures for users with vestibular disorders. The media query is supported in all modern browsers and is often contractually required in government/healthcare contexts.

**Fix (Astro).**

Global CSS: @media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}. Astro's ClientRouter already disables view-transition animations under reduced motion automatically (no config needed). Gate scroll-driven animations with @media (prefers-reduced-motion: no-preference).

**How to verify.** Static scan of built CSS: assert @keyframes/transition declarations are inside @media (prefers-reduced-motion: no-preference) or paired with a reduce override. Playwright: emulate prefers-reduced-motion and confirm animations are paused/absent. Or DevTools Rendering > Emulate prefers-reduced-motion: reduce.

**Common mistakes.** Adding an Animate-On-Scroll library with no reduced-motion override; autoplaying hero video not paused under reduced motion; assuming you must hand-write CSS to stop Astro view-transition animations (the ClientRouter already handles them).

**Sources.** <https://web.dev/learn/accessibility/motion> · <https://docs.astro.build/en/guides/view-transitions/> · <https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html>

---

### 🟡 Name content SVGs and hide decorative SVGs

`accessibility-svg-accessible` · **Medium** · stage: `pre-launch` · 🤖 automatable · check: `html_element`

**What.** Content-bearing inline SVGs need an accessible name via aria-label or a <title> child referenced by aria-labelledby. Decorative SVGs must have aria-hidden="true" and focusable="false" so AT ignores them.

**Why it matters.** Inline SVGs are common for icons and illustrations; without names, screen readers announce raw path data or nothing. WCAG 1.1.1 applies to SVGs like <img>.

**Fix (Astro).**

Decorative: <svg aria-hidden="true" focusable="false"><use href="#icon-menu" /></svg>. Content: <svg aria-labelledby="chart-title"><title id="chart-title">Monthly visitor growth, Jan-Jun 2026</title>...</svg>. The astro-icon package applies aria-hidden automatically.

**How to verify.** Parse HTML; for each <svg>, pass if aria-hidden="true"; otherwise assert aria-label OR aria-labelledby pointing to a <title> with text. axe-core svg-img-alt partially covers this; confirm with a screen reader.

**Common mistakes.** Logo SVG with no name; icon SVG inside an aria-labelled button but not itself aria-hidden (double announcement); omitting focusable="false" so some browsers make the SVG focusable.

**Sources.** <https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-label> · <https://shinagawa-web.com/en/blogs/accessibility-support>

---

### 🟡 Prerecorded videos have synchronized captions

`accessibility-video-captions` · **Medium** · stage: `pre-launch` · 🤖 automatable · check: `html_element`

**What.** All prerecorded video with audio must have synchronized captions (WCAG 1.2.2, Level A). Native <video> needs a <track kind="captions"> (or subtitles); unreviewed auto-generated captions are generally insufficient.

**Why it matters.** Deaf and hard-of-hearing users need captions to access video. Lighthouse video-caption (weight 10) flags <video> without a caption/subtitle track.

**Fix (Astro).**

Native: <video><source src="..." /><track kind="captions" src="/captions-en.vtt" srclang="en" label="English" default /></video>. YouTube embeds: add cc_load_policy=1 to the iframe URL; Vimeo: enable captions in settings.

**How to verify.** Parse HTML; assert each <video> has a child <track kind="captions|subtitles">. Lighthouse video-caption automates the native check. YouTube/Vimeo iframes need manual review (play and confirm captions, checking accuracy on domain terms).

**Common mistakes.** Providing only a transcript but no synchronized captions; no default track; shipping uncorrected auto-captions.

**Sources.** <https://developer.chrome.com/docs/lighthouse/accessibility/scoring> · <https://www.w3.org/TR/WCAG21/#captions-prerecorded>

---

## Platform & Deployment (Cloudflare / Vercel)

Getting the deploy right: the correct adapter, HTTPS/SSL, a single canonical host, security headers, caching, and platform-specific gotchas.

### 🔴 Install the correct Astro adapter (or none) for the deployment target

`platform-adapter-correct-selection` · **Critical** · stage: `build` · 🤖 automatable · check: `manual`

**What.** Use @astrojs/cloudflare for Cloudflare Pages/Workers SSR and @astrojs/vercel for Vercel SSR. A fully static site (output:'static') needs no adapter on either platform; adding one unnecessarily wraps every page in a Worker/serverless function, adding latency and cost.

**Why it matters.** A wrong or spurious adapter causes mis-routed requests, broken SSR, failed deployments, and slower/more expensive static delivery. Matching the adapter to the target is the foundation everything else depends on.

**Fix (Astro).**

Static: keep output:'static' (default) and remove any adapter. Cloudflare SSR: `npx astro add cloudflare`, set output:'server', adapter: cloudflare(). Vercel SSR: `npx astro add vercel`, adapter: vercel() (single top-level import; the /serverless and /edge sub-paths were removed in @astrojs/vercel v8+).

**Cloudflare / Vercel.** Cloudflare: an adapter is only needed for SSR or for bindings (KV, D1, R2); static sites deploy as direct uploads. Vercel: @astrojs/vercel is the single standard import for all modes.

**How to verify.** Inspect astro.config.mjs: if output:'static', assert no adapter; if output:'server', assert exactly one adapter matching the platform. In build output assert dist/_worker.js exists for Cloudflare SSR or .vercel/output/ exists for Vercel SSR. Live: confirm cf-ray (Cloudflare) or x-vercel-id (Vercel) response header.

**Common mistakes.** Using @astrojs/cloudflare on a Vercel project (or vice versa); adding an adapter to a purely static site; forgetting to swap adapter when migrating platforms; using the removed @astrojs/vercel/serverless sub-path import.

**Sources.** <https://docs.astro.build/en/guides/integrations-guide/cloudflare/> · <https://docs.astro.build/en/guides/integrations-guide/vercel/> · <https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/>

---

### 🔴 Cloudflare: set SSL/TLS encryption mode to Full (Strict), never Flexible

`platform-cloudflare-ssl-mode-full-strict` · **Critical** · stage: `pre-launch` · 🤖 automatable · check: `redirect`

**What.** The Cloudflare zone SSL/TLS encryption mode must be Full (Strict) (or at minimum Full). Flexible mode combined with 'Always Use HTTPS' produces an infinite redirect loop (ERR_TOO_MANY_REDIRECTS) because Cloudflare Pages always redirects HTTP to HTTPS at the origin.

**Why it matters.** Flexible mode encrypts only browser-to-Cloudflare, leaving Cloudflare-to-origin on HTTP; with Pages this causes redirect loops that take the whole site offline, and Full (Strict) additionally validates the origin certificate.

**Fix (Astro).**

Cloudflare dashboard > SSL/TLS > Overview: set Full (Strict). Pages projects use Full (Strict) for the pages.dev origin by default; ensure the zone-level setting matches. Not an Astro config concern.

**Cloudflare / Vercel.** Cloudflare-specific. Vercel has no SSL-mode concept (always full mutual TLS).

**How to verify.** `curl -sIL https://www.example.com` should produce only 1-2 HTTP status lines (no redirect loop); 3+ indicates a loop. Verify dashboard SSL/TLS > Overview shows Full or Full (Strict).

**Common mistakes.** Leaving Flexible mode from a prior host after migrating to Pages; enabling 'Always Use HTTPS' while still on Flexible.

**Sources.** <https://developers.cloudflare.com/ssl/troubleshooting/too-many-redirects/> · <https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/enable-universal-ssl/> · <https://developers.cloudflare.com/pages/configuration/custom-domains/>

---

### 🔴 Attach the production custom domain and match it to astro.config site

`platform-custom-domain-configured` · **Critical** · stage: `pre-launch` · 🤖 automatable · check: `http_status`

**What.** The site must be reachable at the production custom domain (e.g., www.example.com), not only the platform default (*.pages.dev / *.vercel.app), with DNS pointing to the platform and `site` in astro.config.mjs matching the attached hostname.

**Why it matters.** Without a custom domain, all SEO signals (backlinks, GSC property, canonical URLs, sitemap absolute URLs) accumulate on the wrong hostname.

**Fix (Astro).**

Configure in the Cloudflare Pages dashboard (Settings > Custom domains) or Vercel dashboard (Project Settings > Domains). Set site:'https://www.example.com' in astro.config.mjs to the canonical attached domain so generated absolute URLs and the sitemap are correct.

**Cloudflare / Vercel.** Cloudflare: production *.pages.dev does NOT auto-noindex (see default-domain rule). Vercel: *.vercel.app system URLs DO auto-noindex.

**How to verify.** `dig www.example.com +short` returns a Cloudflare/Vercel CNAME or IP; `GET https://www.example.com` returns 200 with cf-ray (Cloudflare) or x-vercel-id (Vercel) header.

**Common mistakes.** Attaching the domain to a preview branch instead of production; adding only www or only apex; `site` config not matching the live domain.

**Sources.** <https://developers.cloudflare.com/pages/configuration/custom-domains/> · <https://vercel.com/docs/domains/set-up-custom-domain>

---

### 🔴 Enforce HTTPS site-wide (HTTP 301/308 to HTTPS) with zero mixed content

`platform-https-enforced-no-mixed-content` · **Critical** · stage: `pre-launch` · 🤖 automatable · check: `redirect`

**What.** All HTTP (port 80) requests must permanently redirect (301/308) to the HTTPS equivalent before any content is served, and every sub-resource (images, scripts, styles, fonts, iframes) on an HTTPS page must also load over HTTPS — no http:// URLs in rendered HTML or CSS.

**Why it matters.** HTTPS is a confirmed Google ranking signal and a prerequisite for HTTPS canonicalization. Mixed content triggers browser security warnings, blocks active resources (breaking rendering), and undermines E-E-A-T trust.

**Fix (Astro).**

Set site:'https://...' in astro.config.mjs. Cloudflare: enable SSL/TLS > Edge Certificates > Always Use HTTPS. Vercel: HTTPS is enforced automatically on custom domains. Add CSP `upgrade-insecure-requests` as belt-and-suspenders, and fix any hard-coded http:// in CMS/image/embed URLs at the source.

**Cloudflare / Vercel.** Cloudflare: must NOT use Flexible SSL mode (see SSL-mode rule). Vercel: HTTP-to-HTTPS redirect is automatic and cannot be disabled on custom domains.

**How to verify.** `curl -I http://example.com/` and `http://www.example.com/` must return 301/308 with a Location starting https://. Then crawl rendered HTML (and CSS url() values) and assert no src/href/action/data-src/url() value starts with http://.

**Common mistakes.** Hard-coded http:// in CMS image URLs or in the Astro `site` config; HTTP iframe embeds (YouTube/maps); using 302 instead of 301/308; relying on Cloudflare Automatic HTTPS Rewrites instead of fixing the source.

**Sources.** <https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls> · <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/upgrade-insecure-requests> · <https://vercel.com/docs/domains/working-with-domains>

---

### 🟠 Cloudflare SSR: set security/cache headers in middleware, not only _headers

`platform-cloudflare-headers-in-middleware-for-ssr` · **High** · stage: `build` · 🤖 automatable · check: `http_header`

**What.** On Cloudflare Pages with @astrojs/cloudflare SSR, the _headers file does NOT apply to responses generated by Pages Functions (the Worker). Security and cache headers for dynamic/SSR routes must be set programmatically in Astro middleware (src/middleware.ts). In hybrid setups, _headers covers prerendered static pages while middleware covers SSR pages.

**Why it matters.** Per Cloudflare docs, custom headers in _headers are not applied to Pages Functions responses; an SSR site relying on _headers silently serves dynamic routes with no security headers. This also avoids the 100-rule _headers limit.

**Fix (Astro).**

Create src/middleware.ts with `export const onRequest = defineMiddleware(async (context, next) => { const response = await next(); response.headers.set('X-Content-Type-Options','nosniff'); response.headers.set('Referrer-Policy','strict-origin-when-cross-origin'); /* all required headers */ return response; });`

**Cloudflare / Vercel.** Cloudflare-specific. Does NOT apply to Vercel, where vercel.json headers apply to both static and serverless responses.

**How to verify.** `curl -sI https://www.example.com/<dynamic-ssr-page> | grep -i x-content-type-options` must show nosniff, and a static asset (e.g., /_astro/main.js) must also carry security headers via its own mechanism.

**Common mistakes.** Placing all headers in _headers and assuming site-wide coverage; on hybrid builds, forgetting that SSR pages need middleware while static pages use _headers.

**Sources.** <https://developers.cloudflare.com/pages/configuration/headers/>

---

### 🟠 Cloudflare SSR: serve 404 via the Worker, not a prerendered 404 page

`platform-cloudflare-ssr-404-not-prerendered` · **High** · stage: `build` · 🤖 automatable · check: `http_status`

**What.** On Cloudflare Pages SSR (output:'server' + @astrojs/cloudflare), the 404.astro page must NOT be prerendered (no `export const prerender = true`); the Worker should produce the 404 with status set explicitly. A prerendered 404 in SSR mode triggers Cloudflare error 1042/522 instead of the custom page (GitHub astro#13932).

**Why it matters.** Returning 5xx (or 200) instead of a proper 404 corrupts Google's understanding of missing pages and harms crawl/index quality; the cross-Worker fetch from a prerendered 404 is blocked by Cloudflare.

**Fix (Astro).**

Create src/pages/404.astro without prerender, set `Astro.response.status = 404` in frontmatter; or use a catch-all [...slug].astro that returns 404 when a path does not exist.

**Cloudflare / Vercel.** Cloudflare Pages SSR-specific. On Vercel SSR, set the 404 status explicitly but the prerender restriction does not apply.

**How to verify.** `curl -sI https://[project].pages.dev/nonexistent-page-xyz | grep HTTP` must return 404 (not 200 or 5xx); re-test on the custom domain.

**Common mistakes.** Adding `export const prerender = true` to 404.astro on Pages SSR (triggers error 1042); forgetting to set Astro.response.status = 404 in SSR mode.

**Sources.** <https://github.com/withastro/astro/issues/13932> · <https://developers.cloudflare.com/pages/configuration/serving-pages/>

---

### 🟠 Block the platform default domain (*.pages.dev / *.vercel.app) from indexing

`platform-default-domain-noindex` · **High** · stage: `pre-launch` · 🤖 automatable · check: `http_header`

**What.** The production platform default hostname must not be indexable alongside the custom domain. Vercel auto-noindexes *.vercel.app; Cloudflare Pages does NOT auto-noindex the production *.pages.dev URL, so it requires manual action.

**Why it matters.** Production builds are served on both the default host and the custom domain simultaneously; without noindex or a redirect on the default host, Google can index both, creating duplicate content. Cloudflare is the bigger risk.

**Fix (Astro).**

Cloudflare SSR: in src/middleware.ts redirect when hostname.endsWith('.pages.dev') to the canonical domain (301). Cloudflare static (no adapter): use a Cloudflare WAF/Redirect Rule targeting the *.pages.dev hostname — _headers/_redirects cannot match on hostname. Vercel: automatic, no action needed.

**Cloudflare / Vercel.** Cloudflare-specific manual gap; static sites need the WAF rule since there is no server layer. Vercel handles it automatically.

**How to verify.** `curl -sI https://mysite.pages.dev | grep -i 'x-robots-tag\|location'` must show noindex or a 301 to the custom domain; `curl -sI https://mysite.vercel.app | grep -i x-robots-tag` shows noindex (automatic).

**Common mistakes.** Assuming Cloudflare auto-noindexes production *.pages.dev (it does not); trying to match the *.pages.dev hostname in _headers/_redirects (path-based only, no hostname matching).

**Sources.** <https://vercel.com/kb/guide/avoiding-duplicate-content-with-vercel-app-urls> · <https://developers.cloudflare.com/pages/configuration/preview-deployments/>

---

### 🟠 Inject JSON-LD only via JSON.stringify, never template literals

`platform-jsonld-no-xss-injection` · **High** · stage: `build` · 🤖 automatable · check: `body_regex`

**What.** Every dynamic value placed into a JSON-LD <script type='application/ld+json'> block must be serialized with JSON.stringify() (which escapes </script> and quotes), never via raw string concatenation or template literals.

**Why it matters.** A title like `</script><script>alert(1)</script>` interpolated via template literal into JSON-LD executes arbitrary JS; neither Cloudflare Pages nor Vercel sanitizes user data embedded in script tags. A real Astro XSS (SNYK-JS-ASTRO-7547139) underscores the risk.

**Fix (Astro).**

Always pass an object: `<script type="application/ld+json" set:html={JSON.stringify(schemaObj)} />`, or use the astro-seo-schema package. Never `set:html={`{"headline":"${post.data.title}"}`}`. Enforce with an ESLint rule in CI.

**Cloudflare / Vercel.** No platform difference; neither host server-side-sanitizes embedded user data.

**How to verify.** Static analysis: grep Astro source for set:html on script[type='application/ld+json'] and assert every occurrence wraps a JSON.stringify(...) object, not a template literal.

**Common mistakes.** Using string interpolation for 'simple' schemas; copying older tutorial code that uses template literals.

**Sources.** <https://stephen-lunt.dev/blog/astro-structured-data/> · <https://docs.astro.build/en/reference/directives-reference/> · <https://security.snyk.io/vuln/SNYK-JS-ASTRO-7547139>

---

### 🟠 Remove output:'hybrid' (removed in Astro v5) and use per-page prerender opt-in

`platform-output-hybrid-removed` · **High** · stage: `build` · 🤖 automatable · check: `body_regex`

**What.** Astro v5 removed output:'hybrid' entirely (breaking change). output:'static' now prerenders all pages by default with per-page on-demand SSR via `export const prerender = false`; output:'server' SSRs all pages with `export const prerender = true` to opt pages into static.

**Why it matters.** Leaving output:'hybrid' in a v5 project causes a build error or invalid configuration; the migration is trivial but mandatory after upgrading.

**Fix (Astro).**

Delete output:'hybrid' (or set output:'static') in astro.config.mjs — behavior matches the old hybrid. Add `export const prerender = false` to any page needing on-demand SSR; audit prerender directives after migrating.

**Cloudflare / Vercel.** Applies equally to Cloudflare Pages and Vercel.

**How to verify.** Grep astro.config.mjs for output:'hybrid' and assert absent; run `npx astro build` and assert no output-mode errors/deprecation warnings.

**Common mistakes.** Carrying output:'hybrid' from a v4 project after upgrading; not re-auditing which pages have prerender directives post-migration.

**Sources.** <https://docs.astro.build/en/guides/upgrade-to/v5/> · <https://astro.build/blog/astro-5/>

---

### 🟠 Ensure preview/staging deployments return X-Robots-Tag: noindex

`platform-preview-deployments-noindex` · **High** · stage: `pre-launch` · 🤖 automatable · check: `http_header`

**What.** Every preview/staging deployment must serve X-Robots-Tag: noindex, including the gap where a custom domain is attached to a non-production branch (Vercel does NOT auto-noindex custom domains, only *.vercel.app system URLs).

**Why it matters.** Preview deployments are exact replicas of production; if indexed they create large-scale duplicate content and may leak unreleased pages.

**Fix (Astro).**

Rely on platform defaults for *.vercel.app and *.pages.dev preview hashes. For custom staging domains, add X-Robots-Tag: noindex in Astro middleware (src/middleware.ts) gated on VERCEL_ENV !== 'production' or CF_PAGES_BRANCH !== production branch. Use the HTTP header rather than robots.txt Disallow (immediate, no redeploy to flip).

**Cloudflare / Vercel.** Cloudflare: all preview branch hashes auto-noindex regardless of custom domain. Vercel: only *.vercel.app system URLs auto-noindex; custom domains on non-prod branches need manual config (GitHub discussion #5714).

**How to verify.** `curl -sI https://<preview-hash>.vercel.app` and `https://<preview-hash>.pages.dev` (and any staging custom domain) | grep -i x-robots-tag must contain noindex; confirm the production custom domain does NOT carry it.

**Common mistakes.** Assuming Vercel auto-noindexes custom domains on non-production branches (it does not); serving a crawlable sitemap from a preview URL before launch.

**Sources.** <https://vercel.com/kb/guide/are-vercel-preview-deployment-indexed-by-search-engines> · <https://developers.cloudflare.com/pages/configuration/preview-deployments/>

---

### 🟠 Allowlist remote image domains and configure the right SSR image service

`platform-remote-image-allowlist-and-service` · **High** · stage: `build` · 🤖 automatable · check: `http_status`

**What.** Remote images used by astro:assets <Image/>/getImage() must have their hostname in image.domains[] or image.remotePatterns[]. For Cloudflare SSR, configure the @astrojs/cloudflare imageService option (Sharp does not run in workerd); the current default is 'cloudflare-binding'.

**Why it matters.** Unallowlisted remote images bypass optimization and can cause SSR runtime errors / SSRF exposure. On Cloudflare SSR, Sharp needs Node native binaries unavailable in the V8 isolate runtime, so astro:assets throws or serves unoptimized images without the correct service.

**Fix (Astro).**

astro.config.mjs: `image: { domains: ['cdn.example.com'], remotePatterns: [{ protocol:'https', hostname:'**.cloudinary.com' }] }` (use remotePatterns for wildcard subdomains; domains[] has no wildcards). Cloudflare SSR: `adapter: cloudflare({ imageService: 'cloudflare-binding' })` (or 'cloudflare' for /cdn-cgi/image/, 'compile' for prerendered-only). Never imageService:'custom' with Sharp on Cloudflare.

**Cloudflare / Vercel.** Vercel optimizes via /_vercel/image automatically (only allowlisted domains). Cloudflare SSR needs the adapter imageService option; static Cloudflare output runs Sharp at build time and is unaffected.

**How to verify.** Assert image.domains/remotePatterns is non-empty if any remote <img src> uses astro:assets, and each remote hostname appears in the allowlist. Vercel: /_vercel/image?url= 400s indicate unlisted domains. Cloudflare SSR: confirm <Image/> src is a Cloudflare Images or /cdn-cgi/image/ URL and image endpoints return no 5xx.

**Common mistakes.** Bare domain string where a wildcard is needed; overly broad hostname:'*'; not updating allowlist after switching CDN; deploying Cloudflare SSR with imageService:'custom'+Sharp (runtime crash) or stale 'compile' silently serving unoptimized SSR images.

**Sources.** <https://docs.astro.build/en/guides/images/> · <https://docs.astro.build/en/guides/integrations-guide/cloudflare/> · <https://vercel.com/docs/image-optimization>

---

### 🟠 Set the baseline security headers (HSTS, nosniff, frame-ancestors, Referrer-Policy, Permissions-Policy)

`platform-security-headers-baseline` · **High** · stage: `pre-launch` · 🤖 automatable · check: `http_header`

**What.** Every HTTPS response should carry the baseline security header set: Strict-Transport-Security (max-age >= 31536000, includeSubDomains, preload), X-Content-Type-Options: nosniff, clickjacking protection via Content-Security-Policy: frame-ancestors 'none' (with X-Frame-Options: DENY legacy fallback), Referrer-Policy: strict-origin-when-cross-origin, and a Permissions-Policy disabling unused features (camera, microphone, geolocation, payment, usb).

**Why it matters.** These headers are baseline controls expected by security scanners and protect against SSL-stripping, MIME-sniffing execution, clickjacking, referrer leakage, and silent device/API access. (Note: HSTS itself is not a ranking signal — HTTPS is — but it is core security/trust.)

**Fix (Astro).**

Cloudflare static: add a /* block in public/_headers with all five headers. Cloudflare SSR: set them in Astro middleware (_headers does not cover Worker responses). Vercel: add them under vercel.json `headers` for source '/(.*)'. Use the parenthesis Permissions-Policy syntax (not deprecated Feature-Policy); frame-ancestors must be an HTTP header (meta CSP does not support it).

**Cloudflare / Vercel.** Cloudflare also has an HSTS toggle in SSL/TLS > Edge Certificates — use either the toggle OR _headers, not both (they can conflict). On Cloudflare SSR, set all of these in middleware.

**How to verify.** `curl -sI https://www.example.com` and assert: strict-transport-security max-age>=31536000+includeSubDomains; x-content-type-options: nosniff; content-security-policy contains frame-ancestors 'none'/'self'; referrer-policy: strict-origin-when-cross-origin; permissions-policy present with camera=(), microphone=(), geolocation=(). Cross-check securityheaders.com.

**Common mistakes.** HSTS max-age < 31536000 (blocks preload); enabling preload before all subdomains are HTTPS; setting frame-ancestors via meta tag; using deprecated Feature-Policy syntax; using Referrer-Policy: no-referrer (breaks analytics); on Cloudflare SSR relying on _headers.

**Sources.** <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security> · <https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html> · <https://developers.cloudflare.com/pages/configuration/headers/>

---

### 🟠 Keep trailingSlash config consistent with build.format and platform routing

`platform-trailingslash-consistent` · **High** · stage: `build` · 🤖 automatable · check: `redirect`

**What.** astro.config.mjs trailingSlash must match build.format and the host's routing so each URL has exactly one canonical form. Lock it before launch instead of leaving the default 'ignore', which lets both /page and /page/ be indexed.

**Why it matters.** Trailing-slash inconsistency makes Google treat /page and /page/ as separate pages, splitting link equity, and can cause redirect loops or 404s depending on adapter/host behavior.

**Fix (Astro).**

Clean URLs: trailingSlash:'never' + build.format:'file'. Trailing slash: trailingSlash:'always' + build.format:'directory'. Verify vercel.json has no conflicting trailingSlash. (Note: output:'hybrid' is removed in v5 — use output:'static' with per-page prerender opt-in.)

**Cloudflare / Vercel.** Cloudflare Pages serves /page/index.html at both /page and /page/ unless normalized; Vercel filesystem routing can differ from Cloudflare for the same build output.

**How to verify.** In dist/ confirm files match the chosen format (/about.html vs /about/index.html). Live: GET /about and /about/ — exactly one returns 200, the other 301/308 to the canonical form.

**Common mistakes.** Leaving trailingSlash:'ignore' in production; mixing 'always' with build.format:'file'; conflicting trailingSlash in vercel.json (GitHub astro#13900).

**Sources.** <https://docs.astro.build/en/reference/configuration-reference/> · <https://github.com/withastro/astro/issues/13900>

---

### 🟠 Pick one canonical host (www or apex) and 301/308 redirect the other

`platform-www-apex-canonical-redirect` · **High** · stage: `pre-launch` · 🤖 automatable · check: `redirect`

**What.** Both www and apex must resolve, but exactly one is canonical and the other issues a permanent (301/308) redirect to it. Never serve identical 200 content on both hostnames.

**Why it matters.** Serving the same site on www.example.com and example.com is classic duplicate content; Google's consolidation is imperfect and may pick the wrong variant, splitting link equity.

**Fix (Astro).**

Vercel: add BOTH www and apex in Project Settings > Domains and set the non-canonical one to redirect to the primary. Cloudflare Pages: domain-level (www↔apex) redirects are NOT supported in _redirects — use Cloudflare Bulk Redirects / Redirect Rules in the dashboard.

**Cloudflare / Vercel.** Cloudflare: use Bulk Redirects (Rules > Redirect Rules), not _redirects. Vercel: both variants must be added to the project with an explicit redirect direction.

**How to verify.** `curl -sI https://<non-canonical>` returns 301/308 with Location to the canonical host; `curl -sI https://<canonical>` returns 200. Assert status is 301/308, not 302.

**Common mistakes.** Using 302 instead of 301/308; configuring the redirect in Cloudflare _redirects (no hostname matching); adding only one variant on Vercel (the other returns an error page); leaving both at 200.

**Sources.** <https://developers.cloudflare.com/pages/how-to/www-redirect/> · <https://vercel.com/docs/domains/set-up-custom-domain>

---

### 🟡 Cloudflare: stay within _redirects (2000/100) and _headers (100) rule limits

`platform-cloudflare-redirects-and-headers-limits` · **Medium** · stage: `build` · 🤖 automatable · check: `redirect`

**What.** Cloudflare Pages silently ignores rules beyond its limits: _redirects supports 2,000 static + 100 dynamic redirects (1,000-char per line); _headers supports 100 rules (2,000-char per value). Silently dropped rules mean old URLs 404 or security/cache headers go missing.

**Why it matters.** Dropped redirect rules cause 404s on old URLs (lost ranking signals); dropped header rules create hard-to-detect security gaps — both fail silently with no build error.

**Fix (Astro).**

Count lines before deploy (`wc -l public/_redirects`, `grep -c '^/' public/_headers`); put static redirects before dynamic ones; use wildcard /* header blocks instead of per-path rules. Beyond the limits use Cloudflare Bulk Redirects (dashboard) or move logic into Astro middleware.

**Cloudflare / Vercel.** Cloudflare Pages-specific. Vercel allows ~2,048 routes in vercel.json and a bulkRedirectsPath for large sets; for very large redirect sets an edge/middleware solution scales better on either platform.

**How to verify.** Assert `wc -l public/_redirects` < 2100 (wildcard rules count toward the 100 dynamic cap) and `grep -c '^/' public/_headers` < 100; after deploy, test a rule near the bottom of each file to confirm it is honored.

**Common mistakes.** Per-page header rules exhausting the 100-rule cap; dynamic rules placed before static; exceeding the 1,000-char per-redirect limit; not realizing wildcards count as dynamic.

**Sources.** <https://developers.cloudflare.com/pages/configuration/redirects/> · <https://developers.cloudflare.com/pages/platform/limits/>

---

### 🟡 Cloudflare SSR: keep the Worker within the 128 MB isolate memory limit

`platform-cloudflare-worker-memory-limit` · **Medium** · stage: `build` · 👤 manual · check: `manual`

**What.** Cloudflare Workers / Pages Functions have a 128 MB per-isolate memory limit. Heavy Node dependencies bundled into SSR pages cause runtime crashes (Error 1102) that serve 5xx to users and Googlebot.

**Why it matters.** Repeated 5xx errors from memory exhaustion lead Googlebot to deindex affected pages and degrade crawl health.

**Fix (Astro).**

Test in the workerd runtime with `wrangler pages dev` and watch `wrangler tail`. Avoid bundling heavy libs (image processing, large parsers) into SSR pages; move heavy pages to build time with `export const prerender = true`; offload heavy work to external APIs or Workers AI.

**Cloudflare / Vercel.** Cloudflare-specific (128 MB per isolate, current 2025-2026). Vercel functions default to 1 GB (configurable up to 3 GB on Pro), so this is not a Vercel concern.

**How to verify.** Load-test the most complex SSR pages on staging and monitor Cloudflare Analytics > Workers for Error 1102 spikes; run `wrangler tail` during load to catch memory-limit errors.

**Common mistakes.** Importing large server-side libraries directly in Cloudflare SSR page components; not testing with workerd before deploying (Node behavior differs).

**Sources.** <https://developers.cloudflare.com/workers/platform/limits/> · <https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/>

---

### 🟡 Ship a Content-Security-Policy (use Astro's CSP to drop unsafe-inline)

`platform-content-security-policy` · **Medium** · stage: `build` · 🤖 automatable · check: `http_header`

**What.** HTML responses should carry a Content-Security-Policy. A minimal baseline for a content site: `default-src 'self'; img-src 'self' data: https:; frame-ancestors 'none'; upgrade-insecure-requests`. Prefer Astro's CSP support (v5.9+ `security: { csp: true }`) to auto-hash inline island scripts and eliminate unsafe-inline.

**Why it matters.** A well-configured CSP is the primary XSS defense; absence is flagged by Lighthouse and scanners. Astro auto-generates SHA hashes for hydration scripts that a hand-written CSP cannot cover without unsafe-inline.

**Fix (Astro).**

Enable `export default defineConfig({ security: { csp: true } })` (adds a `<meta http-equiv=content-security-policy>` with hashes). Supplement with an HTTP CSP header for directives meta cannot set (frame-ancestors) via _headers (CF static) / vercel.json / middleware (CF SSR). Avoid global unsafe-inline. Astro CSP does not support ClientRouter, Shiki, or dev mode — test with `astro build && astro preview`.

**Cloudflare / Vercel.** Astro CSP uses meta delivery so works on both CF and Vercel static. Cloudflare SSR: HTTP CSP must be set in middleware, not _headers.

**How to verify.** `curl -sI https://www.example.com | grep -i content-security-policy` shows at least default-src and frame-ancestors; or in built HTML <head> assert a CSP meta with sha256-/sha384- hashes and no unsafe-inline. Confirm zero CSP violations in DevTools console; optionally run csp-evaluator.withgoogle.com.

**Common mistakes.** Using only a meta tag (no frame-ancestors/form-action support); global unsafe-inline nullifying protection; enabling Astro CSP with ClientRouter/Shiki without manual hashing; testing only in `astro dev` (CSP off there); on Cloudflare SSR relying on _headers.

**Sources.** <https://docs.astro.build/en/reference/experimental-flags/csp/> · <https://csp-evaluator.withgoogle.com> · <https://developers.cloudflare.com/pages/configuration/headers/>

---

### 🟡 Vercel: avoid duplicate/conflicting headers between vercel.json and adapter output

`platform-vercel-headers-no-conflict` · **Medium** · stage: `build` · 🤖 automatable · check: `http_header`

**What.** @astrojs/vercel can write headers/routes to .vercel/output/config.json during build (e.g., via the staticHeaders option). A hand-maintained root vercel.json with overlapping patterns can produce duplicate or comma-joined conflicting headers (e.g., two Cache-Control or two CSP values).

**Why it matters.** Comma-joined or conflicting header values can be misinterpreted by browsers, and conflicting redirect rules cause unexpected behavior.

**Fix (Astro).**

After `astro build`, review .vercel/output/config.json against root vercel.json and keep source patterns non-overlapping. Prefer setting SSR-specific headers in Astro middleware OR vercel.json — not both for the same directive. (staticHeaders replaced experimentalStaticHeaders; a bug existed in v5.10.0 — verify on your version.)

**Cloudflare / Vercel.** Vercel-specific; not applicable to Cloudflare Pages.

**How to verify.** Inspect .vercel/output/config.json headers/routes vs root vercel.json. Live: `curl -sI https://www.example.com | grep -i cache-control` must return a single value, not a comma-joined pair; no header should appear twice.

**Common mistakes.** Maintaining root vercel.json and adapter-generated config with overlapping routes; setting CSP in both vercel.json and middleware (producing an invalid joined CSP).

**Sources.** <https://docs.astro.build/en/guides/integrations-guide/vercel/> · <https://vercel.com/docs/project-configuration/vercel-json> · <https://github.com/withastro/astro/issues/13996>

---

### ⚪ Serve an RFC 9116 security.txt at /.well-known/security.txt

`platform-security-txt-present` · **Low** · stage: `pre-launch` · 🤖 automatable · check: `http_status`

**What.** Serve a security.txt (RFC 9116) at https://example.com/.well-known/security.txt over HTTPS as text/plain with at least Contact and a future-dated Expires field.

**Why it matters.** Standardizes vulnerability disclosure; not a ranking factor but a trust signal, and only ~1.25% of the top 1M domains implement it correctly — easy differentiation.

**Fix (Astro).**

Create public/.well-known/security.txt with `Contact: mailto:security@example.com`, `Expires: 2027-01-01T00:00:00Z`, `Canonical: https://example.com/.well-known/security.txt`, `Preferred-Languages: en`. The public/ dir maps to the build root; update Expires annually.

**Cloudflare / Vercel.** No special config on either Cloudflare Pages or Vercel.

**How to verify.** `curl -s https://example.com/.well-known/security.txt | grep -E '^(Contact|Expires):'`; assert 200, Content-Type text/plain, and an Expires date in the future.

**Common mistakes.** Past-dated (stale/invalid) Expires; serving as text/html; missing the Expires field.

**Sources.** <https://securitytxt.org/> · <https://datatracker.ietf.org/doc/rfc9116/> · <https://www.uriports.com/blog/security-txt-in-2025/>

---

## Analytics, Monitoring & Trust

Proving the site works and earning trust: analytics, Search Console/Bing verification, uptime/error monitoring, and the E-E-A-T pages users and Google expect.

### 🔴 Analytics installed sitewide and firing pageviews (including on View Transitions)

`trust-analytics-installed-firing` · **Critical** · stage: `pre-launch` · 🤖 automatable · check: `body_regex`

**What.** A web analytics solution (GA4, Plausible, Cloudflare/Vercel Web Analytics, Fathom) is present in a shared layout on every page and confirmed to send pageview events. If ClientRouter (<ViewTransitions />) is enabled, pageviews must also re-fire on client-side navigation.

**Why it matters.** Without working analytics there is no traffic, conversion, or SEO baseline data — and it can never be recovered retroactively. With ClientRouter, scripts that only fire on initial load miss 80-95% of navigations, so multi-page sessions collapse to single-page sessions and bounce rate is massively overstated.

**Fix (Astro).**

Add the analytics snippet to a shared BaseLayout.astro <head>. For GA4/GTM inline scripts use is:inline; for external-src scripts (Plausible) do NOT use is:inline (it applies only to inline bodies). For ClientRouter, re-fire pageviews on the astro:page-load event (NOT astro:after-swap, which fires before the page is visible): document.addEventListener('astro:page-load', () => gtag('event','page_view',{page_path:location.pathname})). If GA4 sends its own pageview, set { send_page_view: false } to avoid double counting. Plausible and Cloudflare/Vercel beacons hook history.pushState automatically and need no extra wiring.

**Cloudflare / Vercel.** Cloudflare Web Analytics auto-inject fails silently with Cache-Control: no-transform — use the manual beacon snippet as fallback. Vercel Analytics is opt-in via @vercel/analytics: add the <Analytics /> component to the layout.

**How to verify.** Fetch page HTML and assert an analytics script tag in <head>. Then run a headless browser: load the page and assert a request to www.google-analytics.com/g/collect, plausible.io/api/event, or cloudflareinsights.com/cdn-cgi/rum fires within 5s. With ClientRouter, navigate A→B without a full reload and assert two distinct pageview events with different paths.

**Common mistakes.** Using astro:after-swap instead of astro:page-load; double-counting by leaving GA4 auto pageview on while also firing manually; adding is:inline to an external-src script; installing analytics only on the homepage layout; CF Web Analytics auto-inject silently failing when a Cache-Control: no-transform header is present.

**Sources.** <https://docs.astro.build/en/guides/view-transitions/> · <https://developers.cloudflare.com/web-analytics/get-started/> · <https://webreaper.dev/posts/astro-google-tag-manager-ga4/>

---

### 🔴 Cookie consent banner gating non-essential scripts (GDPR / ePrivacy)

`trust-cookie-consent-gdpr` · **Critical** · stage: `pre-launch` · 👤 manual · check: `manual`

**What.** If the site sets cookies or persistent identifiers for analytics/ads/tracking (GA4 without Consent Mode v2, Meta Pixel, Hotjar), an opt-in consent banner must be shown to EU visitors and those scripts must not load before consent is granted.

**Why it matters.** The EU/UK ePrivacy Directive requires prior informed opt-in for non-essential cookies; GDPR fines reach €20M or 4% of global turnover (CNIL fined Google €325M in Sept 2025 for banner dark patterns). GA4 without Consent Mode v2 must not load before consent.

**Fix (Astro).**

Prefer cookieless analytics (Plausible, Cloudflare/Vercel Web Analytics) to avoid a banner entirely. If using GA4, deploy a CMP (CookieYes, Usercentrics) with Consent Mode v2 where all four signals (ad_storage, ad_user_data, ad_personalization, analytics_storage) default to 'denied' for EU users, and gate script injection behind CMP callbacks. Defaulting to 'granted' is the single most common violation.

**Cloudflare / Vercel.** Cloudflare and Vercel Web Analytics are cookieless and generally need no banner for the beacon itself, but both process data on US infrastructure — verify adequacy/Schrems II coverage for your jurisdiction.

**How to verify.** Load the site from an EU locale (Accept-Language: de) in a private window and intercept all network requests for the first 5s: assert no analytics/tracking requests fire before interacting with the consent dialog. Confirm no _ga cookie exists pre-consent (DevTools → Application → Cookies) and that no consent checkbox is pre-checked.

**Common mistakes.** Pre-checking analytics in the banner; setting Consent Mode v2 default to 'granted'; not gating Hotjar/Meta Pixel behind consent; assuming Cloudflare/Vercel Web Analytics never needs any legal basis (no cookie is set, but US data transfer may still need a Schrems II assessment).

**Sources.** <https://plausible.io/blog/legal-assessment-gdpr-eprivacy> · <https://www.bounteous.com/insights/2025/07/30/top-7-google-consent-mode-mistakes-and-how-fix-them-2025/> · <https://www.goodwinlaw.com/en/insights/publications/2025/09/insights-practices-dpc-cnil-imposes-record-325-million-fine>

---

### 🔴 Google Search Console Domain property verified via DNS TXT (not only HTML tag)

`trust-gsc-domain-property-dns-verified` · **Critical** · stage: `pre-launch` · 🤖 automatable · check: `robots`

**What.** A GSC Domain property (covers all protocols and subdomains) is created and verified using a DNS TXT record. The HTML meta-tag method must not be the sole verification method.

**Why it matters.** Without verification you cannot submit sitemaps, inspect URLs, see crawl errors, or read CWV field data. Only the Domain property type covers https/http and www/non-www under one property. HTML-tag verification is fragile — any layout/BaseHead refactor that drops the tag revokes access; DNS TXT survives full rebuilds, a known cause of post-launch SEO monitoring outages.

**Fix (Astro).**

No Astro code needed. Add a TXT record on the apex (@): google-site-verification=<token> at your registrar or Cloudflare DNS panel, wait for propagation, then verify the Domain property in GSC. Keep the meta tag only as a secondary method. Persist the TXT record indefinitely — GSC re-checks ownership and will unverify if it is removed.

**Cloudflare / Vercel.** Cloudflare Pages: add the TXT record in the Cloudflare DNS dashboard (domain already proxied through CF). Vercel with a custom domain: add via the registrar's DNS panel or Vercel's DNS tab.

**How to verify.** Run dig TXT example.com and assert a google-site-verification= record is present. Confirm in GSC → Settings → Ownership verification that the Domain property shows 'Verified' via the DNS method. Optionally remove the HTML meta tag on a test branch, redeploy, and confirm GSC still shows verified.

**Common mistakes.** Using a URL-prefix property (misses http:// and www variants); relying only on the HTML meta tag and losing access after a BaseHead refactor; adding the TXT record on www instead of the apex; removing the TXT record after first verification.

**Sources.** <https://support.google.com/webmasters/answer/9008080?hl=en> · <https://www.incremys.com/en/resources/blog/google-search-console-validation>

---

### 🔴 Sitemap submitted to Google Search Console with zero errors

`trust-gsc-sitemap-submitted` · **Critical** · stage: `pre-launch` · 🤖 automatable · check: `sitemap`

**What.** The sitemap-index.xml produced by @astrojs/sitemap is submitted in GSC (Sitemaps → Add a new sitemap) and reports Success with 0 errors, with submitted URL count matching the page count.

**Why it matters.** Submitting accelerates initial crawl and surfaces submitted-vs-indexed counts, warnings, and errors. Without it, Googlebot discovers pages only via links, which can take days to weeks for a new domain.

**Fix (Astro).**

Install @astrojs/sitemap and set site in astro.config.mjs: defineConfig({ site:'https://example.com', integrations:[sitemap()] }). The build emits /sitemap-index.xml and /sitemap-0.xml. Add 'Sitemap: https://example.com/sitemap-index.xml' to public/robots.txt. Submit the index (not sitemap-0.xml) in GSC.

**Cloudflare / Vercel.** Both Cloudflare Pages and Vercel serve the sitemap as a static file in static output mode; no adapter changes needed.

**How to verify.** GET https://example.com/sitemap-index.xml → 200, Content-Type application/xml, valid XML with at least one <sitemap> child. In GSC → Sitemaps assert Status = Success and a plausible discovered-URL count.

**Common mistakes.** Omitting site in astro.config.mjs (sitemap URLs become relative/invalid); over-aggressive filter excluding key pages; submitting sitemap-0.xml instead of the index.

**Sources.** <https://docs.astro.build/en/guides/integrations-guide/sitemap/> · <https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap>

---

### 🟠 About and Contact pages present with real info and a working contact method

`trust-about-contact-pages-present` · **High** · stage: `pre-launch` · 🤖 automatable · check: `http_status`

**What.** An About page (real people/organization, credentials, history) and a Contact page (working email, contact form, or physical address) both exist, are publicly accessible, and are linked from nav and/or footer.

**Why it matters.** Google's Quality Rater Guidelines evaluate 'who is responsible for this site' and the ease of contacting the owner as primary trust factors; their absence lowers quality ratings. GDPR also requires a contact method for data subject requests.

**Fix (Astro).**

Create src/pages/about.astro with named individuals, photos (Astro <Image /> with alt text), roles, and Person schema; create src/pages/contact.astro with a mailto: fallback plus a form wired to a serverless/third-party handler (Astro static output cannot process forms). Link both from header nav and/or footer.

**Cloudflare / Vercel.** Form handling: Cloudflare Workers (CF Pages) or Vercel Functions; both also support Formspree/Web3Forms for static forms.

**How to verify.** GET the homepage and assert nav/footer <a> links to /about and /contact. GET /about → 200 with >200 words (non-placeholder heuristic). GET /contact → 200 with a mailto: link or a <form> with an action/endpoint.

**Common mistakes.** Boilerplate About text with only the name swapped; no named individuals for people-oriented businesses; a contact form with no working backend; an email shown as an image (not crawlable/accessible).

**Sources.** <https://magcloudsolutions.com/2026/01/15/e-e-a-t-explained-how-to-build-trust-and-authority-for-seo-2026-guide/> · <https://hyfweb.com/e-e-a-t-seo-in-2026-to-build-trust-signals-that-rank/>

---

### 🟠 Author bio pages exist for every author referenced in Article schema

`trust-author-bio-pages-present` · **High** · stage: `pre-launch` · 🤖 automatable · check: `json_ld`

**What.** Every author named in Article/BlogPosting JSON-LD has a live bio page at the schema's author.url, containing name, photo, credentials, experience, and professional profile links.

**Why it matters.** Author bios paired with author schema are core E-E-A-T components in 2026, especially for YMYL content where Google weighs author credentials. An orphaned author.url that 404s is worse than no schema.

**Fix (Astro).**

Use an Astro content collection (src/content/authors/*.md) and generate pages with getStaticPaths() over getCollection('authors'). In Astro v5, route by entry id, NOT slug (a v5 breaking change). Link each article to its author bio page.

**Cloudflare / Vercel.** No platform differences.

**How to verify.** Extract every author.url from Article JSON-LD across the site and GET each one; assert all return 200 with body word count > 100.

**Common mistakes.** author.url that 404s; a generic 'Editorial Team' author on all posts; not linking articles to bio pages; using slug instead of id in v5 content-collection routing.

**Sources.** <https://hyfweb.com/e-e-a-t-seo-in-2026-to-build-trust-signals-that-rank/> · <https://docs.astro.build/en/guides/upgrade-to/v5/>

---

### 🟠 Bing Webmaster Tools verified and sitemap submitted

`trust-bing-webmaster-verified-sitemap` · **High** · stage: `pre-launch` · 🤖 automatable · check: `external_tool`

**What.** A Bing Webmaster Tools property is verified (CNAME DNS record, meta tag, or XML file) and the sitemap URL is submitted in its Sitemaps section.

**Why it matters.** Bing/DuckDuckGo/Yahoo together hold roughly 15-25% of US/UK desktop search, and Bing-native IndexNow signals feed multiple engines. Without BWT you have no visibility into Bing crawl, indexation, or security alerts.

**Fix (Astro).**

Prefer the DNS CNAME method (no code changes). Otherwise add <meta name='msvalidate.01' content='<VALUE>' /> to the <head> of BaseLayout.astro. Submit https://example.com/sitemap-index.xml in the BWT UI.

**Cloudflare / Vercel.** No platform-specific sitemap differences; CNAME availability may vary by registrar.

**How to verify.** Query the Bing Webmaster API /sites endpoint and assert the site is verified, or GET the homepage and parse for <meta name='msvalidate.01'> (meta method), or confirm the CNAME via dig. In BWT confirm Verified = Yes and the sitemap is listed.

**Common mistakes.** Relying on the one-time GSC auto-import (later GSC changes don't sync); not re-submitting the sitemap after a major URL-structure change.

**Sources.** <https://blogs.bing.com/webmaster/July-2025/Keeping-Content-Discoverable-with-Sitemaps-in-AI-Powered-Search>

---

### 🟠 Core Web Vitals monitored via RUM and the GSC CWV report

`trust-cwv-rum-and-gsc-monitoring` · **High** · stage: `post-launch` · 🤖 automatable · check: `lighthouse`

**What.** Real-user CWV (LCP, INP, CLS) are collected immediately via RUM (web-vitals library or a RUM tool), and after ~28 days of traffic the GSC Core Web Vitals report is reviewed with remediation underway for any 'Poor' URLs (LCP >4s, INP >500ms, CLS >0.25).

**Why it matters.** Lighthouse lab runs cannot measure INP and CrUX lags 28 days, so RUM is the only immediate field signal; GSC then provides ongoing field data. CWV are confirmed page-experience ranking signals (FID was retired and replaced by INP on March 12, 2024).

**Fix (Astro).**

npm install web-vitals and report from a deferred/idle inline script in Layout.astro: onLCP(send); onINP(send); onCLS(send) (load with client:idle, not client:load, to avoid TBT). Lean on Astro strengths: <Image /> for intrinsic width/height (no CLS) and AVIF/WebP; client:visible/client:idle over client:load for INP; loading='eager' + fetchpriority='high' on the LCP hero image.

**Cloudflare / Vercel.** Cloudflare and Vercel edge caching improve TTFB but do not fix the in-browser LCP/INP/CLS metrics. Cloudflare Web Analytics and Vercel Analytics can both report CWV as a zero/low-JS RUM option.

**How to verify.** Confirm web-vitals (or a verified RUM integration) in package.json and built HTML. For field data use the PageSpeed Insights API (strategy=mobile) and assert loadingExperience LCP category 'FAST' and INTERACTION_TO_NEXT_PAINT category not 'SLOW'; add Lighthouse CI gates (LCP <2500ms, CLS <0.1). In GSC → Core Web Vitals, confirm zero 'Poor' URLs or an active remediation plan.

**Common mistakes.** Relying solely on desktop Lighthouse (CrUX is mobile-weighted, no INP); reporting metrics nowhere; loading web-vitals with client:load; still referencing FID; ignoring CLS from web fonts shifting layout.

**Sources.** <https://github.com/GoogleChrome/web-vitals> · <https://developers.google.com/search/docs/appearance/core-web-vitals> · <https://web.dev/blog/inp-cwv-march-12>

---

### 🟠 JavaScript error/exception monitoring configured with source maps

`trust-error-monitoring-configured` · **High** · stage: `post-launch` · 🤖 automatable · check: `external_tool`

**What.** A client-side (and, in SSR mode, server-side) error monitor captures JS exceptions, unhandled rejections, and network errors, with source maps uploaded and alerting on error-rate spikes.

**Why it matters.** Undetected JS errors cause invisible UX failures (broken forms, search, navigation) that hurt conversions and dwell time; post-launch JS regressions are common and invisible without monitoring.

**Fix (Astro).**

npm install @sentry/astro and add to astro.config.mjs: sentry({ dsn: import.meta.env.SENTRY_DSN, sourceMapsUploadOptions: { project:'my-project', authToken: import.meta.env.SENTRY_AUTH_TOKEN } }). SSR mode auto-adds middleware for server capture (Astro >= 3.5.2); static output captures client-side errors only. Guard against init in dev only.

**Cloudflare / Vercel.** Cloudflare Pages: @sentry/astro for client errors, @sentry/cloudflare for Workers/SSR; OTLP log export to Sentry available (GA Sept 2025). Vercel: use the Sentry log drain integration for build and runtime logs.

**How to verify.** From the live site console run Sentry.captureException(new Error('test')) and confirm it appears in the Sentry dashboard within ~60s with a readable (source-mapped) stack trace. Alternatively assert the Sentry init script is present in page HTML.

**Common mistakes.** Init gated to development only (excluded in prod via NODE_ENV); missing sourceMapsUploadOptions (minified traces); expecting server-side capture in static output (client-only there).

**Sources.** <https://docs.sentry.io/platforms/javascript/guides/astro/> · <https://sentry.io/changelog/log-drains-for-cloudflare-vercel-heroku-and-supabase/>

---

### 🟠 Post-launch GSC indexing review; no staging noindex/robots leak in production

`trust-gsc-indexation-no-staging-noindex` · **High** · stage: `post-launch` · 🤖 automatable · check: `html_element`

**What.** Within 1-4 weeks of launch the GSC Page Indexing report is reviewed so indexed pages roughly match sitemap count, and significant Excluded/Error categories (5xx, redirect error, blocked by robots.txt, noindex) are investigated. Production must carry no leftover staging noindex tag or Disallow.

**Why it matters.** Newly launched sites frequently ship accidental noindex tags or a staging Disallow: / that block indexation of key pages. The GSC indexing report is the only reliable confirmation Googlebot successfully processed pages.

**Fix (Astro).**

Audit before deploy: grep -r 'noindex' src/layouts/ and check public/robots.txt. Gate any staging-only noindex behind a production env flag (e.g. PUBLIC_SITE_ENV) so the layout never emits it in production. Verify live with curl -A 'Googlebot' https://example.com/robots.txt.

**Cloudflare / Vercel.** On both Cloudflare Pages and Vercel, set a production-specific env variable so the layout conditionally omits staging-only noindex tags.

**How to verify.** GET each key URL and assert no X-Robots-Tag: noindex header and no <meta name='robots' content='noindex'> in HTML. Use the GSC URL Inspection API (urlInspectionResult.indexingState) and review Indexing → Pages for unexpected exclusions.

**Common mistakes.** Shipping production with the staging noindex meta still in the layout; copying a Disallow: / robots.txt from staging; expecting instant indexation (new sites may take 4-14 days for first crawl).

**Sources.** <https://support.google.com/webmasters/answer/7451001?hl=en> · <https://www.paperstreet.com/blog/checklist-for-google-indexing-of-new-websites/>

---

### 🟠 Every page emits its own complete <head> meta set (no transition persistence assumptions)

`trust-per-page-head-meta-complete` · **High** · stage: `build` · 🤖 automatable · check: `html_head`

**What.** Each page declares its full meta set (title, description, og:title, og:image, canonical) in its layout rather than assuming tags persist from a previously visited page under ClientRouter.

**Why it matters.** ClientRouter diffs and replaces <head> on navigation. A page that omits og:image expecting it to carry over will have it missing when shared or crawled directly. transition:persist is not supported for meta tags (it targets DOM elements like video/UI islands).

**Fix (Astro).**

Ensure Layout.astro (or a Head component) always outputs the complete meta set from frontmatter/props on every route. Do not put transition:persist on meta tags.

**Cloudflare / Vercel.** Rendering concern; identical on Cloudflare Pages and Vercel.

**How to verify.** For each sampled page, fetch raw HTML with curl (no JS) and assert <title>, <meta name='description'>, <meta property='og:title'>, <meta property='og:image'>, and <link rel='canonical'> all exist and are non-empty. Cross-check a non-homepage URL in opengraph.xyz.

**Common mistakes.** Putting transition:persist on a shared header believing meta tags persist across transitions; omitting tags on individual non-homepage routes.

**Sources.** <https://docs.astro.build/en/guides/view-transitions/>

---

### 🟠 Privacy policy page present, footer-linked, and accurate

`trust-privacy-policy-present-linked` · **High** · stage: `pre-launch` · 🤖 automatable · check: `http_status`

**What.** A privacy policy at a stable URL (e.g. /privacy-policy) is publicly accessible, linked in the footer on all pages, and covers data collected, cookies, third-party services, user rights (GDPR/CCPA), and contact details.

**Why it matters.** Required by Google Analytics ToS, GDPR, CCPA, and ad platforms, and listed as a trust/YMYL signal in Google's Quality Rater Guidelines. Its absence is flagged as a trust deficiency.

**Fix (Astro).**

Create src/pages/privacy-policy.astro (or .md) and link it from Footer.astro: <a href='/privacy-policy'>Privacy Policy</a>. Name the actual analytics tools in use, and update it whenever new third-party scripts are added.

**Cloudflare / Vercel.** No platform differences.

**How to verify.** GET the homepage and assert the footer contains an <a> with href matching /privacy or /privacy-policy; GET that href → 200 with non-empty, non-placeholder body. Run a link checker (lychee) to confirm reachability.

**Common mistakes.** Linking a CMP's externally hosted policy (off-domain, bad for E-E-A-T); a generic template that omits the actual tools used; not updating after adding scripts.

**Sources.** <https://seolust.com/blog/the-hidden-seo-benefits-of-having-a-privacy-policy-and-terms-page> · <https://gdpr.eu/cookies/>

---

### 🟠 Uptime monitoring with alerting on key URLs

`trust-uptime-monitoring-alerting` · **High** · stage: `post-launch` · 🤖 automatable · check: `external_tool`

**What.** An uptime service checks the homepage and 2-3 critical pages at 1-5 minute intervals and alerts (email/Slack/PagerDuty) on non-200 status or response time over a threshold (e.g. >3s).

**Why it matters.** Undetected downtime serves Googlebot 5xx errors, which can reduce crawl rate or trigger de-indexation, and harms users. Monitoring with alerting is the baseline operational requirement for a launched site.

**Fix (Astro).**

Not an Astro concern. Use Uptime Kuma (self-hosted), Better Stack, or Upptime (GitHub Actions). Monitor https://example.com/, /sitemap-index.xml, and the most critical landing page, each with an alert contact configured.

**Cloudflare / Vercel.** Cloudflare Health Checks are Enterprise-only (or use a free Workers cron). Vercel exposes deployment status webhooks; pair with an external uptime monitor for continuous checks between deploys.

**How to verify.** Query the monitoring service API to confirm active monitors with alert contacts, or as a basic auditor check GET the homepage → 200, Content-Type text/html, response time < 3000ms.

**Common mistakes.** Monitoring only the homepage; alert thresholds set too high (30+ min); monitors with no alert contacts (monitoring without alerting is pointless).

**Sources.** <https://uptimekuma.org/> · <https://betterstack.com/community/comparisons/open-source-website-monitoring/>

---

### 🟡 Broken-link check pre-launch and scheduled post-launch

`trust-broken-link-check` · **Medium** · stage: `pre-launch` · 🤖 automatable · check: `http_status`

**What.** All internal links return 200 (no 404s or redirect chains) before launch, with the check re-run automatically after each deploy or weekly.

**Why it matters.** Internal 404s and redirect chains harm UX, waste crawl budget, and dilute PageRank; they are especially common after URL restructuring, migration, or content deletion.

**Fix (Astro).**

At build time run lychee against the output: npx lychee './dist/**/*.html' --base https://example.com. Post-launch schedule lychee https://example.com --recursive via a GitHub Actions cron or post-deploy CI job.

**Cloudflare / Vercel.** Run as a post-deploy step; both Cloudflare Pages and Vercel support post-deploy webhook triggers for CI.

**How to verify.** Run lychee against ./dist/ or the live URL and assert exit code 0; the report lists URL, source page, and HTTP status for any failures.

**Common mistakes.** Checking internal links only and missing broken external links; not excluding external URLs that legitimately return non-200; not re-running after content changes.

**Sources.** <https://github.com/lycheeverse/lychee>

---

### 🟡 Cookieless, consent-free analytics evaluated before defaulting to GA4

`trust-cookieless-analytics-considered` · **Medium** · stage: `pre-launch` · 🤖 automatable · check: `body_regex`

**What.** Before defaulting to GA4, evaluate whether a cookieless option (Plausible, Cloudflare/Vercel Web Analytics, Fathom, Simple Analytics) meets reporting needs, and avoid running two analytics tools without a clear reason.

**Why it matters.** GA4 needs an EU consent banner and loses data to consent rejection (a Plausible study reported GA4 captured ~55.6% of traffic vs Plausible on the same site — vendor research, disclosed as such). Cookieless tools eliminate that gap; Plausible is GDPR-compliant without a banner per an independent legal assessment.

**Fix (Astro).**

Plausible: <script defer data-domain='example.com' src='https://plausible.io/js/script.js'></script> in BaseLayout.astro head (no is:inline — external src). Cloudflare Web Analytics: enable in the CF Pages dashboard (manual snippet if a no-transform header is set). Keep GA4 only where Google Ads conversion data is required, with Consent Mode v2.

**Cloudflare / Vercel.** Cloudflare Web Analytics is free and integrated for CF Pages; Vercel Analytics is cookieless (free tier + paid). Both are supplemental when event-level conversion tracking is needed, and both involve US data transfer.

**How to verify.** GET page HTML and check <head> for exactly one analytics loader (plausible.io, cloudflareinsights.com, fathom.com, or googletagmanager.com/gtag/js) unless dual-running is intentional. Confirm requests fire in the network tab / the tool's real-time dashboard.

**Common mistakes.** Running GA4 and Plausible together with no purpose (double script weight and compliance overhead); assuming Cloudflare/Vercel Web Analytics is always GDPR-safe without a Schrems II data-transfer check; treating cookieless tools as full event-level conversion analytics.

**Sources.** <https://plausible.io/cookieless-web-analytics> · <https://plausible.io/blog/legal-assessment-gdpr-eprivacy> · <https://ethicaldatahub.com/cloudflare-analytics-cookie-banner/>

---

### 🟡 GA4 key conversion events configured and verified (if GA4 is used)

`trust-ga4-conversion-events` · **Medium** · stage: `post-launch` · 🤖 automatable · check: `external_tool`

**What.** If GA4 is the analytics platform, at least one conversion event (e.g. generate_lead, form_submit, purchase) is configured, marked as a conversion, and verified firing in DebugView; staging/preview traffic is excluded.

**Why it matters.** Pageview data alone is near-useless for business decisions; a GA4 install with no configured conversions has largely wasted the install.

**Fix (Astro).**

Fire the event in the form success handler: gtag('event','generate_lead',{ method:'contact_form' }), then mark it as a conversion in GA4 Admin → Events. With ClientRouter, re-attach form handlers on each astro:page-load (handlers bound at initial load are lost after client navigation). Gate firing by checking window.location.hostname so staging doesn't pollute data.

**Cloudflare / Vercel.** For Cloudflare Pages/Vercel preview deployments, gate firing: if (window.location.hostname === 'example.com') gtag(...).

**How to verify.** In GA4 DebugView, submit the form on the live site and assert the conversion event appears within ~30s. Automated: a headless test that submits the form, intercepts the GA4 collect endpoint, and asserts the event name in the payload.

**Common mistakes.** Marking page_view as a conversion; not testing in DebugView; firing conversions in dev/staging; attaching success handlers only at DOMContentLoaded so they're lost after View Transitions.

**Sources.** <https://astroseoblog.com/blog/astro-google-analytics-integration-guide> · <https://docs.astro.build/en/guides/view-transitions/>

---

### 🟡 IndexNow configured to push changed URLs to Bing and partner engines

`trust-indexnow-configured` · **Medium** · stage: `build` · 🤖 automatable · check: `http_status`

**What.** An IndexNow API key file is hosted at the site root and changed-page URLs are submitted to the IndexNow endpoint after each build.

**Why it matters.** IndexNow removes multi-day crawl delays for Bing, DuckDuckGo, and Yandex by proactively pushing changed URLs; Bing's 2025 guidance positions it as complementary to sitemaps for near-real-time AI-search freshness. Google does not support IndexNow as of 2026.

**Fix (Astro).**

Add the astro-indexnow integration (manual config required — astro add does not inject values): integrations:[indexnow({ key: process.env.INDEXNOW_KEY })] with site set; place <key>.txt in public/. The plugin walks final HTML at build and submits only changed URLs via hash diffing.

**Cloudflare / Vercel.** Both platforms run the Astro build before deploy so the hook fires at build time. Set INDEXNOW_KEY in the CF Pages dashboard or Vercel Project Settings → Environment Variables.

**How to verify.** GET https://example.com/<key>.txt → 200 with body equal to the key string. After a build, confirm an IndexNow submission in the CI logs, or POST a urlList to https://api.indexnow.org/indexnow and expect 200/202.

**Common mistakes.** Hosting the key only in dev so it's excluded from public/ build output; submitting every build including unchanged pages (use hash diffing).

**Sources.** <https://github.com/velohost/astro-indexnow> · <https://blog.cloudflare.com/cloudflare-now-supports-indexnow/>

---

## Anti-Patterns to Avoid

Outdated or risky tactics that waste effort or get you penalized: keyword stuffing, cloaking, indexable staging, dead meta tags, and FID-era advice.

### 🔴 Do not cloak or show different content to crawlers than to users

`antipatterns-no-cloaking` · **Critical** · stage: `build` · 🤖 automatable · check: `manual`

**What.** Never serve materially different content, markup, or redirects to Googlebot/Bingbot (detected by user-agent or IP) than you serve to real users. This includes server-rendering keyword-rich HTML only for bots while showing users something else.

**Why it matters.** Cloaking is an explicit violation of Google's spam policies and can trigger manual actions or full deindexing. With Astro SSR/edge functions it is easy to accidentally (or deliberately) branch on user-agent; the safe rule is parity for everyone.

**Fix (Astro).**

In Astro, render the same HTML regardless of user-agent. Do not branch SSR output, redirects, or `Astro.request.headers.get('user-agent')` logic to give bots special content. If you need bot-specific behavior (e.g. prerendering for JS-heavy widgets), ensure the visible content is identical to what users get. Geo/locale redirects must apply equally to bots and users and should be reversible.

**Cloudflare / Vercel.** Both Vercel Functions and Cloudflare Pages Functions expose the request UA easily; resist the temptation to branch content on it.

**How to verify.** Fetch a page twice with a normal browser UA and with `Googlebot` UA and diff the rendered HTML/main content and final URL; any meaningful difference in body content or redirect target is cloaking. Use Google Search Console URL Inspection ("View crawled page") and compare to the live page a user sees.

**Common mistakes.** User-agent sniffing to swap content; redirecting bots to a different page than users; injecting hidden keyword blocks only into the SSR response. Note: serving WebP/AVIF or compression by Accept header is NOT cloaking.

**Sources.** <https://developers.google.com/search/docs/essentials/spam-policies#cloaking> · <https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering>

---

### 🔴 Never let staging or preview deployments get indexed

`antipatterns-no-indexable-staging-preview` · **Critical** · stage: `pre-launch` · 🤖 automatable · check: `http_header`

**What.** Preview and staging URLs (Cloudflare Pages *.pages.dev preview aliases, Vercel *.vercel.app preview deployments, branch deploys) must not be crawlable or indexable, and they must not compete with the production domain.

**Why it matters.** Indexed staging/preview domains create exact-duplicate content that splits ranking signals, can outrank or replace the canonical production domain in results, and may leak unfinished or confidential content. This is one of the most common and most damaging launch mistakes.

**Fix (Astro).**

Gate non-production environments with HTTP Basic Auth or platform access protection so crawlers never reach them, and emit `X-Robots-Tag: noindex, nofollow` plus a `robots.txt` `Disallow: /` on those hosts only. In Astro, branch on the deploy context: read `import.meta.env.PROD`/a custom `PUBLIC_ENV` var (or `CF_PAGES_BRANCH` / `VERCEL_ENV`) and conditionally render `<meta name="robots" content="noindex">` and serve a blocking robots.txt for any host that is not the production domain. Never hardcode noindex into shared layout where it can leak to production.

**Cloudflare / Vercel.** Vercel: set Deployment Protection (Vercel Authentication) on Preview/branch deployments; use `VERCEL_ENV` (production|preview|development) to branch. Cloudflare Pages: enable Access policy on preview deployments and branch on `CF_PAGES_BRANCH`; the production alias is the only one that should be public.

**How to verify.** Request a preview URL (e.g. a *.vercel.app or *.pages.dev preview) and assert it returns `X-Robots-Tag: noindex` (or 401 behind auth) and a `robots.txt` with `Disallow: /`; then assert the production domain does NOT carry those. Also `site:*.vercel.app yourbrand` / `site:*.pages.dev` in Google to confirm nothing leaked.

**Common mistakes.** Hardcoding noindex globally and forgetting to strip it for production; protecting the canonical production preview alias but leaving per-branch preview aliases open; relying only on robots.txt (which blocks crawl but not indexing of already-known URLs).

**Sources.** <https://developers.google.com/search/docs/crawling-indexing/block-indexing> · <https://vercel.com/docs/security/deployment-protection> · <https://developers.cloudflare.com/pages/configuration/preview-deployments/>

---

### 🟠 Don't buy links or build spammy link schemes

`antipatterns-no-buying-or-spammy-links` · **High** · stage: `post-launch` · 👤 manual · check: `manual`

**What.** Do not participate in link schemes: paid links that pass PageRank, large-scale guest-post/article spam for links, link exchanges, PBNs, or sitewide footer/widget links with keyword-rich anchors.

**Why it matters.** Link schemes are a Google spam policy violation that can trigger manual actions and algorithmic suppression. For a freshly launched site this is a common growth-hack temptation that risks the whole domain.

**Fix (Astro).**

Earn links via genuinely useful content and outreach. Any paid or sponsored/affiliate link you control must be marked `rel="sponsored"` or `rel="nofollow"`; user-generated links should use `rel="ugc"`. Set these attributes on the relevant `<a>` tags in your Astro components/MDX.

**How to verify.** Manual link-profile review (Search Console Links report / a backlink tool) for unnatural anchor patterns and known link-farm sources; audit outbound paid/affiliate links for missing `rel="sponsored"`/`nofollow`.

**Common mistakes.** Buying a backlink package on launch; mass guest posting with exact-match anchors; forgetting rel=sponsored on affiliate links.

**Sources.** <https://developers.google.com/search/docs/essentials/spam-policies#link-spam> · <https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links>

---

### 🟠 Avoid doorway pages and mass-generated thin location/keyword pages

`antipatterns-no-doorway-pages` · **High** · stage: `build` · 👤 manual · check: `manual`

**What.** Do not generate large sets of near-identical, low-value pages that exist only to rank for permutations of keywords or locations (e.g. "[service] in [city]" templated pages with swapped tokens and no unique substance) that all funnel users to the same destination.

**Why it matters.** Doorway pages are a named Google spam policy violation. Astro's content collections and `getStaticPaths` make it trivially easy to programmatically spin up thousands of templated pages, which is exactly the pattern Google penalizes when the pages lack unique value.

**Fix (Astro).**

When using `getStaticPaths` to fan out pages, ensure each generated page has substantively unique, useful content (unique copy, data, media) and a distinct intent. Consolidate thin permutations into fewer richer pages. If pages must exist for navigation but add no search value, mark them `noindex`.

**How to verify.** Sample a set of programmatically generated routes and compute body-text similarity; high cross-page similarity with only token substitution flags doorway/thin patterns. Manually review whether each templated page would stand alone as useful. Watch Search Console for "Thin content" / manual actions.

**Common mistakes.** Generating a page per city/keyword from a spreadsheet with identical boilerplate; auto-generating tag/filter pages with near-zero unique content and leaving them indexable.

**Sources.** <https://developers.google.com/search/docs/essentials/spam-policies#doorways> · <https://developers.google.com/search/docs/essentials/spam-policies#scaled-content-abuse>

---

### 🟠 No hidden text, sneaky links, or keyword stuffing

`antipatterns-no-hidden-text-keyword-stuffing` · **High** · stage: `build` · 🤖 automatable · check: `body_regex`

**What.** Do not hide text or links from users to manipulate rankings (white-on-white text, `display:none`/`visibility:hidden`/off-screen positioning used to stash keywords, 1px fonts, alt-text stuffed with keywords) and do not stuff unnatural repeated keyword lists into copy, headings, or meta.

**Why it matters.** Hidden text and keyword stuffing are direct spam-policy violations that risk manual actions, and they hurt real UX and accessibility. Modern Google ranks on semantic relevance, so stuffing provides no upside and real downside.

**Fix (Astro).**

Write natural prose for humans. Use CSS hiding only for genuine UX patterns (accessible toggles, screen-reader-only labels with real meaning), not to conceal keyword text. Keep `alt` attributes descriptive of the image, not keyword lists. Remove any visually-hidden blocks whose only purpose is keywords.

**How to verify.** Scan rendered HTML/CSS for text nodes with near-invisible styling (color matching background, font-size <= 1px, large negative text-indent, off-screen absolute positioning containing body keywords). Compute keyword density on main content and flag unnatural repetition; check for stuffed alt attributes.

**Common mistakes.** Stashing a keyword paragraph in a `display:none` div; repeating the target phrase dozens of times; stuffing meta description or alt text with comma-separated keywords.

**Sources.** <https://developers.google.com/search/docs/essentials/spam-policies#hidden-text-and-links> · <https://developers.google.com/search/docs/essentials/spam-policies#keyword-stuffing>

---

### 🟡 Don't block CSS, JS, or asset directories in robots.txt

`antipatterns-no-blocking-css-js-in-robots` · **Medium** · stage: `build` · 🤖 automatable · check: `robots`

**What.** Do not `Disallow` your CSS, JavaScript, image, or `_astro`/build asset directories in robots.txt. Google needs to fetch these to render and evaluate the page.

**Why it matters.** Blocking render-critical resources prevents Googlebot from seeing the page as users do, which can cause broken rendering evaluation, missed content, and mobile-usability issues. It's a legacy practice from when crawlers didn't render JS.

**Fix (Astro).**

Keep robots.txt minimal: allow asset paths (including Astro's `/_astro/` hashed bundle directory and `/images/`). Only disallow truly non-public or infinite-crawl-space paths (e.g. faceted-search query URLs). Generate robots.txt via an Astro endpoint or a vetted integration rather than hand-copying an old one.

**How to verify.** Fetch `/robots.txt` and assert it does not `Disallow` `/_astro/`, `*.css`, `*.js`, or image directories; cross-check with Search Console URL Inspection "Page resources" for blocked render resources.

**Common mistakes.** Pasting a CMS-era robots.txt that blocks `/assets/` or `/js/`; disallowing the whole site (`Disallow: /`) on production by accident.

**Sources.** <https://developers.google.com/search/docs/crawling-indexing/robots/intro> · <https://developers.google.com/search/docs/crawling-indexing/robots/create-robots-txt>

---

### 🟡 Don't add fake, invisible, or irrelevant structured data

`antipatterns-no-fake-or-misused-structured-data` · **Medium** · stage: `build` · 🤖 automatable · check: `json_ld`

**What.** Do not mark up content that isn't visible on the page, fabricate reviews/ratings, apply schema types that don't match the page (e.g. Product/Recipe schema on a page that is neither), or self-serve aggregate review markup. This is structured-data spam.

**Why it matters.** Misleading or invisible structured data violates Google's structured-data guidelines and can cause a manual action that strips ALL rich results from the site, not just the bad page.

**Fix (Astro).**

Only emit JSON-LD that describes content actually present and visible on the page. Build your `<script type="application/ld+json">` from the same data you render (e.g. content collection frontmatter), keep types accurate (Article, BreadcrumbList, Organization, etc.), and don't inject self-authored review/rating markup.

**How to verify.** Validate every page's JSON-LD with the Rich Results Test / Schema.org validator; assert each declared entity's key fields correspond to on-page visible content, and flag review/rating, Product, or FAQ markup that has no matching visible content.

**Common mistakes.** Copy-pasting a Product schema block onto blog pages; fabricating aggregateRating; marking up FAQ content that isn't shown to users.

**Sources.** <https://developers.google.com/search/docs/appearance/structured-data/sd-policies> · <https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data>

---

### 🟡 Optimize INP, not the retired FID metric

`antipatterns-no-fid-era-cwv-advice` · **Medium** · stage: `post-launch` · 🤖 automatable · check: `lighthouse`

**What.** Do not target First Input Delay (FID) — it was retired as a Core Web Vital in March 2024 and replaced by Interaction to Next Paint (INP). Advice and tooling that still optimize for FID are out of date.

**Why it matters.** FID only measured input delay of the first interaction and was easy to pass while the page still felt sluggish. INP measures responsiveness across all interactions and is the current ranking-relevant CWV, so optimizing for the old metric misses real UX problems.

**Fix (Astro).**

Measure and optimize INP (target <= 200ms, plus LCP <= 2.5s and CLS <= 0.1). In Astro, leverage its zero/low-JS default: ship HTML-first, use Islands with the lightest viable `client:*` directive (`client:visible`/`client:idle` over `client:load`), avoid hydrating large interactive trees, and break up long tasks. Use the field-data INP from CrUX/Search Console, not just lab FID.

**How to verify.** Run Lighthouse / PageSpeed Insights and CrUX field data and assert INP is reported and within budget; flag any config, third-party script, or doc still referencing FID as the responsiveness target.

**Common mistakes.** Reporting a passing FID and declaring CWV done; following 2022-era guides that never mention INP; over-hydrating Astro islands with `client:load` everywhere.

**Sources.** <https://web.dev/blog/inp-cwv-march-12> · <https://web.dev/articles/inp> · <https://docs.astro.build/en/reference/directives-reference/#client-directives>

---

### 🟡 Never combine noindex with a robots.txt Disallow on the same URL

`antipatterns-no-noindex-plus-disallow-conflict` · **Medium** · stage: `build` · 🤖 automatable · check: `robots`

**What.** Do not try to deindex a page by both `noindex`-ing it and `Disallow`-ing it in robots.txt. If the URL is blocked from crawling, Google can't see the noindex directive, so the page can still get indexed (URL-only) and won't drop out.

**Why it matters.** This is a self-defeating, extremely common pattern. The robots block prevents Google from reading the very tag that would remove the page, so the page lingers in the index as a thin URL-only entry.

**Fix (Astro).**

To remove a page from the index: allow it to be crawled and serve `<meta name="robots" content="noindex">` (or `X-Robots-Tag: noindex` header). Only after it has dropped out should you consider disallowing it. To merely save crawl budget on never-index junk, disallow is fine — but don't expect existing indexed URLs to disappear from a disallow alone.

**How to verify.** Cross-reference: for each URL carrying noindex, assert it is NOT also Disallowed in robots.txt. Flag any URL that is both noindex and robots-blocked.

**Common mistakes.** Adding both 'just to be safe'; using robots.txt to remove an already-indexed page instead of noindex; disallowing a path then wondering why it's still in search results.

**Sources.** <https://developers.google.com/search/docs/crawling-indexing/block-indexing> · <https://developers.google.com/search/docs/crawling-indexing/robots/intro>

---

### ⚪ Don't rely on exact-match domains or keyword-stuffed URLs

`antipatterns-no-exact-match-domain-spam` · **Low** · stage: `build` · 👤 manual · check: `manual`

**What.** Do not assume a keyword-stuffed exact-match domain (e.g. best-cheap-running-shoes-online.com) or hyphen-laden keyword URLs will rank. Google's EMD update (2012) removed the boost low-quality exact-match domains used to get.

**Why it matters.** Choosing a brand strategy around keyword domains is a persistent myth; it produces a spammy, low-trust brand and no ranking advantage. Worse, over-optimized hyphenated keyword URLs read as spam to users.

**Fix (Astro).**

Pick a short, memorable, brandable domain. Keep URL slugs clean and descriptive but human (`/running-shoes`, not `/best-cheap-running-shoes-online-2026`). In Astro, derive slugs from content collection IDs/titles and avoid jamming keywords into the path.

**How to verify.** Manual review of domain and slug strategy: flag domains/slugs that are long strings of hyphenated target keywords rather than a brand + concise topic.

**Common mistakes.** Buying an EMD expecting a ranking head start; generating slugs that concatenate every keyword; stuffing dates/keywords into permalinks.

**Sources.** <https://developers.google.com/search/docs/crawling-indexing/url-structure> · <https://www.searchenginejournal.com/google-emd-update/>

---

### ⚪ Drop the keywords meta tag (and other dead meta SEO tags)

`antipatterns-no-keywords-meta-tag` · **Low** · stage: `build` · 🤖 automatable · check: `html_head`

**What.** Do not add `<meta name="keywords">`; it has been ignored by Google for ranking since 2009. Also skip other defunct ranking meta tags (e.g. `<meta name="revisit-after">`, `<meta name="author">` as an SEO signal, generic `<meta name="distribution">`).

**Why it matters.** These tags provide zero ranking benefit, clutter the head, and a populated keywords tag visibly exposes your target keyword list to competitors. Including them signals outdated SEO advice.

**Fix (Astro).**

Remove any `<meta name="keywords">` from your Astro layout/head. Keep only meta tags that do something: `<title>`, `<meta name="description">`, robots, canonical, viewport, charset, and Open Graph/Twitter tags. Centralize head tags in a single `<BaseHead>` component so dead tags don't creep back in.

**How to verify.** Parse the HTML `<head>` and assert `<meta name="keywords">` (and other deprecated SEO meta tags) are absent across pages.

**Common mistakes.** Copying a 2010-era head template; an SEO plugin or CMS field that re-injects a keywords tag.

**Sources.** <https://developers.google.com/search/blog/2009/09/google-does-not-use-keywords-meta-tag> · <https://developers.google.com/search/docs/crawling-indexing/special-tags>

---

### ⚪ Don't rely on rel=next/prev as a Google SEO tactic

`antipatterns-no-rel-next-prev-for-google` · **Low** · stage: `build` · 🤖 automatable · check: `html_head`

**What.** Do not add `<link rel="next">`/`<link rel="prev">` expecting Google to use them for pagination — Google dropped support in 2019 and does not crawl URLs discovered only via these hints. They are not an SEO requirement.

**Why it matters.** Treating rel=next/prev as a Google ranking/indexing mechanism is a myth that wastes effort and can hide pagination behind links Google ignores. (They remain harmless and may still help Bing and assistive tech, so this is a low-severity 'don't depend on it' rather than 'never use it'.)

**Fix (Astro).**

For paginated Astro routes built with `paginate()`/`getStaticPaths`, give each page a self-referencing canonical and ensure every paginated URL is reachable via crawlable in-page `<a href>` links (and listed in the sitemap) so Google can discover them independently of rel=next/prev. Keep rel=next/prev only if you specifically care about Bing or accessibility.

**How to verify.** Parse the head: if rel=next/prev are present, verify paginated pages are ALSO linked via real anchors and present in the sitemap (so discovery doesn't depend on the hints). Confirm each paginated page has a self-canonical to itself, not to page 1.

**Common mistakes.** Canonicalizing every paginated page to page 1 (drops deep pages from the index); using rel=next/prev as the only link between pages so Google never crawls them.

**Sources.** <https://developers.google.com/search/blog/2019/03/two-pages-in-one-or-pagination> · <https://ahrefs.com/blog/rel-prev-next-pagination/>

---

