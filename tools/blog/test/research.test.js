'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { findPdfAttachments, extractPdfText, readAttachments, applyResearchBudget, resolveLimits, DEFAULT_LIMITS, MAX_CHARS } = require('../lib/research');

const fixture = name => path.join(__dirname, 'fixtures', name);
const pageUrl = 'https://www.gov.uk/government/publications/human-tissue-authority-annual-report-and-accounts-2025-to-2026';
const html = fs.readFileSync(fixture('govuk-publication.html'), 'utf8');
const pdf = fs.readFileSync(fixture('sample-report.pdf'));

test('attachment discovery finds GOV.UK PDF attachments, English first, two at most', () => {
  const found = findPdfAttachments(html, pageUrl);
  assert.equal(found.length, 2);
  assert.equal(found[0].url, 'https://assets.publishing.service.gov.uk/media/68f0c0ffd4a0a5e7a1b2c3d4/HTA_Annual_Report_and_Accounts_2025-26.pdf');
  assert.equal(found[0].title, 'Human Tissue Authority annual report and accounts 2025 to 2026');
  assert.equal(found[0].govuk, true);
  // The Welsh file is skipped; the summary comes second and its entity is decoded.
  assert.equal(found[1].url, 'https://assets.publishing.service.gov.uk/media/68f0c0ffd4a0a5e7a1b2c3d6/HTA_Annual_Report_2025-26_summary.pdf');
  assert.equal(found[1].title, 'Annual report 2025 to 2026: summary & key figures');
  assert.ok(found.every(a => !/Welsh/i.test(a.url)));
});

test('attachment discovery de-duplicates, resolves relative links and strips query strings', () => {
  const all = findPdfAttachments(html, pageUrl, { max: 10 });
  const urls = all.map(a => a.url);
  assert.equal(new Set(urls).size, urls.length);
  assert.ok(urls.includes('https://www.gov.uk/government/publications/hta-strategy.pdf'));
  // Non-attachment links in the body come after the gem-c-attachment ones.
  assert.ok(urls.indexOf('https://www.gov.uk/government/publications/hta-strategy.pdf') > urls.indexOf(all[0].url));
  assert.equal(findPdfAttachments('<p>No documents here <a href="/x.html">page</a></p>', pageUrl).length, 0);
});

test('a web accessible copy of the same document is not read twice', () => {
  const twice = '<div class="gem-c-attachment"><a href="/media/1/report.pdf">HTA annual report and accounts: 2025 to 2026</a></div>' +
    '<div class="gem-c-attachment"><a href="/media/2/report-web-accessible.pdf">HTA annual report and accounts: 2025 to 2026 (web accessible)</a></div>' +
    '<div class="gem-c-attachment"><a href="/media/3/plan.pdf">Business plan 2026 to 2027</a></div>';
  const found = findPdfAttachments(twice, pageUrl);
  assert.deepEqual(found.map(a => a.url), ['https://www.gov.uk/media/1/report.pdf', 'https://www.gov.uk/media/3/plan.pdf']);
});

test('a Welsh-only page still yields the Welsh file rather than nothing', () => {
  const welshOnly = '<div class="gem-c-attachment"><a href="/media/1/report_Welsh.pdf">Adroddiad (Welsh)</a></div>';
  const found = findPdfAttachments(welshOnly, pageUrl);
  assert.equal(found.length, 1);
  assert.equal(found[0].url, 'https://www.gov.uk/media/1/report_Welsh.pdf');
});

test('PDF text extraction reads the fixture and respects the character cap', async () => {
  const full = await extractPdfText(pdf);
  assert.equal(full.totalPages, 2);
  assert.equal(full.pages, 2);
  assert.equal(full.truncated, false);
  assert.ok(full.text.includes('Line 1: the Authority inspected licensed establishments during the year.'));
  assert.ok(full.text.includes('Line 30:'));
  assert.ok(full.text.length <= MAX_CHARS);

  const capped = await extractPdfText(pdf, { maxChars: 500 });
  assert.ok(capped.text.length <= 500, `got ${capped.text.length}`);
  assert.equal(capped.truncated, true);
  assert.equal(capped.pages, 1);
  assert.ok(capped.text.startsWith('Line 1:'));
});

test('readAttachments appends labelled attachment text to the record and reports what was read', async () => {
  const rec = { text: 'Landing page text.', fetched: true, note: '' };
  const attachments = findPdfAttachments(html, pageUrl);
  const requested = [];
  const read = await readAttachments(rec, attachments, 'Pro-curo-NewsBot/test', {
    fetchBytes: async url => { requested.push(url); return pdf; },
    robotsAllows: async () => true
  });
  assert.deepEqual(requested, attachments.map(a => a.url));
  assert.equal(read.length, 2);
  assert.equal(read[0].title, attachments[0].title);
  assert.equal(read[0].totalPages, 2);
  assert.ok(rec.text.startsWith('Landing page text.'));
  assert.ok(rec.text.includes(`--- ATTACHMENT: ${attachments[0].title} (${attachments[0].url}) pages 1 to 2 of 2 ---`));
  assert.ok(rec.text.includes('Line 30:'));
});

test('readAttachments honours robots.txt and survives a failed download', async () => {
  const rec = { text: 'Landing page text.', fetched: true, note: '' };
  const attachments = findPdfAttachments(html, pageUrl);
  const read = await readAttachments(rec, attachments, 'Pro-curo-NewsBot/test', {
    fetchBytes: async () => { throw new Error('HTTP 503'); },
    robotsAllows: async url => !url.endsWith('summary.pdf')
  });
  assert.equal(read.length, 0);
  assert.equal(rec.text, 'Landing page text.');
});

test('attachment and page caps come from the config and default to a full report read', () => {
  assert.equal(DEFAULT_LIMITS.attachmentChars, 250000);
  assert.ok(DEFAULT_LIMITS.attachmentChars >= 84 * 1500, 'an 84-page report must fit');
  assert.deepEqual(resolveLimits(undefined), DEFAULT_LIMITS);
  assert.equal(resolveLimits({ attachmentChars: 1000 }).attachmentChars, 1000);
  assert.equal(resolveLimits({ attachmentChars: 'x', pageChars: -5 }).pageChars, DEFAULT_LIMITS.pageChars);
});

test('readAttachments respects a per-attachment cap passed through opts.limits', async () => {
  const rec = { text: '', fetched: true, note: '' };
  const attachments = findPdfAttachments(html, pageUrl).slice(0, 1);
  const read = await readAttachments(rec, attachments, 'Pro-curo-NewsBot/test', {
    fetchBytes: async () => pdf,
    robotsAllows: async () => true,
    limits: { attachmentChars: 600 }
  });
  assert.equal(read.length, 1);
  assert.equal(read[0].truncated, true);
  assert.ok(read[0].chars <= 600);
});

test('the research budget trims extras first, then the previous edition, and never the lead before them', () => {
  const mk = (title, n, extra = {}) => ({ title, link: title, fetched: true, note: '', text: 'x'.repeat(n), ...extra });
  const researched = [mk('lead', 5000), mk('prev', 5000, { isPreviousEdition: true }), mk('extra', 5000, { isExtra: true })];
  const r = applyResearchBudget(researched, { totalChars: 12000 });
  assert.deepEqual(r.trimmed, ['extra']);
  assert.equal(researched[0].text.length, 5000);
  assert.equal(researched[1].text.length, 5000);
  assert.ok(researched[2].text.startsWith('x'.repeat(2000)));
  assert.ok(researched[2].text.includes('[Text trimmed here'));
  assert.ok(researched[2].note.includes('research budget'));
  assert.equal(researched[2].trimmed, true);

  const tight = [mk('lead', 5000), mk('prev', 5000, { isPreviousEdition: true })];
  const t = applyResearchBudget(tight, { totalChars: 6000 });
  assert.deepEqual(t.trimmed, ['prev']);
  assert.equal(tight[0].text.length, 5000);
});

test('the research budget leaves a run under the cap untouched', () => {
  const researched = [{ title: 'a', text: 'abc', note: '' }, { title: 'b', text: 'def', note: '' }];
  const r = applyResearchBudget(researched, { totalChars: 600000 });
  assert.deepEqual(r.trimmed, []);
  assert.equal(r.total, 6);
  assert.equal(researched[0].text, 'abc');
  assert.equal(researched[0].trimmed, undefined);
});
