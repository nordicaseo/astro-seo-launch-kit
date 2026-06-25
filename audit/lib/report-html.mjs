// Renders an audit report object into a single self-contained HTML file.
const ICON = { pass: '&#10003;', fail: '&#10007;', warn: '!', manual: '&#9680;', skip: '&#8211;' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderHtml(report) {
  const col = report.score >= 90 ? '#2fbf71' : report.score >= 70 ? '#e9a93c' : '#ef5d5d';
  const t = report.totals;
  const pill = (k, n, label) => `<span class="pill"><i class="dot ${k}"></i>${n || 0} ${label}</span>`;

  const sections = report.sections.map((sec) => {
    const rows = sec.results.map((x) => `
      <div class="row">
        <div class="st ${x.status}">${ICON[x.status] || '?'}</div>
        <div>
          <div class="ti">${esc(x.title)}</div>
          <div class="mt"><span class="bd sev-${x.severity}">${x.severity}</span><span class="bd">${esc(x.id)}</span><span class="bd">${esc(x.stage)}</span></div>
          ${x.detail ? `<div class="de">${esc(x.detail)}</div>` : ''}
          ${x.evidence ? `<pre class="ev">${esc(x.evidence)}</pre>` : ''}
          ${(x.status === 'fail' || x.status === 'warn' || x.status === 'manual') && x.fix ? `<details class="fx"><summary>How to fix</summary><pre>${esc(x.fix)}</pre>${x.docs ? `<a href="${esc(x.docs)}" target="_blank" rel="noopener">Docs &#8599;</a>` : ''}</details>` : ''}
        </div>
      </div>`).join('');
    const failN = sec.results.filter((r) => r.status === 'fail').length;
    return `<section><h2>${esc(sec.name)} <span class="ct">${sec.results.length} checks${failN ? ' · ' + failN + ' failed' : ''}</span></h2><div class="panel">${rows}</div></section>`;
  }).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>SEO Audit · ${esc(report.target)}</title><style>
:root{--bg:#0b0f17;--panel:#121826;--panel2:#161d2e;--border:#232c40;--text:#e6ebf4;--muted:#8a96ad;--pass:#2fbf71;--warn:#e9a93c;--fail:#ef5d5d;--manual:#5aa9e6;--skip:#5b6678}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:1000px;margin:0 auto;padding:32px 20px 80px}h1{font-size:20px;margin:0 0 4px}.sub{color:var(--muted);font-size:13px;margin-bottom:24px}
.panel{background:var(--panel);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.summary{display:flex;gap:24px;align-items:center;padding:24px;margin-bottom:16px}
.ring{width:128px;height:128px;border-radius:50%;background:conic-gradient(${col} ${report.score}%,#1d2536 0);display:grid;place-items:center;position:relative;flex:none}
.ring::before{content:"";position:absolute;inset:12px;border-radius:50%;background:var(--panel)}.ring b{position:relative;font-size:34px}.ring small{position:relative;color:var(--muted);display:block;text-align:center;margin-top:-6px}
.totals{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}.pill{display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border:1px solid var(--border);border-radius:999px;background:var(--panel2);font-size:13px;font-weight:600}
.dot{width:9px;height:9px;border-radius:50%;display:inline-block}.dot.pass{background:var(--pass)}.dot.fail{background:var(--fail)}.dot.warn{background:var(--warn)}.dot.manual{background:var(--manual)}.dot.skip{background:var(--skip)}
section{margin-top:22px}h2{font-size:15px;margin:0 0 10px}.ct{color:var(--muted);font-weight:500;font-size:12px}
.row{display:grid;grid-template-columns:26px 1fr;gap:12px;padding:14px 16px;border-top:1px solid var(--border)}.row:first-child{border-top:none}
.st{width:22px;height:22px;border-radius:6px;display:grid;place-items:center;font-weight:800;color:#06101a}.st.pass{background:var(--pass)}.st.fail{background:var(--fail);color:#fff}.st.warn{background:var(--warn)}.st.manual{background:var(--manual)}.st.skip{background:var(--skip);color:#cfd6e4}
.ti{font-weight:600}.mt{display:flex;gap:8px;margin-top:3px;flex-wrap:wrap}.bd{font-size:11px;padding:2px 8px;border:1px solid var(--border);border-radius:999px;color:var(--muted)}.bd.sev-critical{color:#ffd0d0;background:#2a1717;border-color:#5a2a2a}.bd.sev-high{color:#ffe6c2;background:#261d11;border-color:#5a4326}
.de{color:var(--muted);font-size:13.5px;margin-top:6px}.ev,.fx pre{background:#0e1422;border:1px solid var(--border);border-radius:8px;padding:10px;margin-top:8px;overflow-x:auto;font:12.5px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap}
.fx{margin-top:8px}.fx summary{cursor:pointer;color:#6d8bff}a{color:#6d8bff}
</style></head><body><div class="wrap">
<h1>SEO Launch Audit</h1><div class="sub">${esc(report.target)} · ${esc(new Date(report.generatedAt).toLocaleString())} · ${report.pagesAudited.length} page(s) · rules ${esc(report.meta.rulesVersion)}</div>
<div class="panel summary"><div class="ring"><div><b>${report.score}</b><small>/ 100</small></div></div>
<div><div style="font-weight:700;font-size:16px;margin-bottom:8px">${esc(report.target)}</div>
<div class="totals">${pill('pass', t.pass, 'Passed')}${pill('fail', t.fail, 'Failed')}${pill('warn', t.warn, 'Warnings')}${pill('manual', t.manual, 'Manual')}${pill('skip', t.skip, 'Skipped')}</div></div></div>
${sections}
<div class="sub" style="margin-top:30px">Generated by Astro SEO Launch Kit · ${report.totals.total} checks · ${report.meta.automatedChecks} automated</div>
</div></body></html>`;
}
