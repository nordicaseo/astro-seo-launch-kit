#!/usr/bin/env node
// Astro SEO Launch Kit — CLI auditor.
// Usage: astro-seo-audit <url> [--json[=file]] [--html[=file]] [--out=dir]
//                        [--max=N] [--psi-key=KEY] [--fail-on=critical|high|warn|none]
//                        [--only=section] [--quiet]
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import pc from 'picocolors';
import { runAudit } from './lib/runner.mjs';
import { renderHtml } from './lib/report-html.mjs';

function parseArgs(argv) {
  const args = { _: [] };
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, ...v] = a.slice(2).split('=');
      args[k] = v.length ? v.join('=') : true;
    } else args._.push(a);
  }
  return args;
}

const STATUS = {
  pass: { c: pc.green, s: '✓' },
  fail: { c: pc.red, s: '✗' },
  warn: { c: pc.yellow, s: '!' },
  manual: { c: pc.cyan, s: '◐' },
  skip: { c: pc.gray, s: '–' },
};
const sevColor = (s) => ({ critical: pc.red, high: (x) => pc.yellow(pc.bold(x)), medium: pc.yellow, low: pc.gray }[s] || pc.white);

function slug(host) { return host.replace(/[^a-z0-9.-]/gi, '_'); }

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h || !args._.length) {
    console.log(`
${pc.bold('Astro SEO Launch Kit')} — automated pre-flight SEO audit

  ${pc.cyan('astro-seo-audit')} <url> [options]

Options:
  --json[=file]      Write a JSON report (default: reports/<host>-seo.json)
  --html[=file]      Write a self-contained HTML report
  --out=dir          Output directory for reports (default: ./reports)
  --max=N            Max pages to sample (default: 6)
  --psi-key=KEY      Google PageSpeed Insights key (or set PAGESPEED_API_KEY) for CWV
  --fail-on=LEVEL    Exit non-zero if a check at/above LEVEL fails:
                       critical (default) | high | warn | none
  --only=section     Print only one section (e.g. crawlability)
  --quiet            Print the summary line only

Examples:
  astro-seo-audit https://example.com
  astro-seo-audit example.com --html --json --psi-key=$PAGESPEED_API_KEY
  astro-seo-audit https://example.com --fail-on=high   # for CI
`);
    process.exit(args._.length ? 0 : 1);
  }

  const target = args._[0];
  const psiKey = args['psi-key'] || process.env.PAGESPEED_API_KEY;
  console.error(pc.dim(`\nAuditing ${target}${psiKey ? ' (with PageSpeed Insights)' : ''}…\n`));

  let report;
  try {
    report = await runAudit(target, { maxPages: args.max ? Number(args.max) : undefined, pageSpeedApiKey: psiKey });
  } catch (e) {
    console.error(pc.red(`Audit failed: ${e.message}`));
    process.exit(2);
  }

  // ---- console output
  const t = report.totals;
  const scoreC = report.score >= 90 ? pc.green : report.score >= 70 ? pc.yellow : pc.red;
  if (!args.quiet) {
    for (const sec of report.sections) {
      if (args.only && sec.key !== args.only) continue;
      const shown = sec.results.filter((r) => r.status !== 'pass' || !args['fails-only']);
      console.log(pc.bold(pc.underline(`\n${sec.name}`)) + pc.dim(`  (${sec.results.length} checks)`));
      for (const r of shown) {
        const st = STATUS[r.status] || STATUS.skip;
        const head = `  ${st.c(st.s)} ${sevColor(r.severity)(r.severity.padEnd(8))} ${r.title}`;
        console.log(head);
        if ((r.status === 'fail' || r.status === 'warn') && r.detail) console.log(pc.dim(`      ${r.detail}`));
      }
    }
  }

  console.log('\n' + pc.bold('────────────────────────────────────────────────────────'));
  console.log(
    `  ${pc.bold(scoreC(report.score + '/100'))}   ` +
    `${pc.green(t.pass + ' pass')}  ${pc.red(t.fail + ' fail')}  ${pc.yellow(t.warn + ' warn')}  ${pc.cyan(t.manual + ' manual')}  ${pc.gray(t.skip + ' skip')}` +
    `   ${pc.dim('(' + t.total + ' checks)')}`
  );
  if (report.meta.psiError) console.log(pc.dim(`  PageSpeed: ${report.meta.psiError}`));
  if (!psiKey) console.log(pc.dim('  Tip: pass --psi-key for real Core Web Vitals (LCP/INP/CLS).'));
  console.log(pc.bold('────────────────────────────────────────────────────────'));

  // ---- file output
  const outDir = args.out || 'reports';
  const base = slug(new URL(report.target).hostname);
  if (args.json) {
    const file = typeof args.json === 'string' ? args.json : join(outDir, `${base}-seo.json`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(report, null, 2));
    console.log(pc.dim(`  JSON  → ${file}`));
  }
  if (args.html) {
    const file = typeof args.html === 'string' ? args.html : join(outDir, `${base}-seo.html`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, renderHtml(report));
    console.log(pc.dim(`  HTML  → ${file}`));
  }

  // ---- exit code
  const failOn = (args['fail-on'] || 'critical').toLowerCase();
  const order = { critical: ['critical'], high: ['critical', 'high'], warn: 'warn', none: null };
  let bad = false;
  if (failOn === 'warn') bad = t.fail > 0 || t.warn > 0;
  else if (failOn !== 'none') {
    const sevs = order[failOn] || order.critical;
    bad = report.sections.some((s) => s.results.some((r) => r.status === 'fail' && sevs.includes(r.severity)));
  }
  process.exit(bad ? 1 : 0);
}

main();
