'use strict';
// Step 4 RESEARCH: fetch the source pages for the chosen items so the draft
// and the claim check work from the actual text, not the feed summary.
// Polite: honours robots.txt for our user agent, 15 s timeout, one fetch per
// URL, text only. Fetched text is held in memory for the run and is never
// written into the repository.
//
// When a source page links to PDF attachments (GOV.UK publication pages list
// them in `.gem-c-attachment` blocks, usually on assets.publishing.service.gov.uk)
// the first one or two are downloaded too, capped at MAX_PDF_BYTES each, and
// their text is appended to the source record, so a report is read from the
// document itself and not from the landing page's metadata. The PDF bytes stay
// in memory; nothing is written to disk.
//
// Caps. A landing page is kept to `pageChars` and each attachment to
// `attachmentChars` (defaults below; config/site.json `research` overrides
// them). The attachment cap is set so that a long regulator report, such as an
// 84-page annual report, is read in full. `applyResearchBudget` then holds
// the text handed to the model across the whole run to `totalChars`, trimming
// the least important sources first, so the bill stays bounded however many
// documents a fortnight turns up.

const { stripTags, log } = require('./util');

const DEFAULT_LIMITS = Object.freeze({
  pageChars: 60000,
  attachmentChars: 250000,
  totalChars: 600000
});
// Kept for callers that import the old name; it is the attachment cap.
const MAX_CHARS = DEFAULT_LIMITS.attachmentChars;
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 2;
const MAX_PDF_PAGES = 400;
const robotsCache = new Map();

async function fetchText(url, userAgent, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml,text/plain,*/*' },
      redirect: 'follow',
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// Download a binary attachment into memory, refusing anything over maxBytes
// (checked against Content-Length first, then while the body streams in).
async function fetchBytes(url, userAgent, { timeoutMs = 30000, maxBytes = MAX_PDF_BYTES } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent, Accept: 'application/pdf,*/*' },
      redirect: 'follow',
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > maxBytes) throw new Error(`attachment is ${Math.round(declared / 1024 / 1024)} MB, over the ${Math.round(maxBytes / 1024 / 1024)} MB cap`);
    const chunks = [];
    let total = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        ctrl.abort();
        throw new Error(`attachment exceeded the ${Math.round(maxBytes / 1024 / 1024)} MB cap`);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks.map(c => Buffer.from(c.buffer, c.byteOffset, c.byteLength)));
  } finally {
    clearTimeout(t);
  }
}

// Minimal robots.txt reader: rules for our product token first, else "*".
function parseRobots(txt, agentToken) {
  const lines = txt.split(/\r?\n/).map(l => l.replace(/#.*$/, '').trim()).filter(Boolean);
  const groups = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
    } else if ((key === 'disallow' || key === 'allow') && cur) {
      cur.rules.push({ allow: key === 'allow', path: val });
    }
  }
  const mine = groups.find(g => g.agents.some(a => a && agentToken.toLowerCase().startsWith(a)));
  const star = groups.find(g => g.agents.includes('*'));
  return (mine || star || { rules: [] }).rules;
}

function allowedByRules(rules, pathname) {
  let best = null;
  for (const r of rules) {
    if (!r.path) { if (!r.allow) continue; }
    const pattern = r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$');
    const re = new RegExp('^' + pattern);
    if (re.test(pathname) && (!best || r.path.length > best.path.length)) best = r;
  }
  return !best || best.allow;
}

async function robotsAllows(url, userAgent) {
  const u = new URL(url);
  const key = u.origin;
  if (!robotsCache.has(key)) {
    let rules = [];
    try {
      const txt = await fetchText(`${u.origin}/robots.txt`, userAgent, 8000);
      rules = parseRobots(txt, 'Pro-curo-NewsBot');
    } catch {
      rules = [];
    }
    robotsCache.set(key, rules);
  }
  return allowedByRules(robotsCache.get(key), u.pathname + u.search);
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#8217;/g, '’').replace(/&#8211;/g, '–').replace(/&nbsp;/g, ' ');
}

function htmlToText(html) {
  let s = String(html);
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ');
  const main = s.match(/<main[\s\S]*?<\/main>/i) || s.match(/<article[\s\S]*?<\/article>/i);
  if (main) s = main[0];
  s = s.replace(/<(p|div|br|li|h[1-6]|tr|section)[^>]*>/gi, '\n$&');
  s = stripTags(s.replace(/\n/g, ' \n '));
  s = decodeEntities(s);
  return s.replace(/\s*\n\s*/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

// Welsh-language versions of GOV.UK documents are usually a separate
// attachment whose title or file name says so. Skip those when an English
// file is available.
const WELSH_RE = /\b(welsh|cymraeg|cymru|fersiwn)\b|[-_.]cy(?:mraeg)?[-_.]|[-_]cy\.pdf$|[-_]w\.pdf$/i;

// Find PDF attachments linked from a fetched page. GOV.UK publication pages
// list them inside `.gem-c-attachment` blocks; any other absolute or
// relative link ending in .pdf is considered after those. Returns
// [{url, title, govuk: bool}] in preference order, de-duplicated, with Welsh
// files pushed to the end.
function findPdfAttachments(html, baseUrl, { max = MAX_ATTACHMENTS } = {}) {
  const s = String(html);
  const seen = new Map();
  const found = [];
  const anchorRe = /<a\b([^>]*?)href\s*=\s*(?:"([^"]*)"|'([^']*)')([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchorRe.exec(s))) {
    const href = decodeEntities(m[2] != null ? m[2] : m[3] || '').trim();
    if (!/\.pdf(?:[?#][^\s]*)?$/i.test(href)) continue;
    let url;
    try { url = new URL(href, baseUrl); } catch { continue; }
    if (!/^https?:$/.test(url.protocol)) continue;
    const key = url.href.replace(/[?#].*$/, '');
    const attrs = `${m[1]} ${m[4]}`;
    const anchorText = decodeEntities(stripTags(m[5])).replace(/\s+/g, ' ').trim();
    if (seen.has(key)) {
      // GOV.UK links each attachment twice (thumbnail, then title); keep the
      // first link's place but take the title from whichever has text.
      const prev = seen.get(key);
      if (!prev.titled && anchorText) { prev.title = anchorText; prev.titled = true; prev.welsh = prev.welsh || WELSH_RE.test(anchorText); }
      continue;
    }
    const before = s.slice(Math.max(0, m.index - 3000), m.index);
    const govuk = /gem-c-attachment/i.test(before) || /gem-c-attachment|govuk-link/i.test(attrs) || /assets\.publishing\.service\.gov\.uk$/i.test(url.hostname);
    const title = anchorText || url.pathname.split('/').pop();
    const welsh = WELSH_RE.test(title) || WELSH_RE.test(url.pathname) || /\blang\s*=\s*["']?cy\b/i.test(attrs) || /hreflang\s*=\s*["']?cy\b/i.test(attrs);
    const entry = { url: key, title, titled: !!anchorText, govuk, welsh };
    seen.set(key, entry);
    found.push(entry);
  }
  found.sort((a, b) => (a.welsh - b.welsh) || (b.govuk - a.govuk));
  // Only fall back to Welsh files when there is nothing else at all.
  const english = found.filter(a => !a.welsh);
  // GOV.UK often lists the same document twice (print PDF plus a web
  // accessible or large print copy). Reading it once is enough.
  const chosen = [];
  const seenTitles = new Set();
  for (const a of (english.length ? english : found)) {
    const canon = a.title.toLowerCase().replace(/\((?:[^)]*)\)/g, ' ').replace(/\b(web\s+)?accessible( version)?\b|\blarge print\b|\bprint( version)?\b|\bpdf\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
    if (canon && seenTitles.has(canon)) continue;
    seenTitles.add(canon);
    chosen.push(a);
    if (chosen.length >= max) break;
  }
  return chosen.map(({ url, title, govuk }) => ({ url, title, govuk }));
}

let pdfjsPromise = null;
function loadPdfjs() {
  // Pure-JS build; no worker thread and no canvas needed for text extraction.
  if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

// Extract readable text from PDF bytes, page by page, stopping once maxChars
// is reached. Returns {text, pages, totalPages, truncated}.
async function extractPdfText(bytes, { maxChars = MAX_CHARS, maxPages = MAX_PDF_PAGES } = {}) {
  const pdfjs = await loadPdfjs();
  const data = bytes instanceof Uint8Array ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new Uint8Array(bytes);
  const task = pdfjs.getDocument({ data, useSystemFonts: true, disableFontFace: true, isEvalSupported: false, verbosity: 0 });
  const doc = await task.promise;
  const out = [];
  let chars = 0;
  let pages = 0;
  let truncated = false;
  try {
    const limit = Math.min(doc.numPages, maxPages);
    for (let p = 1; p <= limit; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      let pageText = '';
      for (const item of content.items) {
        if (typeof item.str !== 'string') continue;
        pageText += item.str;
        pageText += item.hasEOL ? '\n' : ' ';
      }
      page.cleanup();
      pageText = pageText.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      pages++;
      if (!pageText) continue;
      if (chars + pageText.length > maxChars) {
        out.push(pageText.slice(0, Math.max(0, maxChars - chars)));
        chars = maxChars;
        truncated = true;
        break;
      }
      out.push(pageText);
      chars += pageText.length + 2;
    }
    if (!truncated && doc.numPages > limit) truncated = true;
    return { text: out.join('\n\n').trim().slice(0, maxChars), pages, totalPages: doc.numPages, truncated };
  } finally {
    await doc.destroy().catch(() => {});
  }
}

// Fetch and read the chosen attachments for one source record. Returns
// [{url, title, pages, totalPages, chars, truncated}] for the ones that were
// read, and appends their text to rec.text as clearly labelled blocks.
async function readAttachments(rec, attachments, userAgent, opts = {}) {
  const read = [];
  const fetchBytesImpl = opts.fetchBytes || fetchBytes;
  const allows = opts.robotsAllows || robotsAllows;
  const limits = resolveLimits(opts.limits);
  for (const att of attachments) {
    try {
      if (!(await allows(att.url, userAgent))) {
        log(`research: robots.txt disallows attachment ${att.url}`);
        continue;
      }
      const bytes = await fetchBytesImpl(att.url, userAgent);
      const extracted = await extractPdfText(bytes, { maxChars: limits.attachmentChars });
      if (extracted.text.length < 200) {
        log(`research: attachment had little readable text, skipped ${att.url}`);
        continue;
      }
      rec.text += `\n\n--- ATTACHMENT: ${att.title} (${att.url}) pages 1 to ${extracted.pages} of ${extracted.totalPages}${extracted.truncated ? ', text truncated' : ''} ---\n${extracted.text}`;
      read.push({ url: att.url, title: att.title, pages: extracted.pages, totalPages: extracted.totalPages, chars: extracted.text.length, truncated: extracted.truncated });
      log(`research: read attachment ${att.url} (${extracted.pages} of ${extracted.totalPages} pages, ${extracted.text.length} chars)`);
    } catch (err) {
      log(`research: attachment failed ${att.url} (${err.message})`);
    }
  }
  return read;
}

function describeAttachments(read) {
  return read.map(a => `${a.title} (${a.pages} of ${a.totalPages} pages${a.truncated ? ', truncated' : ''})`).join('; ');
}

function resolveLimits(given) {
  const out = { ...DEFAULT_LIMITS };
  for (const k of Object.keys(DEFAULT_LIMITS)) {
    const v = given && Number(given[k]);
    if (Number.isFinite(v) && v > 0) out[k] = Math.floor(v);
  }
  return out;
}

// items: [{title, link, ...}] -> [{...item, text, fetched: bool, note, attachments}]
// opts.limits: {pageChars, attachmentChars} (see DEFAULT_LIMITS)
async function research(items, userAgent, opts = {}) {
  const out = [];
  const limits = resolveLimits(opts.limits);
  for (const item of items) {
    const rec = { ...item, text: '', fetched: false, note: '', attachments: [] };
    try {
      if (opts.offline) throw new Error('offline');
      if (!(await robotsAllows(item.link, userAgent))) {
        rec.note = 'robots.txt disallows fetching this page; using the feed summary only';
      } else {
        const html = await fetchText(item.link, userAgent);
        rec.text = htmlToText(html).slice(0, limits.pageChars);
        rec.fetched = rec.text.length > 200;
        if (!rec.fetched) rec.note = 'page returned little readable text; using the feed summary only';
        const attachments = findPdfAttachments(html, item.link);
        if (attachments.length) {
          rec.attachments = await readAttachments(rec, attachments, userAgent, opts);
          if (rec.attachments.length) {
            rec.fetched = true;
            rec.note = `read attachment${rec.attachments.length > 1 ? 's' : ''}: ${describeAttachments(rec.attachments)}`;
          } else {
            rec.note = [rec.note, `${attachments.length} PDF attachment${attachments.length > 1 ? 's' : ''} linked but none could be read`].filter(Boolean).join('; ');
          }
        }
      }
    } catch (err) {
      rec.note = `fetch failed (${err.message}); using the feed summary only`;
    }
    if (!rec.fetched) rec.text = `${item.title}\n\n${item.description || ''}`;
    log(`research: ${rec.fetched ? 'fetched' : 'summary only'} ${item.link}${rec.note ? ' (' + rec.note + ')' : ''}`);
    out.push(rec);
  }
  return out;
}

// Hold the total research text to `totalChars`. Lead sources keep their text
// first; the previous edition comes next; sources added later in the run
// (the fallback's extra stories) give way first. A trimmed record keeps the
// start of its text, gains a note, and is marked `trimmed` so the PR's
// research list says so. Returns {researched, trimmed: [titles], total}.
function applyResearchBudget(researched, limits) {
  const { totalChars } = resolveLimits(limits);
  const order = researched
    .map((r, i) => ({ r, i, rank: r.isPreviousEdition ? 1 : (r.isExtra ? 2 : 0) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i);
  let remaining = totalChars;
  const trimmed = [];
  for (const { r } of order) {
    const text = r.text || '';
    if (text.length <= remaining) {
      remaining -= text.length;
      continue;
    }
    const keep = Math.max(0, remaining);
    const marker = `

[Text trimmed here to stay within the research budget: ${text.length - keep} of ${text.length} characters not shown]`;
    r.text = text.slice(0, keep) + marker;
    r.trimmed = true;
    r.note = [r.note, `text trimmed to ${keep} characters by the research budget`].filter(Boolean).join('; ');
    trimmed.push(r.title);
    remaining = 0;
  }
  const total = researched.reduce((n, r) => n + (r.text || '').length, 0);
  return { researched, trimmed, total };
}

module.exports = { research, applyResearchBudget, resolveLimits, DEFAULT_LIMITS, parseRobots, allowedByRules, htmlToText, findPdfAttachments, extractPdfText, readAttachments, fetchBytes, MAX_CHARS, MAX_PDF_BYTES };
