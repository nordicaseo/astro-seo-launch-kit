// Zero-build live progress dashboard. `astro-seo-audit serve` starts this; the
// agent appends events to the session log and the page (live.html) polls them.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readEvents, summarize, sessionPath } from './session.mjs';

const PAGE = new URL('./live.html', import.meta.url);

export async function startServer({ port = 4330, host = '127.0.0.1' } = {}) {
  let html = '<h1>live.html missing</h1>';
  try { html = await readFile(PAGE, 'utf8'); } catch {}

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/api/session') {
        const since = Number(url.searchParams.get('since') ?? -1);
        const events = await readEvents();
        const fresh = events.filter((e) => e.i > since);
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ events: fresh, total: events.length, summary: summarize(events) }));
        return;
      }
      if (url.pathname === '/' || url.pathname === '/index.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
    } catch (e) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('Error: ' + (e?.message || e));
    }
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  return { server, port, host, sessionFile: sessionPath() };
}
