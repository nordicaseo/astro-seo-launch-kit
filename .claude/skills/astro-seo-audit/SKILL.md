---
name: astro-seo-audit
description: Audit and fix the SEO of an Astro site before (and after) launch on Cloudflare Pages or Vercel. Runs the Astro SEO Launch Kit's automated auditor against a URL, then works the full 209-point checklist — sitemap, robots, canonical tags, metadata, Open Graph, structured data, Core Web Vitals, images, redirects, accessibility, security headers, and trust signals — fixing issues in the Astro codebase until the site is launch-perfect. Use when the user asks to "check SEO", "audit my site", "is my site ready to launch", "fix SEO", run a pre-launch/SEO checklist, or improve search rankings for an Astro project.
---

# Astro SEO Audit & Fix

Make an Astro site's SEO **launch-perfect**: run the automated auditor, then close every gap it
can't fix automatically, working from the canonical 209-rule checklist.

## What this kit contains

- `seo-rules.json` — the single source of truth: 209 current, fact-checked rules (each with
  `id`, `severity`, `stage`, `check_type`, `what`, `why`, `fix` (Astro-specific), `how_to_check`).
- `audit/` — a Node auditor that crawls a live URL and verifies ~122 of the rules automatically.
- `CHECKLIST.md` / `docs/RULES.md` — human-readable checklist and full reference.
- `dashboard/` — an optional login dashboard that runs the auditor from a browser.

## Live progress dashboard (do this — the user watches here)

At the **start of any fix session**, spin up the live dashboard and narrate every step into it so
the user can watch findings and fixes appear in real time, with the score climbing before → after.

```bash
# 1. clear the log + start the session, then launch the dashboard (leave it running in the background)
astro-seo-audit report --reset --type start --title "SEO fix session — the-site.com"
astro-seo-audit serve &          # → http://localhost:4330  (tell the user to open it)

# 2. baseline audit (records the starting score on the dashboard)
astro-seo-audit https://the-site.com --session
```

Then, as you work each issue, **report before and after** so the feed reads like a conversation:

```bash
astro-seo-audit report --type finding --rule crawl-sitemap-present --severity critical \
  --title "You have no XML sitemap" --detail "Crawlers can't reliably discover your pages."
astro-seo-audit report --type fixing --rule crawl-sitemap-present --title "Adding @astrojs/sitemap for you"
# …make the actual code change…
astro-seo-audit report --type fixed --rule crawl-sitemap-present \
  --title "Sitemap added" --detail "Installed @astrojs/sitemap and set site in astro.config." \
  --files "astro.config.mjs,package.json" --diff "+ integrations: [sitemap()],"
```

After deploying a batch of fixes, re-audit to update the score, then finish:

```bash
astro-seo-audit https://the-site.com --session            # score climbs on the dashboard
astro-seo-audit report --type done --title "Done — score 64 → 92"
```

Event types: `start | finding | fixing | fixed | note | done`. Keep titles short and human
("All your images are uncompressed — let me fix that"); put the detail/diff in `--detail`/`--diff`.

## Workflow

### 1. Run the automated audit
From the kit directory (or with the published package):

```bash
node audit/cli.mjs https://the-site.com --json --html
# or, if installed:  npx astro-seo-audit https://the-site.com --json
# add real Core Web Vitals:  --psi-key=$PAGESPEED_API_KEY   (or set PAGESPEED_API_KEY)
```

Audit the **built/deployed** site (run `astro build` + `astro preview`, or a preview deploy URL) —
many checks (sitemap, hashed-asset caching, prerendered HTML) only exist in the production build,
not in `astro dev`.

The JSON report (`reports/<host>-seo.json`) has `score`, `totals`, and `sections[].results[]`
where each result is `{ id, title, severity, status, detail, evidence, fix, docs }`.
`status` is one of `pass | fail | warn | manual | skip`.

### 2. Triage
Read the JSON and address findings in this order:

1. **`fail` + `severity: critical`** — launch blockers. Fix before anything else.
2. **`fail` + `high`**, then `warn` + `critical`/`high`.
3. **`manual`** items — the auditor can't verify these over HTTP (build-time facts, content
   judgement, dashboard settings, or Core Web Vitals without a PSI key). You must verify each by
   reading the codebase / config or measuring. **Do not skip them** — they include real launch
   blockers (e.g. SSR adapter correctness, content-collection routing, GSC verification).
4. Remaining `warn` / `medium` / `low`.

### 3. Fix in the Astro codebase
For each issue, look up the rule by `id` in `seo-rules.json` (or `docs/RULES.md`) and apply its
`fix`. The fixes are Astro v5-specific. Common files:

- `astro.config.mjs` — `site`, `trailingSlash`, `build.format`, adapter, `@astrojs/sitemap`.
- A shared `BaseHead.astro` / `<SEO>` component — title, description, canonical, Open Graph,
  Twitter, charset, viewport, JSON-LD (inject with `set:html={JSON.stringify(...)}`).
- `src/pages/robots.txt.ts` — robots + `Sitemap:` line.
- Layouts/components — one `<h1>`, semantic landmarks, `astro:assets` `<Image>` with width/height
  and alt text, `loading="lazy"` below the fold + `fetchpriority="high"` on the LCP image.
- Platform config — `_headers`/`_redirects` (Cloudflare) or `vercel.json` (Vercel) for security
  headers, HSTS, www→apex and HTTP→HTTPS redirects, immutable caching of `_astro/*`.

Prefer a single reusable head component over per-page duplication. Never inject JSON-LD with
template literals (XSS) — always `JSON.stringify`.

### 4. Verify manual items explicitly
For `manual` results, actually check — don't assume. Examples:
- *SSR adapter installed* → grep `astro.config.*` for the adapter matching the deploy target.
- *Content-collection routes generated* → confirm a `[...id].astro` calls `getStaticPaths()` and
  compare `src/content/**` count to built `dist/**/*.html`.
- *Structured data valid* → run the [Rich Results Test](https://search.google.com/test/rich-results)
  and [Schema validator](https://validator.schema.org/).
- *Core Web Vitals* → re-run with `--psi-key`, or use PageSpeed Insights / Lighthouse.
- *GSC / Bing verified, sitemap submitted* → confirm in Search Console / Bing Webmaster Tools.

### 5. Re-run until green
After fixes, rebuild and re-run the auditor. Target: **0 `fail`, score 90+**, and every `manual`
item consciously verified. Report the before/after score and the remaining manual items the user
must complete in their accounts (GSC, Bing, analytics, uptime monitoring).

## Notes
- The kit is framework-correct for **Astro v5** (output `static` by default, `hybrid` removed,
  content-layer `entry.id`, `astro:assets`). Flag if the project is on an older Astro.
- Respect the existing design system; SEO fixes should not change visible design.
- Scoring weights severity (critical ×5, high ×3, medium ×2, low ×1); `warn` counts as half credit.
  `manual`/`skip` don't affect the score — they're work for you and the user to verify.
