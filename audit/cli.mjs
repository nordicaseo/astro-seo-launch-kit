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
import { startServer } from './lib/serve.mjs';
import { appendEvent, resetSession, sessionPath } from './lib/session.mjs';

// Flags that take a value. These accept both --key=value and --key value.
// Everything else (json, html, quiet, session, reset…) is boolean, but still
// accepts --key=value. This keeps `--json` boolean while `--type fixed` works.
const VALUE_FLAGS = new Set([
  'type', 'title', 'detail', 'rule', 'severity', 'message', 'diff', 'target', 'score',
  'files', 'out', 'max', 'psi-key', 'fail-on', 'only', 'port',
]);

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq >= 0) {
        args[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        const next = argv[i + 1];
        if (VALUE_FLAGS.has(key) && next !== undefined && !next.startsWith('--')) {
          args[key] = next;
          i++;
        } else {
          args[key] = true;
        }
      }
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
  const cmd = args._[0];

  if (cmd === 'serve') return cmdServe(args);
  if (cmd === 'report') return cmdReport(args);

  if (args.help || args.h || !args._.length) {
    console.log(`
${pc.bold('Astro SEO Launch Kit')} — automated pre-flight SEO audit

  ${pc.cyan('astro-seo-audit')} <url> [options]      audit a live site
  ${pc.cyan('astro-seo-audit')} serve [--port=N]     start the live fix dashboard
  ${pc.cyan('astro-seo-audit')} report --type ...    log a session event (for the dashboard)

Audit options:
  --json[=file]      Write a JSON report (default: reports/<host>-seo.json)
  --html[=file]      Write a self-contained HTML report
  --out=dir          Output directory for reports (default: ./reports)
  --max=N            Max pages to sample (default: 6)
  --psi-key=KEY      Google PageSpeed Insights key (or set PAGESPEED_API_KEY) for CWV
  --fail-on=LEVEL    Exit non-zero if a check at/above LEVEL fails:
                       critical (default) | high | warn | none
  --session          Record the audit into the live-dashboard session log
  --only=section     Print only one section (e.g. crawlability)
  --quiet            Print the summary line only

report options:
  --type=T           start | finding | fixing | fixed | note | done
  --title="..."      headline shown in the feed
  --detail="..."     supporting text
  --rule=ID          the rule id this relates to
  --severity=S       critical | high | medium | low
  --files="a,b"      files touched by a fix
  --diff="..."       a snippet/diff to show under a fix
  --reset            clear the session before logging (use once at the start)

Examples:
  astro-seo-audit https://example.com --html --json
  astro-seo-audit serve            # open http://localhost:4330 to watch a fix session
  astro-seo-audit report --reset --type start --title "Fixing example.com"
  astro-seo-audit report --type fixed --rule crawl-sitemap-present --title "Sitemap added"
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

  // ---- live-dashboard session event
  if (args.session) {
    const fails = report.sections
      .flatMap((s) => s.results)
      .filter((r) => r.status === 'fail')
      .map((r) => ({ rule: r.id, title: r.title, severity: r.severity }))
      .slice(0, 60);
    await appendEvent({ type: 'audit', target: report.target, score: report.score, failCount: report.totals.fail, fails });
    console.log(pc.dim(`  Session: recorded audit → ${sessionPath()}`));
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

async function cmdServe(args) {
  const port = args.port ? Number(args.port) : Number(process.env.PORT) || 4330;
  const { sessionFile } = await startServer({ port });
  console.log(`\n${pc.bold('🚀 SEO live fix dashboard')}`);
  console.log(`   ${pc.cyan(`http://localhost:${port}`)}`);
  console.log(pc.dim(`   reading session: ${sessionFile}`));
  console.log(pc.dim('   leave this running; press Ctrl-C to stop.\n'));
  // keep alive
}

async function cmdReport(args) {
  if (args.reset) await resetSession();
  const type = typeof args.type === 'string' ? args.type : null;
  if (!type) {
    if (args.reset) console.log(pc.dim('Session cleared.'));
    else console.error(pc.red('report: pass --type (start|finding|fixing|fixed|note|done)'));
    process.exit(args.reset ? 0 : 1);
  }
  const evt = { type };
  for (const k of ['title', 'detail', 'rule', 'severity', 'message', 'diff', 'target']) {
    if (typeof args[k] === 'string') evt[k] = args[k];
  }
  if (typeof args.score === 'string') evt.score = Number(args.score);
  if (typeof args.files === 'string') evt.files = args.files.split(',').map((s) => s.trim()).filter(Boolean);
  await appendEvent(evt);
  console.log(pc.dim(`logged ${type}${evt.title ? ': ' + evt.title : ''}`));
  process.exit(0);
}

main();
