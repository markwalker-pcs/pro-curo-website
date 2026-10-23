'use strict';
// Step 7 BUILD: article page, blog index (with paging), RSS feed, sitemap
// entries and llms.txt entries. Everything is regenerated from the article
// records in content/articles/, so a rebuild is always possible with
// `node run.js rebuild`.

const path = require('path');
const fs = require('fs');
const {
  REPO_ROOT, TOOL_ROOT, readText, writeText, escapeHtml, escapeXml, stripTags,
  isoDate, ukDate, rfc822, wordCount
} = require('./util');

const BLOG_DIR = path.join(REPO_ROOT, 'blog');

function tpl(name) {
  return readText(path.join(TOOL_ROOT, 'templates', name));
}

function fill(template, vars) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

function articleUrl(cfg, rec) {
  return `${cfg.siteUrl}${cfg.sectionPath}${rec.year}/${rec.slug}.html`;
}

function imageUrl(cfg, rec) {
  return `${cfg.siteUrl}${cfg.sectionPath}${rec.year}/img/${rec.slug}.png`;
}

function readingTime(html) {
  return Math.max(1, Math.round(wordCount(html) / 220));
}

function sourceTypeLabel(t) {
  return { regulator: 'Regulator', 'primary-document': 'Primary document', 'peer-reviewed': 'Peer reviewed', 'trade-press': 'Trade press', other: '' }[t] || '';
}

function excerpt(rec) {
  return rec.whyThisMatters && rec.whyThisMatters.length ? rec.whyThisMatters[0] : rec.metaDescription;
}

// ---- Article -------------------------------------------------------------
function blogPostingJsonLd(cfg, rec) {
  const obj = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: rec.title,
    description: rec.metaDescription,
    datePublished: rec.datePublished,
    dateModified: rec.dateModified,
    author: { '@type': 'Organization', name: cfg.byline, url: cfg.siteUrl },
    publisher: {
      '@type': 'Organization',
      name: cfg.publisher.name,
      url: cfg.publisher.url,
      logo: { '@type': 'ImageObject', url: cfg.publisher.logo, width: cfg.publisher.logoWidth, height: cfg.publisher.logoHeight }
    },
    image: { '@type': 'ImageObject', url: imageUrl(cfg, rec), width: 1200, height: 627 },
    mainEntityOfPage: { '@type': 'WebPage', '@id': articleUrl(cfg, rec) },
    url: articleUrl(cfg, rec),
    isPartOf: { '@type': 'Blog', name: cfg.seriesName, url: cfg.sectionUrl },
    articleSection: cfg.seriesName,
    keywords: (rec.tags || []).join(', '),
    inLanguage: 'en-GB',
    wordCount: wordCount(rec.bodyHtml),
    citation: (rec.sources || []).map(s => ({ '@type': 'CreativeWork', name: s.title, url: s.url, publisher: { '@type': 'Organization', name: s.publisher } }))
  };
  return JSON.stringify(obj, null, 2).split('\n').map(l => '  ' + l).join('\n');
}

function faqJsonLd(rec) {
  if (!rec.faq || !rec.faq.length) return '';
  const obj = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: rec.faq.map(f => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } }))
  };
  return '  <script type="application/ld+json">\n' + JSON.stringify(obj, null, 2).split('\n').map(l => '  ' + l).join('\n') + '\n  </script>';
}

function relatedArticles(cfg, rec, all, root) {
  const tags = new Set(rec.tags || []);
  const scored = all
    .filter(a => a.slug !== rec.slug)
    .map(a => ({ a, s: (a.format === rec.format ? 1 : 0) + (a.tags || []).filter(t => tags.has(t)).length * 2 }))
    .filter(x => x.s > 0)
    .sort((x, y) => y.s - x.s || String(y.a.datePublished).localeCompare(String(x.a.datePublished)))
    .slice(0, 3)
    .map(x => x.a);
  if (!scored.length) return '';
  return `    <section class="blog-related">
      <div class="container">
        <h2>Related articles</h2>
        <div class="blog-grid">
${scored.map(a => card(cfg, a, root)).join('\n')}
        </div>
      </div>
    </section>`;
}

function card(cfg, rec, root) {
  const f = cfg.formats[rec.format] || { label: rec.format };
  const href = `${root}blog/${rec.year}/${rec.slug}.html`;
  const img = `${root}blog/${rec.year}/img/${rec.slug}.png`;
  return `          <article class="blog-card">
            <a href="${href}" tabindex="-1" aria-hidden="true"><img src="${img}" alt="" width="1200" height="627" loading="lazy"></a>
            <div class="blog-card-body">
              <span class="blog-format blog-format--${rec.format}">${escapeHtml(f.label)}</span>
              <h2><a href="${href}">${escapeHtml(rec.title)}</a></h2>
              <p class="blog-card-excerpt">${escapeHtml(excerpt(rec))}</p>
              <p class="blog-card-meta"><time datetime="${rec.datePublished}">${ukDate(rec.datePublished)}</time> &middot; Issue ${rec.issue}</p>
            </div>
          </article>`;
}

function renderArticle(cfg, rec, all) {
  const root = '../../';
  const f = cfg.formats[rec.format];
  const why = rec.whyThisMatters.map(b => `          <li>${escapeHtml(b)}</li>`).join('\n');
  const sources = rec.sources.map(s => {
    const t = sourceTypeLabel(s.type);
    return `          <li><a href="${escapeHtml(s.url)}" rel="noopener" target="_blank">${escapeHtml(s.title)}</a>, ${escapeHtml(s.publisher)}${t ? `<span class="blog-source-type">${t}</span>` : ''}</li>`;
  }).join('\n');
  const also = rec.alsoThisFortnight && rec.alsoThisFortnight.length
    ? `        <section class="blog-also" aria-labelledby="also-heading">
          <h2 id="also-heading">Also this fortnight</h2>
          <ul>
${rec.alsoThisFortnight.map(a => `            <li><a href="${escapeHtml(a.url)}" rel="noopener" target="_blank">${escapeHtml(a.title)}</a>: ${escapeHtml(a.summary)}</li>`).join('\n')}
          </ul>
        </section>`
    : '';
  const faqHtml = rec.faq && rec.faq.length
    ? rec.faq.map(q => `        <h2>${escapeHtml(q.question)}</h2>\n        <p>${escapeHtml(q.answer)}</p>`).join('\n')
    : '';
  const notAdvice = rec.format === 'B' || rec.format === 'E'
    ? `      <p class="blog-not-advice">${escapeHtml(cfg.notAdviceLine)}</p>`
    : '';
  const body = rec.bodyHtml.split('\n').map(l => (l.trim() ? '        ' + l.trim() : '')).join('\n');
  const vars = {
    GA4: cfg.ga4,
    ROOT: root,
    TITLE: escapeHtml(rec.title),
    META_DESCRIPTION: escapeHtml(rec.metaDescription),
    SERIES_NAME: escapeHtml(cfg.seriesName),
    SECTION_NAME: escapeHtml(cfg.sectionName),
    CANONICAL: articleUrl(cfg, rec),
    FEED_URL: `${cfg.sectionUrl}feed.xml`,
    IMAGE_URL: imageUrl(cfg, rec),
    IMAGE_ALT: escapeHtml(`${cfg.seriesName}: ${rec.title}`),
    PUBLISHED_ISO: rec.datePublished,
    MODIFIED_ISO: rec.dateModified,
    PUBLISHED_UK: ukDate(rec.datePublished),
    REVIEWED_UK: ukDate(rec.dateModified),
    ARTICLE_TAG_META: (rec.tags || []).map(t => `  <meta property="article:tag" content="${escapeHtml(t)}">`).join('\n'),
    JSONLD: blogPostingJsonLd(cfg, rec),
    FAQ_JSONLD: faqJsonLd(rec),
    ISSUE: rec.issue,
    FORMAT_CODE: rec.format,
    FORMAT_LABEL: escapeHtml(f.label),
    BYLINE: escapeHtml(cfg.byline),
    REVIEWER: escapeHtml(cfg.reviewer),
    REVIEWER_ROLE: escapeHtml(cfg.reviewerRole),
    READING_TIME: readingTime(rec.bodyHtml),
    WHY_BULLETS: why,
    NOT_ADVICE: notAdvice,
    BODY: body,
    ALSO_THIS_FORTNIGHT: also,
    FAQ_HTML: faqHtml,
    SOURCES: sources,
    DISCLOSURE: escapeHtml(cfg.disclosure),
    TAGS: (rec.tags || []).map(t => `<span class="blog-tag">${escapeHtml(t)}</span>`).join(' '),
    RELATED: relatedArticles(cfg, rec, all, root),
    DEMO_LABEL: escapeHtml(cfg.cta.demoVideoLabel),
    RHYS_LABEL: escapeHtml(cfg.cta.rhysLabel),
    YEAR: new Date(rec.dateModified).getUTCFullYear()
  };
  return fill(tpl('article.html'), vars).replace(/\n{3,}/g, '\n\n');
}

// ---- Index with paging ---------------------------------------------------
function renderIndexPage(cfg, pageItems, pageNo, pageCount, all) {
  const isFirst = pageNo === 1;
  const root = isFirst ? '../' : '../../';
  const pageUrl = n => (n === 1 ? cfg.sectionUrl : `${cfg.sectionUrl}page/${n}.html`);
  const pageHref = n => (n === 1 ? `${root}blog/` : `${root}blog/page/${n}.html`);
  const cards = pageItems.map(a => card(cfg, a, root)).join('\n');
  let pagination = '';
  if (pageCount > 1) {
    const parts = [];
    if (pageNo > 1) parts.push(`<a href="${pageHref(pageNo - 1)}" rel="prev">Newer</a>`);
    for (let n = 1; n <= pageCount; n++) parts.push(n === pageNo ? `<span class="current">${n}</span>` : `<a href="${pageHref(n)}">${n}</a>`);
    if (pageNo < pageCount) parts.push(`<a href="${pageHref(pageNo + 1)}" rel="next">Older</a>`);
    pagination = `      <nav class="blog-pagination" aria-label="Pages">\n        ${parts.join('\n        ')}\n      </nav>`;
  }
  const prevNext = [];
  if (pageNo > 1) prevNext.push(`  <link rel="prev" href="${pageUrl(pageNo - 1)}">`);
  if (pageNo < pageCount) prevNext.push(`  <link rel="next" href="${pageUrl(pageNo + 1)}">`);
  const signup = cfg.mailerlite.formUrl
    ? { url: cfg.mailerlite.formUrl, label: 'Sign up', attrs: ' target="_blank" rel="noopener"' }
    : { url: `${root}contact.html`, label: 'Ask to be added', attrs: '' };
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: cfg.seriesName,
    description: `${cfg.seriesName}, ${cfg.seriesTagline}.`,
    url: cfg.sectionUrl,
    publisher: { '@type': 'Organization', name: cfg.publisher.name, url: cfg.publisher.url, logo: { '@type': 'ImageObject', url: cfg.publisher.logo } },
    inLanguage: 'en-GB',
    blogPost: pageItems.map(a => ({ '@type': 'BlogPosting', headline: a.title, url: articleUrl(cfg, a), datePublished: a.datePublished }))
  };
  const vars = {
    GA4: cfg.ga4,
    ROOT: root,
    PAGE_TITLE: escapeHtml(isFirst ? `${cfg.seriesName} | Pro-curo ${cfg.sectionName}` : `${cfg.seriesName}, page ${pageNo} | Pro-curo ${cfg.sectionName}`),
    META_DESCRIPTION: escapeHtml(`${cfg.seriesName}, ${cfg.seriesTagline}: what the fortnight's news means for people who look after human tissue and biological sample collections, with links to the primary sources.`),
    SERIES_NAME: escapeHtml(cfg.seriesName),
    SECTION_NAME: escapeHtml(cfg.sectionName),
    SERIES_TAGLINE_SENTENCE: escapeHtml(`${cfg.seriesTagline.charAt(0).toUpperCase()}${cfg.seriesTagline.slice(1)}. Every two weeks we pick the stories that matter to people who look after samples and explain what they mean in practice, with a link to every source.`),
    CANONICAL: pageUrl(pageNo),
    FEED_URL: `${cfg.sectionUrl}feed.xml`,
    PREV_NEXT_LINKS: prevNext.join('\n'),
    OG_IMAGE: all.length ? imageUrl(cfg, all[0]) : cfg.publisher.logo,
    JSONLD: JSON.stringify(jsonld, null, 2).split('\n').map(l => '  ' + l).join('\n'),
    EMPTY_NOTE: all.length ? '' : `      <p class="blog-empty">The first issue is on its way. Subscribe to the <a href="${root}blog/feed.xml">RSS feed</a> to be told when it lands.</p>`,
    CARDS: cards,
    PAGINATION: pagination,
    SIGNUP_URL: signup.url,
    SIGNUP_LABEL: signup.label,
    SIGNUP_ATTRS: signup.attrs,
    DEMO_LABEL: escapeHtml(cfg.cta.demoVideoLabel),
    RHYS_LABEL: escapeHtml(cfg.cta.rhysLabel),
    YEAR: new Date().getUTCFullYear()
  };
  return fill(tpl('index.html'), vars).replace(/\n{3,}/g, '\n\n');
}

// ---- RSS 2.0 -------------------------------------------------------------
function renderFeed(cfg, all) {
  const items = all.map(a => {
    const url = articleUrl(cfg, a);
    const img = imageUrl(cfg, a);
    const f = cfg.formats[a.format] || { label: a.format };
    const desc = a.whyThisMatters.join(' ');
    return `    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${rfc822(a.datePublished)}</pubDate>
      <description>${escapeXml(desc)}</description>
      <category>${escapeXml(f.label)}</category>
${(a.tags || []).map(t => `      <category>${escapeXml(t)}</category>`).join('\n')}
      <enclosure url="${escapeXml(img)}" length="${a.imageBytes || 0}" type="image/png"/>
      <media:content url="${escapeXml(img)}" medium="image" type="image/png" width="1200" height="627"/>
    </item>`;
  }).join('\n');
  const last = all.length ? rfc822(all[0].dateModified) : rfc822(new Date());
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${escapeXml(cfg.seriesName)}</title>
    <link>${escapeXml(cfg.sectionUrl)}</link>
    <description>${escapeXml(`${cfg.seriesName}, ${cfg.seriesTagline}, from Pro-curo Software Limited.`)}</description>
    <language>en-gb</language>
    <lastBuildDate>${last}</lastBuildDate>
    <atom:link href="${escapeXml(cfg.sectionUrl + 'feed.xml')}" rel="self" type="application/rss+xml"/>
    <image>
      <url>${escapeXml(cfg.publisher.logo)}</url>
      <title>${escapeXml(cfg.seriesName)}</title>
      <link>${escapeXml(cfg.sectionUrl)}</link>
    </image>
${items}
  </channel>
</rss>
`;
}

// ---- Sitemap and llms.txt ------------------------------------------------
const SM_START = '  <!-- blog:start (generated by tools/blog, do not hand-edit) -->';
const SM_END = '  <!-- blog:end -->';

function updateSitemap(cfg, all) {
  const file = path.join(REPO_ROOT, 'sitemap.xml');
  let xml = readText(file);
  const today = isoDate(new Date());
  const entries = [`  <url>\n    <loc>${escapeXml(cfg.sectionUrl)}</loc>\n    <lastmod>${all.length ? isoDate(all[0].dateModified) : today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`];
  for (const a of all) {
    entries.push(`  <url>\n    <loc>${escapeXml(articleUrl(cfg, a))}</loc>\n    <lastmod>${isoDate(a.dateModified)}</lastmod>\n    <changefreq>yearly</changefreq>\n    <priority>0.6</priority>\n  </url>`);
  }
  const block = `${SM_START}\n${entries.join('\n')}\n${SM_END}`;
  if (xml.includes(SM_START) && xml.includes(SM_END)) {
    xml = xml.replace(new RegExp(escapeRegExp(SM_START) + '[\\s\\S]*?' + escapeRegExp(SM_END)), block);
  } else {
    xml = xml.replace(/\n?<\/urlset>\s*$/, `\n${block}\n</urlset>\n`);
  }
  writeText(file, xml);
}

const LL_START = '<!-- blog:start (generated by tools/blog, do not hand-edit) -->';
const LL_END = '<!-- blog:end -->';

function updateLlms(cfg, all) {
  const file = path.join(REPO_ROOT, 'llms.txt');
  let txt = readText(file);
  const lines = [`## ${cfg.sectionName}: ${cfg.seriesName}`, '', `${cfg.seriesName} is ${cfg.seriesTagline}: every two weeks one reviewed article on what the sector's news means for people who look after human tissue and biological sample collections. Index: ${cfg.sectionUrl} RSS: ${cfg.sectionUrl}feed.xml`, ''];
  for (const a of all) lines.push(`- ${a.title} (${ukDate(a.datePublished)}): ${articleUrl(cfg, a)}`);
  const block = `${LL_START}\n${lines.join('\n')}\n${LL_END}`;
  if (txt.includes(LL_START) && txt.includes(LL_END)) {
    txt = txt.replace(new RegExp(escapeRegExp(LL_START) + '[\\s\\S]*?' + escapeRegExp(LL_END)), block);
  } else {
    txt = txt.replace(/\s*$/, '') + `\n\n${block}\n`;
  }
  writeText(file, txt);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---- Orchestration -------------------------------------------------------
// Writes every blog page from the records. Returns the list of files written
// (repo-relative) so the caller can stage exactly those.
function buildAll(cfg, all) {
  const written = [];
  const rel = p => path.relative(REPO_ROOT, p).split(path.sep).join('/');

  for (const rec of all) {
    const file = path.join(BLOG_DIR, String(rec.year), `${rec.slug}.html`);
    writeText(file, renderArticle(cfg, rec, all));
    written.push(rel(file));
  }

  const pageCount = Math.max(1, Math.ceil(all.length / cfg.pageSize));
  for (let n = 1; n <= pageCount; n++) {
    const items = all.slice((n - 1) * cfg.pageSize, n * cfg.pageSize);
    const file = n === 1 ? path.join(BLOG_DIR, 'index.html') : path.join(BLOG_DIR, 'page', `${n}.html`);
    writeText(file, renderIndexPage(cfg, items, n, pageCount, all));
    written.push(rel(file));
  }
  // Remove stale paging files beyond the current count.
  const pageDir = path.join(BLOG_DIR, 'page');
  if (fs.existsSync(pageDir)) {
    for (const f of fs.readdirSync(pageDir)) {
      const n = parseInt(f, 10);
      if (f.endsWith('.html') && (!n || n > pageCount)) fs.unlinkSync(path.join(pageDir, f));
    }
  }

  const feedFile = path.join(BLOG_DIR, 'feed.xml');
  writeText(feedFile, renderFeed(cfg, all));
  written.push(rel(feedFile));

  updateSitemap(cfg, all);
  written.push('sitemap.xml');
  updateLlms(cfg, all);
  written.push('llms.txt');
  return written;
}

module.exports = { buildAll, renderArticle, renderIndexPage, renderFeed, updateSitemap, updateLlms, articleUrl, imageUrl, BLOG_DIR, fill };
