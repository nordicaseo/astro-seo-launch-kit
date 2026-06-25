// Optional Google PageSpeed Insights integration (lab + CrUX field data).
// Only runs when a PAGESPEED_API_KEY is supplied.
import { get } from './util.mjs';

export async function runPsi(url, apiKey, strategy = 'mobile') {
  const api = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  api.searchParams.set('url', url);
  api.searchParams.set('strategy', strategy);
  api.searchParams.append('category', 'performance');
  api.searchParams.append('category', 'accessibility');
  if (apiKey) api.searchParams.set('key', apiKey);

  const res = await get(api.href, { timeout: 60000 });
  if (!res.ok) return { ok: false, error: `PSI ${res.status} ${res.error || ''}`.trim() };
  let data;
  try { data = JSON.parse(res.body); } catch { return { ok: false, error: 'PSI: invalid JSON' }; }
  if (data.error) return { ok: false, error: data.error.message };

  const lh = data.lighthouseResult || {};
  const audits = lh.audits || {};
  const num = (id) => audits[id]?.numericValue;
  const cat = lh.categories || {};

  const field = data.loadingExperience?.metrics || {};
  const fieldMetric = (k) => {
    const m = field[k];
    if (!m) return null;
    return { p75: m.percentile, category: m.category };
  };

  return {
    ok: true,
    strategy,
    perfScore: cat.performance ? Math.round(cat.performance.score * 100) : null,
    a11yScore: cat.accessibility ? Math.round(cat.accessibility.score * 100) : null,
    lab: {
      lcpMs: num('largest-contentful-paint'),
      cls: num('cumulative-layout-shift'),
      fcpMs: num('first-contentful-paint'),
      siMs: num('speed-index'),
      tbtMs: num('total-blocking-time'),
      domSize: num('dom-size'),
      renderBlockingMs: audits['render-blocking-resources']?.details?.overallSavingsMs ?? null,
      renderBlockingItems: audits['render-blocking-resources']?.details?.items?.length ?? 0,
      unusedJsKib: audits['unused-javascript']?.details?.overallSavingsBytes
        ? Math.round(audits['unused-javascript'].details.overallSavingsBytes / 1024)
        : null,
    },
    field: {
      lcp: fieldMetric('LARGEST_CONTENTFUL_PAINT_MS'),
      inp: fieldMetric('INTERACTION_TO_NEXT_PAINT'),
      cls: fieldMetric('CUMULATIVE_LAYOUT_SHIFT_SCORE'),
      overall: data.loadingExperience?.overall_category || null,
      hasData: Object.keys(field).length > 0,
    },
  };
}
