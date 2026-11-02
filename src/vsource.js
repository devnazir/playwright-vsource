import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

let browserPromise;
function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true }).catch((err) => {
      browserPromise = undefined;
      throw err;
    });
  }
  return browserPromise;
}

export async function closeBrowser() {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => null);
  browserPromise = undefined;
  await browser?.close();
}

function displayUrl(url, hideParams = []) {
  const u = new URL(url);
  for (const p of hideParams) u.searchParams.delete(p);
  return u.toString();
}

function keepQuery(finalUrl, requestedUrl) {
  const f = new URL(finalUrl);
  const r = new URL(requestedUrl);
  for (const [k, v] of r.searchParams) if (!f.searchParams.has(k)) f.searchParams.set(k, v);
  return f.toString();
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildMatchers(matches = []) {
  return matches.map((m) => {
    if (m.startsWith('re:')) return new RegExp(m.slice(3), 'g');
    const variants = new Set([m]);
    if (m.includes('/')) variants.add(m.replace(/\//g, '\\/'));
    return new RegExp([...variants].map(escapeRegExp).join('|'), 'g');
  });
}

function findMatches(lines, matchers, wantedLines) {
  const hits = [];
  lines.forEach((text, i) => {
    const ranges = [];
    for (const re of matchers) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        if (m[0].length === 0) { re.lastIndex++; continue; }
        ranges.push([m.index, m.index + m[0].length]);
      }
    }
    const lineNo = i + 1;
    if (ranges.length || wantedLines.has(lineNo)) {
      ranges.sort((a, b) => a[0] - b[0]);
      const merged = [];
      for (const r of ranges) {
        const last = merged[merged.length - 1];
        if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
        else merged.push([...r]);
      }
      hits.push({ line: lineNo, ranges: merged, wholeLine: ranges.length === 0 });
    }
  });
  return hits;
}

function renderLine(text, hit) {
  if (!hit) return escapeHtml(text);
  if (hit.wholeLine) return `<mark>${escapeHtml(text)}</mark>`;
  let out = '';
  let pos = 0;
  for (const [s, e] of hit.ranges) {
    out += escapeHtml(text.slice(pos, s)) + '<mark>' + escapeHtml(text.slice(s, e)) + '</mark>';
    pos = e;
  }
  return out + escapeHtml(text.slice(pos));
}

function renderPage(shownUrl, lines, hitsByLine, visible) {
  let rows = '';
  let hidden = 0;
  const flushGap = () => {
    if (hidden) rows += `<tr class="gap"><td class="n">⋯</td><td class="c">${hidden.toLocaleString('en')} line${hidden === 1 ? '' : 's'} hidden</td></tr>`;
    hidden = 0;
  };
  lines.forEach((l, i) => {
    const n = i + 1;
    if (visible && !visible.has(n)) { hidden++; return; }
    flushGap();
    rows += `<tr id="L${n}"><td class="n">${n}</td><td class="c">${renderLine(l, hitsByLine.get(n))}</td></tr>`;
  });
  flushGap();
  return `<!doctype html><html><head><meta charset="utf-8"><title>view-source:${escapeHtml(shownUrl)}</title><style>
body{margin:0;font:13px/1.45 ui-monospace,Menlo,monospace;background:#fff;color:#000}
.bar{position:sticky;top:0;z-index:1;background:#f1f3f4;border-bottom:1px solid #dadce0;padding:8px 12px;font:13px system-ui,-apple-system,sans-serif;color:#202124}
.bar b{font-weight:500;color:#5f6368}
table{border-collapse:collapse;width:100%}td{vertical-align:top;padding:0 8px}
.n{color:#999;text-align:right;user-select:none;border-right:1px solid #ddd;min-width:48px}
.c{white-space:pre-wrap;word-break:break-all}
mark{background:#ffe55c;outline:2px solid #f2b600;color:inherit}
tr.gap td{background:#f6f8fa;color:#6a737d;font-style:italic;padding-top:3px;padding-bottom:3px;border-top:1px dashed #d0d7de;border-bottom:1px dashed #d0d7de}
</style></head><body><div class="bar"><b>view-source:</b>${escapeHtml(shownUrl)}</div><table>${rows}</table></body></html>`;
}

function defaultOutPath(url, label) {
  const u = new URL(url);
  const slug = (u.hostname.replace(/^www\./, '') + u.pathname)
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return path.join(homedir(), 'Desktop', `vsource-${slug}${label ? '-' + label : ''}-${stamp}.png`);
}

function expandHome(p) {
  return p.startsWith('~') ? path.join(homedir(), p.slice(1)) : p;
}

export async function fetchSource({ url, hideParams = [], timeoutMs = 45000 }) {
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  try {
    const page = await context.newPage();
    const nav = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const finalUrl = page.url();
    const fetchUrl = keepQuery(finalUrl, url);
    const result = await page.evaluate(async (u) => {
      const r = await fetch(u, { cache: 'no-store', credentials: 'include' });
      return { status: r.status, url: r.url, text: await r.text() };
    }, fetchUrl);
    return {
      html: result.text,
      status: result.status,
      navigationStatus: nav?.status() ?? null,
      finalUrl,
      shownUrl: displayUrl(fetchUrl, hideParams),
    };
  } finally {
    await context.close();
  }
}

export async function findInSource({ url, hideParams, matches = [], lines: wanted = [] }) {
  const src = await fetchSource({ url, hideParams });
  const lines = src.html.split('\n');
  const hits = findMatches(lines, buildMatchers(matches), new Set(wanted));
  return {
    shownUrl: src.shownUrl,
    status: src.status,
    totalLines: lines.length,
    matches: hits.map((h) => ({ line: h.line, text: lines[h.line - 1].trim().slice(0, 400) })),
  };
}

export async function viewSourceScreenshot({
  url,
  hideParams,
  matches = [],
  lines: wanted = [],
  out,
  label,
  mode = 'matches',
  contextLines = 4,
  width = 1366,
  height = 690,
}) {
  const src = await fetchSource({ url, hideParams });
  const lines = src.html.split('\n');
  const hits = findMatches(lines, buildMatchers(matches), new Set(wanted));
  const hitsByLine = new Map(hits.map((h) => [h.line, h]));

  const outPath = expandHome(out || defaultOutPath(src.finalUrl, label));
  await mkdir(path.dirname(outPath), { recursive: true });

  let visible = null;
  if (hits.length && mode === 'matches') {
    visible = new Set();
    for (const h of hits) {
      for (let n = Math.max(1, h.line - contextLines); n <= Math.min(lines.length, h.line + contextLines); n++) visible.add(n);
    }
  }

  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width, height } });
  try {
    const page = await context.newPage();
    await page.setContent(renderPage(src.shownUrl, lines, hitsByLine, visible), { waitUntil: 'domcontentloaded' });

    if (visible) {
      await page.setViewportSize({ width, height: 100 });
      await page.screenshot({ path: outPath, fullPage: true });
    } else if (hits.length) {
      await page.evaluate((n) => {
        const bar = document.querySelector('.bar').getBoundingClientRect().height;
        const top = document.getElementById('L' + n).getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, Math.max(0, top - bar - 120));
      }, hits[0].line);
      await page.screenshot({ path: outPath });
    } else {
      await page.screenshot({ path: outPath });
    }
  } finally {
    await context.close();
  }

  return {
    path: outPath,
    shownUrl: src.shownUrl,
    status: src.status,
    totalLines: lines.length,
    matches: hits.map((h) => ({ line: h.line, text: lines[h.line - 1].trim().slice(0, 300) })),
  };
}
