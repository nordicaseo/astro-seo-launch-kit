# 🚀 Astro SEO Launch Kit

**Everything you need to make an [Astro](https://astro.build) site launch-perfect for SEO — a 209-point checklist, an automated auditor, a login dashboard, and a Claude skill, all from one source of truth.**

Built for sites deployed to **Cloudflare Pages** or **Vercel**. Current for **Astro v5** (2026). Free & MIT-licensed, from [Nordica Marketing](https://www.nordicamarketing.com).

> No fluff, no myths. Every rule is fact-checked against current Google, Astro, and web.dev guidance — we explicitly *exclude* dead advice (keyword meta tags, `rel=next/prev`, FID-era tips, keyword density). INP, not FID. astro:assets, not bare `<img>`.

---

## Why this exists

You finish an Astro site, deploy it… and quietly ship it with a broken canonical, a `localhost` sitemap, no Open Graph image, a soft 404, and zero security headers. This kit catches all of that — **automatically where possible, with a guided checklist for the rest** — so launches are boring and search-ready.

## What's in the box

| Piece | What it does |
|---|---|
| 📋 **[`CHECKLIST.md`](./CHECKLIST.md)** | The scannable 209-point launch checklist, grouped & severity-tiered. |
| 📚 **[`docs/RULES.md`](./docs/RULES.md)** | The full reference — *why* each rule matters + the exact Astro fix. |
| 🤖 **[`audit/`](./audit/)** | A zero-config CLI that crawls a live URL and auto-verifies **122 checks**. |
| 🖥️ **[`dashboard/`](./dashboard/)** | A small login dashboard that runs the audit in the browser, with pass/fail. |
| 🧠 **[`.claude/skills/astro-seo-audit/`](./.claude/skills/astro-seo-audit/SKILL.md)** | A Claude skill so an AI agent can run the whole checklist and fix your code. |
| 🗃️ **[`seo-rules.json`](./seo-rules.json)** | The machine-readable source of truth — build your own tooling on it. |

**209 rules** across 11 areas · **48 critical** · 97 high · 49 medium · 15 low · **185 automatable**.

<sub>Foundations · Crawlability · Metadata & Social · Structured Data · Performance & Core Web Vitals · Images · URLs/Redirects/i18n · Accessibility · Platform & Deployment · Analytics/Monitoring/Trust · Anti-Patterns</sub>

---

## Quick start

### 1) Audit a live site (CLI)

```bash
# from a clone of this repo
npm install
node audit/cli.mjs https://your-site.com --json --html

# real Core Web Vitals (LCP/INP/CLS) via PageSpeed Insights:
node audit/cli.mjs https://your-site.com --psi-key=YOUR_PAGESPEED_KEY
```

> **Audit the built site.** Run `astro build && astro preview` (or use a preview-deploy URL). Many checks — sitemap, hashed-asset caching, prerendered HTML — only exist in the production build, not `astro dev`.

You get a colored terminal report, plus optional `reports/<host>-seo.json` and a self-contained `reports/<host>-seo.html`.

```
────────────────────────────────────────────────────────
  90/100   79 pass  0 fail  21 warn  108 manual  1 skip   (209 checks)
────────────────────────────────────────────────────────
```

### 2) Audit from a browser (dashboard)

```bash
cd dashboard
cp .env.example .env        # set DASHBOARD_PASSWORD + SESSION_SECRET
npm run build && npm start   # http://localhost:4321
```

Log in, paste a URL, and get a live pass/fail breakdown with a score ring and "how to fix" for every item. Deploy it next to your site (see [Deploying the dashboard](#deploying-the-dashboard)).

### 3) Let an AI agent do it (Claude skill)

This repo ships a [Claude Code](https://claude.com/claude-code) skill. Point Claude at your Astro project and the kit, and ask:

> "Audit my Astro site's SEO and fix everything before launch."

The agent runs the auditor, triages by severity, **fixes the issues in your codebase**, verifies the manual items, and re-runs until the score is green. See [`SKILL.md`](./.claude/skills/astro-seo-audit/SKILL.md).

### Watch it work — live fix dashboard

While the agent fixes your site, it narrates into a zero-build live dashboard you can watch:

```bash
astro-seo-audit serve        # → http://localhost:4330
```

You'll see findings, fixes, and diffs stream in ("You have no XML sitemap — adding it…", "Sitemap added ✅"), with the **score climbing before → after** and a progress bar of issues addressed. The agent drives it with the `report` / `--session` commands (see the skill); you just keep the tab open.

---

## How the auditor works

It fetches your homepage, `robots.txt`, the sitemap, and a sample of internal pages, then runs the checks and probes redirects (HTTP→HTTPS, www↔apex, trailing slash), the 404 status, asset caching, security headers, structured data, and more.

Every rule ends up as one of:

| Status | Meaning |
|---|---|
| ✅ `pass` | Verified correct. |
| ❌ `fail` | Verified broken — fix it. |
| ⚠️ `warn` | Likely an issue / outside best-practice range. |
| ◐ `manual` | Can't be checked over HTTP (build-time fact, content judgement, dashboard setting, or CWV without a PSI key) — **you verify it**, with guidance provided. |
| – `skip` | Not applicable to this site (e.g. no hreflang on a single-language site). |

**Score** weights severity (critical ×5, high ×3, medium ×2, low ×1); `warn` = half credit. `manual`/`skip` don't affect the score — they're your to-do list. Add `--psi-key` and ~17 Core Web Vitals / Lighthouse checks light up automatically.

### CLI options

```
node audit/cli.mjs <url> [options]
  --json[=file]    Write a JSON report (default reports/<host>-seo.json)
  --html[=file]    Write a self-contained HTML report
  --out=dir        Report output directory (default ./reports)
  --max=N          Pages to sample (default 6)
  --psi-key=KEY    PageSpeed Insights key for Core Web Vitals (or env PAGESPEED_API_KEY)
  --fail-on=LEVEL  Exit non-zero if a check at/above LEVEL fails:
                     critical (default) | high | warn | none
  --only=section   Print one section (e.g. crawlability)
  --quiet          Summary line only
```

### Use it in CI

Block a deploy on critical SEO regressions:

```yaml
# .github/workflows/seo.yml
- run: npm ci && npm run -w @astro-seo-launch-kit/dashboard build  # build/deploy your site first
- run: node audit/cli.mjs "$PREVIEW_URL" --fail-on=high --json
```

---

## Deploying the dashboard

The dashboard is a server-rendered Astro app. It ships with the Node adapter for local/self-host. To deploy:

- **Cloudflare Pages:** `npm i @astrojs/cloudflare`, then in `dashboard/astro.config.mjs` swap the adapter to `cloudflare()`. Set `DASHBOARD_PASSWORD` and `SESSION_SECRET` as environment variables.
- **Vercel:** `npm i @astrojs/vercel`, swap the adapter to `vercel()`. Set the same env vars in Project Settings.

Login uses a single shared password and a signed, HttpOnly session cookie. The dashboard sets `noindex` on itself. Set a strong `SESSION_SECRET` (`node -e "console.log(crypto.randomBytes(32).toString('hex'))"`).

---

## Build your own tooling

`seo-rules.json` is plain data — `{ sections, rules }`, each rule carrying `id`, `severity`, `stage`, `check_type`, `what`, `why`, `fix`, `how_to_check`, `sources`. Import it anywhere.

The checklist and the auditor's rule data are **generated** from it:

```bash
npm run build:checklist   # regenerates CHECKLIST.md, docs/RULES.md, audit/lib/rules-data.mjs
```

So `seo-rules.json` is the only thing to edit when rules change.

---

## Repo layout

```
astro-seo-launch-kit/
├── seo-rules.json              # ← source of truth (209 rules)
├── CHECKLIST.md                # generated: scannable checklist
├── docs/RULES.md               # generated: full reference
├── scripts/build-checklist.mjs # generator
├── audit/                      # CLI + audit engine (shared by the dashboard)
│   ├── cli.mjs
│   └── lib/{crawl,checks,psi,runner,report-html,dom,util}.mjs
├── dashboard/                  # Astro SSR login dashboard
└── .claude/skills/astro-seo-audit/SKILL.md
```

## Credits & license

Made by [Nordica Marketing](https://www.nordicamarketing.com). The rule set was researched and adversarially fact-checked against Astro docs, Google Search Central, web.dev, Cloudflare, and Vercel documentation. MIT licensed — use it, fork it, ship it.
