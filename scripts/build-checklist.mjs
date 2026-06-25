// Generates CHECKLIST.md (scannable task list) and docs/RULES.md (full reference)
// from seo-rules.json — the single source of truth.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await readFile(join(ROOT, 'seo-rules.json'), 'utf8'));

const SEV = { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪' };
const SEV_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const firstSentence = (s, max = 180) => {
  const t = oneLine(s);
  const m = t.match(/^.*?[.!?](\s|$)/);
  let out = m ? m[0].trim() : t;
  if (out.length > max) out = out.slice(0, max - 1).trimEnd() + '…';
  return out;
};
const rulesIn = (key) => data.rules.filter((r) => r.section === key);

// ----------------------------------------------------------------- CHECKLIST.md
let cl = '';
cl += `# 🚀 Astro SEO Launch Checklist\n\n`;
cl += `> The complete, current, **myth-free** SEO checklist for launching an [Astro](https://astro.build) site on **Cloudflare Pages** or **Vercel** — ${data.counts.total} checks across ${data.sections.length} areas, ${data.counts.automatable} of them automatable.\n\n`;
cl += `Built and maintained by [Nordica Marketing](https://www.nordicamarketing.com). Free to use. Pairs with the included **CLI auditor** and **login dashboard** that verify most of this list for you automatically.\n\n`;
cl += `**Legend:** ${SEV.critical} Critical · ${SEV.high} High · ${SEV.medium} Medium · ${SEV.low} Low &nbsp;|&nbsp; 🤖 auto-checked by the tool · 👤 manual review &nbsp;|&nbsp; stage: \`build\` → \`pre-launch\` → \`post-launch\`\n\n`;
cl += `**How to use this:**\n`;
cl += `1. Build your Astro site, then run \`npx astro-seo-audit https://your-site.com\` (see [the repo](./README.md)).\n`;
cl += `2. Work top-down — ${SEV.critical} items are launch blockers.\n`;
cl += `3. For the *why*, the Astro fix, and exact verification, see [**docs/RULES.md**](./docs/RULES.md).\n\n`;

const counts = data.counts.bySeverity;
cl += `> **At a glance:** ${counts.critical} critical · ${counts.high} high · ${counts.medium} medium · ${counts.low} low.\n\n`;
cl += `## Sections\n\n`;
for (const s of data.sections) cl += `- [${s.name}](#${anchor(s.name)}) — ${rulesIn(s.key).length} checks\n`;
cl += `\n---\n\n`;

for (const s of data.sections) {
  const rules = rulesIn(s.key);
  cl += `## ${s.name}\n\n${s.description}\n\n`;
  for (const r of rules) {
    const tags = `\`${r.stage}\` · ${r.automatable ? '🤖' : '👤'}`;
    cl += `- [ ] ${SEV[r.severity]} **${r.title}** — ${firstSentence(r.how_to_check)} <sub>${tags}</sub>\n`;
  }
  cl += `\n`;
}
cl += `---\n\n<sub>Generated from \`seo-rules.json\` (rules ${data.rulesVersion}). Regenerate with \`npm run build:checklist\`.</sub>\n`;

await writeFile(join(ROOT, 'CHECKLIST.md'), cl);

// ------------------------------------------------------------------ docs/RULES.md
let rl = '';
rl += `# Astro SEO Launch Kit — Full Rule Reference\n\n`;
rl += `Every check in [CHECKLIST.md](../CHECKLIST.md), with the reasoning, the Astro-specific fix, and exactly how to verify it. ${data.counts.total} rules · version ${data.rulesVersion}.\n\n`;
rl += `## Sections\n\n`;
for (const s of data.sections) rl += `- [${s.name}](#${anchor(s.name)})\n`;
rl += `\n---\n\n`;

for (const s of data.sections) {
  rl += `## ${s.name}\n\n${s.description}\n\n`;
  for (const r of rulesIn(s.key)) {
    rl += `### ${SEV[r.severity]} ${r.title}\n\n`;
    rl += `\`${r.id}\` · **${SEV_LABEL[r.severity]}** · stage: \`${r.stage}\` · ${r.automatable ? '🤖 automatable' : '👤 manual'} · check: \`${r.check_type}\`\n\n`;
    rl += `**What.** ${oneLine(r.what)}\n\n`;
    rl += `**Why it matters.** ${oneLine(r.why)}\n\n`;
    rl += `**Fix (Astro).**\n\n${block(r.fix)}\n\n`;
    if (r.platform_notes) rl += `**Cloudflare / Vercel.** ${oneLine(r.platform_notes)}\n\n`;
    rl += `**How to verify.** ${oneLine(r.how_to_check)}\n\n`;
    if (r.common_mistakes) rl += `**Common mistakes.** ${oneLine(r.common_mistakes)}\n\n`;
    if (r.sources && r.sources.length) rl += `**Sources.** ${r.sources.slice(0, 3).map((u) => `<${u}>`).join(' · ')}\n\n`;
    rl += `---\n\n`;
  }
}
await mkdir(join(ROOT, 'docs'), { recursive: true });
await writeFile(join(ROOT, 'docs', 'RULES.md'), rl);

// Emit a JS data module the audit package imports. This bundles cleanly in any
// runtime (CLI, Cloudflare, Vercel, Node) — no fs path or import-attribute issues.
const dataModule = `// AUTO-GENERATED from seo-rules.json by scripts/build-checklist.mjs — do not edit.\nexport default ${JSON.stringify(data)};\n`;
await writeFile(join(ROOT, 'audit', 'lib', 'rules-data.mjs'), dataModule);

console.log(`Wrote CHECKLIST.md (${data.counts.total} items), docs/RULES.md, audit/lib/rules-data.mjs`);

// helpers
function anchor(name) {
  return name.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
}
function block(fix) {
  // If the fix already contains a fenced code block, keep as-is; else just prose.
  return oneLineKeepCode(fix);
}
function oneLineKeepCode(s) {
  // Preserve fenced code; collapse whitespace only outside fences.
  const parts = String(s || '').split(/(```[\s\S]*?```)/g);
  return parts.map((p) => (p.startsWith('```') ? p : oneLine(p))).join('').trim();
}
