'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { XMLParser, XMLValidator } = require('fast-xml-parser');
const { renderArticle, renderIndexPage, renderFeed } = require('../lib/build');
const { layoutTitle, buildSvg } = require('../lib/card');
const { socialPack, utmLink } = require('../lib/social');
const { loadConfig } = require('../lib/util');
const { parseRobots, allowedByRules, htmlToText } = require('../lib/research');

const cfg = loadConfig();
const draft = require(path.join(__dirname, 'fixtures', 'mock-draft.json'));
const rec = { ...draft, format: 'A', issue: 1, year: 2026, datePublished: '2026-10-26T06:00:00.000Z', dateModified: '2026-10-26T06:00:00.000Z', imageBytes: 1000 };

function divBalanced(html) {
  return (html.match(/<div/g) || []).length === (html.match(/<\/div>/g) || []).length;
}

test('article page carries the required plumbing', () => {
  const html = renderArticle(cfg, rec, [rec]);
  assert.ok(html.trim().endsWith('</html>'));
  assert.ok(divBalanced(html));
  assert.ok(html.includes(`gtag/js?id=${cfg.ga4}`));
  assert.ok(html.includes('src="../../js/main.js"'));
  assert.ok(html.includes('data-rhys-open'));
  assert.ok(html.includes('href="../../blog/" class="active">Blog</a>'));
  assert.ok(html.includes('<link rel="canonical" href="https://www.pro-curo.com/blog/2026/hta-annual-report-2025-26-and-cell-culture-contamination.html">'));
  assert.ok(html.includes('<link rel="alternate" type="application/rss+xml"'));
  assert.ok(html.includes('property="og:type" content="article"'));
  assert.ok(html.includes('name="twitter:card"'));
  assert.ok(html.includes('"@type": "BlogPosting"'));
  assert.ok(html.includes('"name": "Pro-curo Software Limited"'));
  assert.ok(html.includes('Reviewed by Mark Walker'));
  assert.ok(html.includes(cfg.disclosure));
  assert.ok(!html.includes('FAQPage'));
  assert.ok(!html.includes('\u2014'));
  assert.ok(!html.includes('{{'), 'no unfilled placeholders');
});

test('FAQPage JSON-LD appears only on format E', () => {
  const e = { ...rec, format: 'E', faq: [{ question: 'Does the EU Tissue Directive still apply in Great Britain?', answer: 'No.' }] };
  assert.ok(renderArticle(cfg, e, [e]).includes('"@type": "FAQPage"'));
});

test('index page renders cards, paging and the sign-up fallback', () => {
  const many = Array.from({ length: 15 }, (_, i) => ({ ...rec, slug: `${rec.slug}-${i}`, title: `Issue ${i + 1}`, issue: i + 1 }));
  const p1 = renderIndexPage(cfg, many.slice(0, 12), 1, 2, many);
  assert.ok(p1.trim().endsWith('</html>') && divBalanced(p1));
  assert.ok(p1.includes('class="blog-pagination"'));
  assert.ok(p1.includes('href="../blog/page/2.html"'));
  assert.ok(p1.includes('<link rel="next" href="https://www.pro-curo.com/blog/page/2.html">'));
  assert.ok(p1.includes('href="../contact.html" class="btn btn-primary">Ask to be added'));
  assert.ok((p1.match(/class="blog-card"/g) || []).length === 12);
  const p2 = renderIndexPage(cfg, many.slice(12), 2, 2, many);
  assert.ok(p2.includes('href="../../blog/"') && p2.includes('src="../../js/main.js"'));
  assert.ok(!p1.includes('{{') && !p2.includes('{{'));
});

test('empty index renders without cards', () => {
  const p = renderIndexPage(cfg, [], 1, 1, []);
  assert.ok(p.includes('blog-empty'));
  assert.ok(!p.includes('{{'));
});

test('feed is well-formed RSS 2.0 with a stable permalink guid', () => {
  const xml = renderFeed(cfg, [rec]);
  assert.equal(XMLValidator.validate(xml), true);
  const doc = new XMLParser({ ignoreAttributes: false }).parse(xml);
  assert.equal(doc.rss['@_version'], '2.0');
  const item = doc.rss.channel.item;
  assert.equal(item.guid['#text'], 'https://www.pro-curo.com/blog/2026/hta-annual-report-2025-26-and-cell-culture-contamination.html');
  assert.equal(item.guid['@_isPermaLink'], 'true');
  assert.ok(item.pubDate.endsWith('GMT'));
  assert.equal(item.enclosure['@_type'], 'image/png');
  assert.ok(item['media:content']['@_url'].endsWith('.png'));
});

test('social card wraps long titles into at most four lines', () => {
  const l = layoutTitle('A deliberately long title about human tissue licensing standards and the inspection of establishments in 2026');
  assert.ok(l.lines.length <= 4);
  const svg = buildSvg(cfg, { title: rec.title, formatLabel: 'Briefing', issue: 1, dateUk: '26 October 2026' });
  assert.ok(svg.includes('BRIEFING') && svg.includes('Issue 1') && !svg.includes('{{'));
});

test('social pack carries UTM-tagged links per channel', () => {
  const md = socialPack(cfg, rec);
  assert.ok(md.includes('utm_source=linkedin&utm_medium=social&utm_campaign=sample-matters-1'));
  assert.ok(md.includes('utm_source=facebook&utm_medium=social'));
  assert.ok(md.includes('utm_source=mailerlite&utm_medium=email'));
  assert.ok(md.includes(cfg.postingTimes.linkedin));
  assert.ok(md.includes('#HumanTissueAct'));
  assert.ok(utmLink(cfg, rec, 'x', 'y').includes('utm_campaign=sample-matters-1'));
});

test('robots.txt parsing honours our token and wildcard groups', () => {
  const rules = parseRobots('User-agent: *\nDisallow: /private/\nAllow: /private/ok\n\nUser-agent: Pro-curo-NewsBot\nDisallow: /nobots/', 'Pro-curo-NewsBot');
  assert.equal(allowedByRules(rules, '/nobots/page'), false);
  assert.equal(allowedByRules(rules, '/private/x'), true);
  const star = parseRobots('User-agent: *\nDisallow: /private/\nAllow: /private/ok', 'Pro-curo-NewsBot');
  assert.equal(allowedByRules(star, '/private/x'), false);
  assert.equal(allowedByRules(star, '/private/ok/1'), true);
  assert.equal(allowedByRules(star, '/public'), true);
});

test('htmlToText strips chrome and keeps the main text', () => {
  const t = htmlToText('<html><head><script>x()</script></head><body><nav>menu</nav><main><h1>Title</h1><p>Body &amp; more.</p></main><footer>f</footer></body></html>');
  assert.ok(t.includes('Title') && t.includes('Body & more.'));
  assert.ok(!t.includes('menu') && !t.includes('x()'));
});
