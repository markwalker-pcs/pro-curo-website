'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { lintDraft, lintText } = require('../lib/lint');
const { loadConfig } = require('../lib/util');

const cfg = loadConfig();
const good = () => JSON.parse(JSON.stringify(require(path.join(__dirname, 'fixtures', 'mock-draft.json'))));

test('the mock draft passes lint as format A', () => {
  assert.deepEqual(lintDraft(good(), cfg, { format: 'A', bannedNames: [] }), []);
});

test('an em dash anywhere fails', () => {
  const d = good();
  d.social.emailPreheader = 'A line \u2014 with an em dash';
  const p = lintDraft(d, cfg, { format: 'A', bannedNames: [] });
  assert.ok(p.some(x => x.includes('em dash')), p.join('\n'));
  assert.ok(lintText('text \u2014 here', { bannedNames: [] }).length === 1);
});

test('a banned name supplied through the variable fails, in any field', () => {
  const d = good();
  d.bodyHtml += '<p>A line that names Fixture Competitor Ltd by accident.</p>';
  const p = lintDraft(d, cfg, { format: 'A', bannedNames: ['Fixture Competitor Ltd'] });
  assert.ok(p.some(x => x.includes('banned name')), p.join('\n'));
  // The same name in the social copy is also caught.
  const d2 = good();
  d2.social.linkedin = d2.social.linkedin.replace('The Human Tissue Authority', 'Fixture Competitor Ltd');
  assert.ok(lintDraft(d2, cfg, { format: 'A', bannedNames: ['fixture competitor ltd'] }).some(x => x.includes('banned name')));
});

test('a price fails', () => {
  const d = good();
  d.bodyHtml += '<p>Licences start at £1,200 a year.</p>';
  const p = lintDraft(d, cfg, { format: 'A', bannedNames: [] });
  assert.ok(p.some(x => x.includes('price')), p.join('\n'));
});

test('a 70-character title fails', () => {
  const d = good();
  d.title = 'Seventy characters: ' + 'y'.repeat(50);
  assert.equal(d.title.length, 70);
  const p = lintDraft(d, cfg, { format: 'A', bannedNames: [] });
  assert.ok(p.some(x => x.startsWith('title:')), p.join('\n'));
});

test('a meta description over 155 characters fails', () => {
  const d = good();
  d.metaDescription = 'x'.repeat(156);
  assert.ok(lintDraft(d, cfg, { format: 'A', bannedNames: [] }).some(x => x.startsWith('metaDescription:')));
});

test('US spellings fail, but third-party titles are exempt', () => {
  const d = good();
  d.bodyHtml += '<p>We should analyze the color of the center.</p>';
  const p = lintDraft(d, cfg, { format: 'A', bannedNames: [] });
  assert.ok(p.filter(x => x.includes('US spelling')).length >= 3, p.join('\n'));
  // "Tumor" in a source title (from The Scientist) is already in the fixture and passes.
  assert.deepEqual(lintDraft(good(), cfg, { format: 'A', bannedNames: [] }), []);
});

test('"program" is flagged unless it is about software', () => {
  const d = good();
  d.bodyHtml += '<p>The training program starts in May.</p>';
  assert.ok(lintDraft(d, cfg, { format: 'A', bannedNames: [] }).some(x => x.includes('"program"')));
  const d2 = good();
  d2.bodyHtml += '<p>The software program exports a CSV.</p>';
  assert.ok(!lintDraft(d2, cfg, { format: 'A', bannedNames: [] }).some(x => x.includes('"program"')));
});

test('a listed source that is not linked in the body fails', () => {
  const d = good();
  d.sources.push({ title: 'Unlinked', publisher: 'Nobody', url: 'https://example.org/unlinked', type: 'other' });
  assert.ok(lintDraft(d, cfg, { format: 'A', bannedNames: [] }).some(x => x.includes('not linked')));
});

test('more than one Pro-curo mention in the body fails', () => {
  const d = good();
  d.bodyHtml += '<p>Pro-curo also does this. Pro-curo does that.</p>';
  assert.ok(lintDraft(d, cfg, { format: 'A', bannedNames: [] }).some(x => x.includes('Pro-curo mentions')));
});

test('banned hype words from EDITORIAL.md fail', () => {
  const d = good();
  d.whyThisMatters[0] = 'A game-changing year for the regulator.';
  assert.ok(lintDraft(d, cfg, { format: 'A', bannedNames: [] }).some(x => x.includes('banned word')));
});

test('an exclamation mark in the body fails', () => {
  const d = good();
  d.bodyHtml += '<p>Read it now!</p>';
  assert.ok(lintDraft(d, cfg, { format: 'A', bannedNames: [] }).some(x => x.includes('exclamation')));
});

test('a body far outside the format length fails', () => {
  const d = good();
  assert.ok(lintDraft(d, cfg, { format: 'C', bannedNames: [] }).some(x => x.includes('below')));
});

test('FAQ entries are only allowed on format E', () => {
  const d = good();
  d.faq = [{ question: 'Q?', answer: 'A.' }];
  assert.ok(lintDraft(d, cfg, { format: 'A', bannedNames: [] }).some(x => x.startsWith('faq:')));
});
