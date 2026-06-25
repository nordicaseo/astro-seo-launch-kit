import { defineMiddleware } from 'astro:middleware';
import { COOKIE_NAME, isAuthed } from './lib/auth';

// Routes reachable without a session.
const PUBLIC_PATHS = new Set(['/login', '/api/login']);

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Allow public routes and Astro/static internals through.
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith('/_')) {
    return next();
  }

  const token = context.cookies.get(COOKIE_NAME)?.value;
  const authed = await isAuthed(token, context.locals);

  if (!authed) {
    // API calls get a 401; page loads get redirected to the login screen.
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    return context.redirect('/login');
  }

  return next();
});
