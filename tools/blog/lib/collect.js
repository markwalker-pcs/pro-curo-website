'use strict';
// Step 1 COLLECT: read /api/news (or the feeds directly), keep items in the
// window, and write a dated snapshot to content/news-snapshots/.

const path = require('path');
const fs = require('fs');
const { CONTENT_ROOT, REPO_ROOT, readJson, writeJson, isoDate, daysAgo, log } = require('./util');

const SNAPSHOT_DIR = path.join(CONTENT_ROOT, 'news-snapshots');

async function fetchJson(url, userAgent, timeoutMs = 60000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Fall back to the Function's own feed list and parsers so a cold or failing
// API does not stop the run. api/news/index.js exports FEEDS and the parsers.
async function fetchFeedsDirect(userAgent) {
  const api = require(path.join(REPO_ROOT, 'api', 'news', 'index.js'));
  const seen = new Set();
  const articles = [];
  const errors = [];
  await Promise.all(api.FEEDS.map(async (feed) => {
    try {
      const xml = await api.fetchURL(feed.url);
      const items = feed.format === 'atom' ? api.parseAtom(xml, feed) : api.parseRSS(xml, feed);
      for (const a of items) {
        if (!a.link || seen.has(a.link)) continue;
        seen.add(a.link);
        articles.push(a);
      }
    } catch (err) {
      errors.push({ source: feed.name, url: feed.url, error: err.message });
    }
  }));
  articles.sort((a, b) => String(b.isoDate || '').localeCompare(String(a.isoDate || '')));
  return { ok: true, articles, errors, source: 'direct' };
}

function inWindow(article, since) {
  if (!article.isoDate) return false;
  const d = new Date(article.isoDate);
  return !isNaN(d.getTime()) && d >= since;
}

async function collect(cfg, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const since = daysAgo(cfg.windowDays, now);
  let data;
  let how = 'api';
  if (opts.snapshotFile) {
    // A fixture may be an API response ({articles}) or an earlier snapshot ({items}).
    const raw = readJson(opts.snapshotFile);
    data = { articles: raw.articles || raw.items || [], errors: raw.errors || raw.sourceErrors || [], warnings: raw.warnings || raw.sourceWarnings || [] };
    how = 'fixture';
  } else {
    try {
      data = await fetchJson(cfg.newsApi, cfg.userAgent);
      if (!data.ok || !Array.isArray(data.articles) || data.articles.length === 0) throw new Error('API returned no articles');
    } catch (err) {
      log(`API unavailable (${err.message}); fetching feeds directly.`);
      data = await fetchFeedsDirect(cfg.userAgent);
      how = 'direct';
    }
  }

  const all = data.articles || [];
  const items = all.filter(a => inWindow(a, since)).map(a => ({
    title: a.title,
    link: a.link,
    description: a.description || '',
    isoDate: a.isoDate,
    source: a.source,
    sourceId: a.sourceId,
    category: a.category || null
  }));

  const snapshot = {
    date: isoDate(now),
    collectedAt: now.toISOString(),
    windowDays: cfg.windowDays,
    since: since.toISOString(),
    via: how,
    totalInFeed: all.length,
    count: items.length,
    sourceErrors: data.errors || [],
    sourceWarnings: data.warnings || [],
    items
  };

  if (!opts.noWrite) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    writeJson(path.join(SNAPSHOT_DIR, `${snapshot.date}.json`), snapshot);
    log(`Snapshot ${snapshot.date}: ${items.length} of ${all.length} items within ${cfg.windowDays} days (via ${how}).`);
  }
  return snapshot;
}

// Most recent N snapshots on disk (excluding one date if asked), newest first.
function recentSnapshots(n, excludeDate) {
  if (!fs.existsSync(SNAPSHOT_DIR)) return [];
  return fs.readdirSync(SNAPSHOT_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) !== excludeDate)
    .sort()
    .reverse()
    .slice(0, n)
    .map(f => readJson(path.join(SNAPSHOT_DIR, f)));
}

module.exports = { collect, recentSnapshots, inWindow, SNAPSHOT_DIR };
