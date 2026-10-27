'use strict';
// Recurring regulator publications: find the previous edition so the draft can
// compare substance with substance (EDITORIAL.md, "Recurring regulator
// publications"). Currently GOV.UK only, through its public search API.

const { log } = require('./util');

// "annual report and accounts 2025 to 2026" -> "annual report and accounts 2024 to 2025"
// "Inspection findings 2026" -> "Inspection findings 2025"
// Returns null when the title carries no year to step back from.
function previousEditionTitle(title) {
  const t = String(title || '');
  const range = t.match(/\b(\d{4})\s*(?:to|-|–|\/)\s*(\d{4}|\d{2})\b/);
  if (range) {
    const y1 = parseInt(range[1], 10);
    const y2raw = range[2];
    const y2 = y2raw.length === 2 ? parseInt(range[1].slice(0, 2) + y2raw, 10) : parseInt(y2raw, 10);
    const sep = range[0].slice(range[1].length, range[0].length - y2raw.length);
    const prev2 = y2raw.length === 2 ? String(y2 - 1).slice(2) : String(y2 - 1);
    return t.replace(range[0], `${y1 - 1}${sep}${prev2}`);
  }
  const single = t.match(/\b(20\d{2})\b/);
  if (single) return t.replace(single[0], String(parseInt(single[0], 10) - 1));
  return null;
}

function isRecurringPublication(item) {
  const t = `${item.title || ''}`.toLowerCase();
  return /annual report|annual review|inspection (findings|report|summary)|code of practice|codes of practice|licensing standards|statistics|yearly|quarterly report/.test(t)
    && previousEditionTitle(item.title) !== null;
}

function stripPrefix(title) {
  return String(title || '').replace(/^(corporate report|guidance|statistics|research and analysis|policy paper|transparency data|news story|press release):\s*/i, '').trim();
}

async function searchGovUk(query, userAgent, timeoutMs = 15000) {
  const u = new URL('https://www.gov.uk/api/search.json');
  u.searchParams.set('q', query);
  u.searchParams.set('count', '10');
  u.searchParams.set('fields', 'title,link,public_timestamp,organisations');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(u, { headers: { 'User-Agent': userAgent, Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
  } finally {
    clearTimeout(t);
  }
}

function normalise(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// For a GOV.UK recurring publication, returns a research item for the previous
// edition ({title, link, source, sourceId, isoDate, isPreviousEdition: true})
// or null. Never throws: a lookup failure just means no comparison.
async function findPreviousEdition(item, userAgent, opts = {}) {
  try {
    if (opts.offline) return null;
    if (!/^https?:\/\/(www\.)?gov\.uk\//.test(item.link || '')) return null;
    if (!isRecurringPublication(item)) return null;
    const wanted = stripPrefix(previousEditionTitle(item.title));
    const results = await searchGovUk(wanted, userAgent);
    const target = normalise(wanted);
    const hit = results.find(r => normalise(r.title) === target)
      || results.find(r => normalise(r.title).includes(target) || target.includes(normalise(r.title)));
    if (!hit) {
      log(`previous edition: no GOV.UK match for "${wanted}"`);
      return null;
    }
    const link = hit.link.startsWith('http') ? hit.link : `https://www.gov.uk${hit.link}`;
    if (link === item.link) return null;
    log(`previous edition: ${hit.title} ${link}`);
    return {
      title: hit.title,
      link,
      description: `Previous edition of: ${item.title}`,
      isoDate: hit.public_timestamp || null,
      source: item.source,
      sourceId: item.sourceId,
      category: item.category,
      isPreviousEdition: true
    };
  } catch (err) {
    log(`previous edition lookup failed: ${err.message}`);
    return null;
  }
}

module.exports = { previousEditionTitle, isRecurringPublication, findPreviousEdition, stripPrefix };
