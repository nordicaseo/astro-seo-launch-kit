// Orchestrates an audit: load rules -> crawl -> (optional PSI) -> run checks -> report.
import { buildContext } from './crawl.mjs';
import { CHECKS } from './checks.mjs';
import { runPsi } from './psi.mjs';
import rulesData from './rules-data.mjs'; // generated from seo-rules.json

export async function loadRules() {
  return rulesData;
}

const SEV_WEIGHT = { critical: 5, high: 3, medium: 2, low: 1 };

export async function runAudit(target, opts = {}) {
  const rules = await loadRules();
  const ctx = await buildContext(target, opts);

  if (opts.pageSpeedApiKey) {
    const psi = await runPsi(ctx.homepage.url, opts.pageSpeedApiKey, 'mobile');
    ctx.psi = psi.ok ? psi : null;
    ctx.psiError = psi.ok ? null : psi.error;
  }

  const bySection = new Map();
  const totals = { pass: 0, fail: 0, warn: 0, manual: 0, skip: 0, total: 0 };
  let earned = 0, possible = 0;

  for (const rule of rules.rules) {
    let res;
    const fn = CHECKS[rule.id];
    if (fn) {
      try { res = await fn(ctx); } catch (e) { res = { status: 'warn', detail: 'Auto-check error: ' + (e?.message || e) }; }
    } else if (rule.check_type === 'lighthouse') {
      res = { status: 'manual', detail: (ctx.psi ? '' : 'Needs Lighthouse/PSI (add PAGESPEED_API_KEY). ') + rule.how_to_check };
    } else {
      // No automated check (manual/external_tool, or an automatable rule that needs
      // build-source or dashboard access we can't reach over HTTP). Surface it as a
      // manual review item with the rule's verification guidance.
      res = { status: 'manual', detail: rule.how_to_check };
    }

    const entry = {
      id: rule.id,
      title: rule.title,
      severity: rule.severity,
      stage: rule.stage,
      automatable: rule.automatable,
      check_type: rule.check_type,
      status: res.status,
      detail: res.detail || '',
      evidence: res.evidence || undefined,
      fix: rule.fix,
      docs: (rule.sources && rule.sources[0]) || undefined,
    };

    totals[res.status] = (totals[res.status] || 0) + 1;
    totals.total++;
    if (res.status === 'pass' || res.status === 'fail' || res.status === 'warn') {
      const w = SEV_WEIGHT[rule.severity] || 1;
      possible += w;
      earned += res.status === 'pass' ? w : res.status === 'warn' ? w * 0.5 : 0;
    }

    if (!bySection.has(rule.section)) bySection.set(rule.section, []);
    bySection.get(rule.section).push(entry);
  }

  const sections = rules.sections
    .filter((s) => bySection.has(s.key))
    .map((s) => ({ key: s.key, name: s.name, description: s.description, results: bySection.get(s.key) }));

  const score = possible ? Math.round((earned / possible) * 100) : 100;

  return {
    target: ctx.homepage.url,
    input: target,
    generatedAt: new Date().toISOString(),
    score,
    totals,
    pagesAudited: ctx.pages.map((p) => p.url),
    meta: {
      rulesVersion: rules.rulesVersion,
      automatedChecks: Object.keys(CHECKS).length,
      totalRules: rules.rules.length,
      psi: ctx.psi ? ctx.psi.strategy : null,
      psiError: ctx.psiError || null,
    },
    sections,
  };
}
