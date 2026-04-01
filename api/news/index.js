/**
 * Azure Function: GET /api/news
 *
 * Fetches RSS/Atom feeds from trusted life-science and tissue-sector sources,
 * parses them into a unified JSON format, and caches the result in Azure Blob
 * Storage so it survives function cold starts.
 *
 * Query parameters:
 *   ?source=hta          — filter by source ID (optional)
 *   ?refresh=true        — force a cache refresh (optional, for admin use)
 *
 * Environment variables:
 *   NEWS_CACHE_CONNECTION — Azure Storage connection string (required for
 *                           persistent cache; falls back to in-memory if unset)
 */

const https = require('https');
const http = require('http');
const { XMLParser } = require('fast-xml-parser');
const { BlobServiceClient } = require('@azure/storage-blob');

// ---------------------------------------------------------------------------
// Feed configuration
// ---------------------------------------------------------------------------
const FEEDS = [
  {
    id: 'hta',
    name: 'Human Tissue Authority',
    url: 'https://www.gov.uk/government/organisations/human-tissue-authority.atom',
    website: 'https://www.hta.gov.uk',
    format: 'atom',
    maxItems: 15
  },
  {
    id: 'nhsbt',
    name: 'NHS Blood & Transplant',
    url: 'https://www.gov.uk/government/organisations/nhs-blood-and-transplant.atom',
    website: 'https://www.nhsbt.nhs.uk',
    format: 'atom',
    maxItems: 15
  },
  {
    id: 'the-scientist',
    name: 'The Scientist',
    url: 'https://www.the-scientist.com/rss',
    website: 'https://www.the-scientist.com',
    format: 'rss',
    maxItems: 15
  },
  {
    id: 'lab-manager',
    name: 'Lab Manager',
    url: 'https://www.labmanager.com/rss',
    website: 'https://www.labmanager.com',
    format: 'rss',
    maxItems: 15
  },
  {
    id: 'biobanking',
    name: 'Biobanking.com',
    url: 'https://www.biobanking.com/feed/',
    website: 'https://www.biobanking.com',
    format: 'rss',
    maxItems: 15
  },
  {
    id: 'elife',
    name: 'eLife Sciences',
    url: 'https://elifesciences.org/rss/recent.xml',
    website: 'https://elifesciences.org',
    format: 'rss',
    maxItems: 15
  },
  {
    id: 'lab-news',
    name: 'Lab News',
    url: 'https://www.labnews.co.uk/section/1.rss',
    website: 'https://www.labnews.co.uk',
    format: 'rss',
    maxItems: 15
  }
];

// ---------------------------------------------------------------------------
// Cache configuration
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const BLOB_CONTAINER = 'newscache';
const BLOB_NAME = 'news-feed-cache.json';

// In-memory fallback (used if Blob Storage is not configured)
let memoryCache = {
  articles: [],
  sources: {},
  fetchedAt: null,
  errors: []
};

// ---------------------------------------------------------------------------
// Blob Storage cache helpers
// ---------------------------------------------------------------------------
function getBlobClient() {
  const connStr = process.env.NEWS_CACHE_CONNECTION;
  if (!connStr) return null;
  try {
    const blobService = BlobServiceClient.fromConnectionString(connStr);
    const container = blobService.getContainerClient(BLOB_CONTAINER);
    return { container, blob: container.getBlockBlobClient(BLOB_NAME) };
  } catch {
    return null;
  }
}

async function readBlobCache(context) {
  const client = getBlobClient();
  if (!client) {
    context.log('No Blob Storage configured — using in-memory cache.');
    return memoryCache;
  }

  try {
    const response = await client.blob.download(0);
    const chunks = [];
    for await (const chunk of response.readableStreamBody) {
      chunks.push(chunk);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
    context.log(`Loaded ${data.articles ? data.articles.length : 0} articles from Blob cache (cached at ${data.fetchedAt || 'unknown'}).`);
    return data;
  } catch (err) {
    if (err.statusCode === 404) {
      context.log('Blob cache does not exist yet — will create on first fetch.');
    } else {
      context.log.warn('Failed to read Blob cache:', err.message);
    }
    return { articles: [], sources: {}, fetchedAt: null, errors: [] };
  }
}

async function writeBlobCache(context, data) {
  const client = getBlobClient();
  if (!client) {
    // Fall back to memory
    memoryCache = data;
    return;
  }

  try {
    // Ensure container exists
    await client.container.createIfNotExists();

    const json = JSON.stringify(data);
    await client.blob.upload(json, Buffer.byteLength(json), {
      blobHTTPHeaders: { blobContentType: 'application/json' },
      overwrite: true
    });
    context.log(`Wrote ${data.articles.length} articles to Blob cache.`);
  } catch (err) {
    context.log.error('Failed to write Blob cache:', err.message);
    // Still keep in memory as fallback
    memoryCache = data;
  }
}

// ---------------------------------------------------------------------------
// HTTP fetch helper (follows redirects, 20 s timeout)
// ---------------------------------------------------------------------------
function fetchURL(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      return reject(new Error('Too many redirects'));
    }

    const lib = url.startsWith('https') ? https : http;

    const req = lib.get(url, {
      timeout: 20000,
      headers: {
        'User-Agent': 'Pro-curo-NewsBot/1.0 (+https://www.pro-curo.com)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
      }
    }, (res) => {
      // Follow redirects
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return resolve(fetchURL(redirectUrl, redirectCount + 1));
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume(); // drain
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });

    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout fetching ${url}`)); });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// XML parser instance
// ---------------------------------------------------------------------------
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) => ['item', 'entry'].includes(name)
});

// ---------------------------------------------------------------------------
// Feed parsers
// ---------------------------------------------------------------------------
function stripHTML(html) {
  if (!html) return '';
  return String(html)
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text, max) {
  if (!text || text.length <= max) return text || '';
  return text.substring(0, max).replace(/\s+\S*$/, '') + '\u2026';
}

function parseRSS(xml, feed) {
  const articles = [];
  try {
    const doc = parser.parse(xml);
    const channel = doc.rss && doc.rss.channel;
    if (!channel) return articles;

    const items = Array.isArray(channel.item) ? channel.item : (channel.item ? [channel.item] : []);

    for (let i = 0; i < Math.min(items.length, feed.maxItems); i++) {
      const item = items[i];
      articles.push({
        title: stripHTML(item.title || ''),
        link: item.link || '',
        description: truncate(stripHTML(item.description || item['content:encoded'] || ''), 280),
        date: item.pubDate || null,
        isoDate: safeISODate(item.pubDate),
        source: feed.name,
        sourceId: feed.id
      });
    }
  } catch (err) {
    // swallow parse errors — we'll just return empty
  }
  return articles;
}

function parseAtom(xml, feed) {
  const articles = [];
  try {
    const doc = parser.parse(xml);
    const atomFeed = doc.feed;
    if (!atomFeed) return articles;

    const entries = Array.isArray(atomFeed.entry) ? atomFeed.entry : (atomFeed.entry ? [atomFeed.entry] : []);

    for (let i = 0; i < Math.min(entries.length, feed.maxItems); i++) {
      const entry = entries[i];

      // Atom links can be objects or arrays
      let link = '';
      if (entry.link) {
        if (Array.isArray(entry.link)) {
          const alt = entry.link.find(l => l['@_rel'] === 'alternate') || entry.link[0];
          link = alt['@_href'] || '';
        } else if (typeof entry.link === 'object') {
          link = entry.link['@_href'] || '';
        } else {
          link = entry.link;
        }
      }

      const summary = entry.summary
        ? (typeof entry.summary === 'object' ? entry.summary['#text'] : entry.summary)
        : (entry.content
          ? (typeof entry.content === 'object' ? entry.content['#text'] : entry.content)
          : '');

      const dateStr = entry.updated || entry.published || null;

      articles.push({
        title: stripHTML(typeof entry.title === 'object' ? entry.title['#text'] : entry.title || ''),
        link: link,
        description: truncate(stripHTML(summary), 280),
        date: dateStr,
        isoDate: safeISODate(dateStr),
        source: feed.name,
        sourceId: feed.id
      });
    }
  } catch (err) {
    // swallow
  }
  return articles;
}

function safeISODate(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fetch all feeds
// ---------------------------------------------------------------------------
async function fetchAllFeeds(context) {
  const errors = [];
  const sourceMeta = {};
  let allArticles = [];

  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      context.log(`Fetching: ${feed.name} (${feed.url})`);
      const xml = await fetchURL(feed.url);
      const articles = feed.format === 'atom'
        ? parseAtom(xml, feed)
        : parseRSS(xml, feed);

      context.log(`  → ${feed.name}: ${articles.length} articles`);

      sourceMeta[feed.id] = {
        id: feed.id,
        name: feed.name,
        website: feed.website || null,
        count: articles.length,
        ok: true
      };

      return articles;
    })
  );

  results.forEach((result, idx) => {
    const feed = FEEDS[idx];
    if (result.status === 'fulfilled') {
      allArticles = allArticles.concat(result.value);
      if (!sourceMeta[feed.id]) {
        sourceMeta[feed.id] = { id: feed.id, name: feed.name, website: feed.website || null, count: 0, ok: true };
      }
    } else {
      context.log.error(`  ✗ ${feed.name}: ${result.reason.message}`);
      errors.push({ source: feed.name, error: result.reason.message });
      sourceMeta[feed.id] = { id: feed.id, name: feed.name, website: feed.website || null, count: 0, ok: false };
    }
  });

  // Sort newest first
  allArticles.sort((a, b) => {
    if (!a.isoDate && !b.isoDate) return 0;
    if (!a.isoDate) return 1;
    if (!b.isoDate) return -1;
    return b.isoDate.localeCompare(a.isoDate);
  });

  return { articles: allArticles, sources: sourceMeta, errors };
}

// ---------------------------------------------------------------------------
// Azure Function entry point
// ---------------------------------------------------------------------------
module.exports = async function (context, req) {
  const source = (req.query.source || '').toLowerCase().trim();
  const forceRefresh = req.query.refresh === 'true';

  // Load cache from Blob Storage (or memory fallback)
  let cache = await readBlobCache(context);

  // Check if cache is still valid
  const cacheAge = cache.fetchedAt ? Date.now() - new Date(cache.fetchedAt).getTime() : Infinity;
  const cacheValid = cacheAge < CACHE_TTL_MS && cache.articles && cache.articles.length > 0;

  if (!cacheValid || forceRefresh) {
    context.log(`Cache ${cacheValid ? 'valid but refresh forced' : 'stale or empty'} — fetching fresh feeds...`);
    try {
      const data = await fetchAllFeeds(context);
      cache = {
        articles: data.articles,
        sources: data.sources,
        fetchedAt: new Date().toISOString(),
        errors: data.errors
      };

      // Persist to Blob Storage
      await writeBlobCache(context, cache);

      context.log(`Fetched ${data.articles.length} articles from ${Object.keys(data.sources).length} sources.`);
    } catch (err) {
      context.log.error('Failed to fetch feeds:', err.message);

      // If we have stale cache, serve it; otherwise return error
      if (!cache.articles || cache.articles.length === 0) {
        context.res = {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ok: false,
            error: 'Unable to fetch news feeds. Please try again later.',
            articles: [],
            sources: {},
            cachedAt: null,
            debug: {
              message: err.message,
              blobConfigured: !!process.env.NEWS_CACHE_CONNECTION
            }
          })
        };
        return;
      }
      context.log('Serving stale cache as fallback.');
    }
  } else {
    context.log(`Serving cached data (${Math.round(cacheAge / 60000)} minutes old, ${cache.articles.length} articles).`);
  }

  // Filter by source if requested
  let articles = cache.articles;
  if (source && source !== 'all') {
    articles = articles.filter(a => a.sourceId === source);
  }

  context.res = {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=900'  // Browser/CDN can cache for 15 mins
    },
    body: JSON.stringify({
      ok: true,
      count: articles.length,
      articles: articles,
      sources: cache.sources,
      cachedAt: cache.fetchedAt || null,
      cacheAgeMinutes: cache.fetchedAt ? Math.round((Date.now() - new Date(cache.fetchedAt).getTime()) / 60000) : null,
      errors: cache.errors && cache.errors.length > 0 ? cache.errors : undefined
    })
  };
};
