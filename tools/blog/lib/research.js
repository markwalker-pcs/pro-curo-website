'use strict';
// Step 4 RESEARCH: fetch the source pages for the chosen items so the draft
// and the claim check work from the actual text, not the feed summary.
// Polite: honours robots.txt for our user agent, 15 s timeout, one fetch per
// URL, text only. Fetched text is held in memory for the run and is never
// written into the repository.

const { stripTags, log } = require('./util');

const MAX_CHARS = 16000;
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
  s = s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#8217;/g, '’').replace(/&#8211;/g, '–');
  return s.replace(/\s*\n\s*/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

// items: [{title, link, ...}] -> [{...item, text, fetched: bool, note}]
async function research(items, userAgent, opts = {}) {
  const out = [];
  for (const item of items) {
    const rec = { ...item, text: '', fetched: false, note: '' };
    try {
      if (opts.offline) throw new Error('offline');
      if (!(await robotsAllows(item.link, userAgent))) {
        rec.note = 'robots.txt disallows fetching this page; using the feed summary only';
      } else {
        const html = await fetchText(item.link, userAgent);
        rec.text = htmlToText(html).slice(0, MAX_CHARS);
        rec.fetched = rec.text.length > 200;
        if (!rec.fetched) rec.note = 'page returned little readable text; using the feed summary only';
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

module.exports = { research, parseRobots, allowedByRules, htmlToText };
