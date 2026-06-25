import type { APIRoute } from 'astro';
import { runAudit } from 'astro-seo-audit';
import { getEnv } from '../../lib/auth';

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request, locals }) => {
  let target = '';
  try {
    const body = await request.json();
    target = String(body?.target ?? '').trim();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }
  if (!target) return json({ error: 'Enter a URL to audit.' }, 400);
  if (!/^https?:\/\//i.test(target)) target = 'https://' + target;

  try {
    const report = await runAudit(target, {
      pageSpeedApiKey: getEnv('PAGESPEED_API_KEY', locals),
    });
    return json(report, 200);
  } catch (e: any) {
    return json({ error: e?.message || 'Audit failed unexpectedly.' }, 500);
  }
};
