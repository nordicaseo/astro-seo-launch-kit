import type { APIRoute } from 'astro';
import { COOKIE_NAME, getEnv, mintSession } from '../../lib/auth';

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

// JSON login (the form posts via fetch). JSON requests are exempt from Astro's
// form-origin CSRF check, so this works on localhost, Cloudflare, and Vercel
// without configuring trusted hosts.
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  let password = '';
  try {
    const body = await request.json();
    password = String(body?.password ?? '');
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  const expected = getEnv('DASHBOARD_PASSWORD', locals);
  if (!expected) return json({ error: 'Dashboard not configured: set DASHBOARD_PASSWORD and SESSION_SECRET.' }, 500);
  if (!getEnv('SESSION_SECRET', locals)) return json({ error: 'Dashboard not configured: set SESSION_SECRET.' }, 500);
  if (password !== expected) return json({ error: 'Incorrect password.' }, 401);

  const value = await mintSession(locals);
  cookies.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: import.meta.env.PROD,
    maxAge: 60 * 60 * 12, // 12 hours
  });
  return json({ ok: true }, 200);
};
