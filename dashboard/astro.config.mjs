// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// The dashboard is a server-rendered Astro app (it runs the audit on demand,
// server-side, to avoid browser CORS limits on fetching arbitrary sites).
//
// Local / self-host:  uses @astrojs/node (this file, as-is).
// Deploy to Cloudflare Pages:
//     npm i @astrojs/cloudflare
//     import cloudflare from '@astrojs/cloudflare';
//     adapter: cloudflare()
// Deploy to Vercel:
//     npm i @astrojs/vercel
//     import vercel from '@astrojs/vercel';
//     adapter: vercel()
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: { port: 4321, host: true },
});
