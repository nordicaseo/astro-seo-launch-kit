// Shared "fix session" event log. The agent appends events as it audits and
// fixes; the live dashboard (astro-seo-audit serve) reads them. File-based so
// the agent process and the dashboard process can be completely separate.
import { appendFile, readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

/** Where the session log lives. Override with SEO_SESSION_FILE; defaults to a
 *  stable temp path so the agent and the dashboard share it with zero config. */
export function sessionPath() {
  return process.env.SEO_SESSION_FILE || join(tmpdir(), 'astro-seo-session.jsonl');
}

export async function appendEvent(evt) {
  const p = sessionPath();
  await mkdir(dirname(p), { recursive: true });
  const line = JSON.stringify({ ts: new Date().toISOString(), ...evt }) + '\n';
  await appendFile(p, line, 'utf8');
  return p;
}

export async function resetSession() {
  const p = sessionPath();
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, '', 'utf8');
  return p;
}

export async function readEvents() {
  const p = sessionPath();
  if (!existsSync(p)) return [];
  const txt = await readFile(p, 'utf8');
  return txt
    .split('\n')
    .filter(Boolean)
    .map((l, i) => {
      try { return { i, ...JSON.parse(l) }; } catch { return null; }
    })
    .filter(Boolean);
}

/** Derive a before/after summary the dashboard header needs. */
export function summarize(events) {
  const audits = events.filter((e) => e.type === 'audit');
  const start = audits[0];
  const latest = audits[audits.length - 1];
  const fixed = new Set(events.filter((e) => e.type === 'fixed' && e.rule).map((e) => e.rule));
  return {
    target: latest?.target || start?.target || events.find((e) => e.target)?.target || null,
    startScore: start ? start.score : null,
    currentScore: latest ? latest.score : null,
    baselineFails: start && typeof start.failCount === 'number' ? start.failCount : null,
    currentFails: latest && typeof latest.failCount === 'number' ? latest.failCount : null,
    fixedCount: fixed.size,
    auditCount: audits.length,
    done: events.some((e) => e.type === 'done'),
    startedAt: events[0]?.ts || null,
    lastAt: events[events.length - 1]?.ts || null,
  };
}
