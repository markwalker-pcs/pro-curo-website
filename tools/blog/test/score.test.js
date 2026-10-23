'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadTaxonomy, scoreItem, scoreSnapshot } = require('../lib/score');
const { coveredLinks, recordIssue } = require('../lib/state');
const { loadConfig, isoWeek } = require('../lib/util');
const { chooseFormat } = require('../lib/choose');

const cfg = loadConfig();
const tax = loadTaxonomy();
const snap = require(path.join(__dirname, 'fixtures', 'snapshot-2026-10-23.json'));

test('regulator items with taxonomy keywords score above the threshold', () => {
  const { score } = scoreItem({ title: 'Human Tissue Authority annual report', description: 'inspection findings', sourceId: 'hta', category: 'regulator' }, tax);
  assert.ok(score >= cfg.scoring.threshold, String(score));
});

test('off-topic science scores below the threshold', () => {
  const { score } = scoreItem({ title: 'Horse genetics then and now', description: 'A profile.', sourceId: 'the-scientist', category: 'science' }, tax);
  assert.ok(score < cfg.scoring.threshold, String(score));
});

test('category weight is used when the source has no weight', () => {
  const { score } = scoreItem({ title: 'Nothing', description: '', sourceId: 'new-source', category: 'regulator' }, tax);
  assert.equal(score, tax.categoryWeights.regulator);
});

test('the fixture snapshot shortlists the HTA report first', () => {
  const { shortlist } = scoreSnapshot(snap.items, cfg, tax);
  assert.ok(shortlist.length >= 3);
  assert.equal(shortlist[0].sourceId, 'hta');
});

test('repeat detection: a story covered within six issues is never chosen again', () => {
  const first = scoreSnapshot(snap.items, cfg, tax);
  const lead = first.shortlist[0];
  let state = { issue: 0, issues: [] };
  state = recordIssue(state, { issue: 1, format: 'A', slug: 'x', coveredLinks: [lead.link], status: 'proposed' });
  const covered = coveredLinks(state, cfg.repeatWindowIssues);
  const second = scoreSnapshot(snap.items, cfg, tax, covered);
  assert.ok(!second.scored.some(s => s.link === lead.link));
  assert.notEqual(second.shortlist[0] && second.shortlist[0].link, lead.link);
});

test('repeat detection expires after the window', () => {
  let state = { issue: 0, issues: [] };
  for (let i = 1; i <= 7; i++) state = recordIssue(state, { issue: i, format: 'A', slug: 's' + i, coveredLinks: ['https://example.org/' + i], status: 'proposed' });
  const covered = coveredLinks(state, 6);
  assert.ok(!covered.has('https://example.org/1'));
  assert.ok(covered.has('https://example.org/2'));
  assert.ok(covered.has('https://example.org/7'));
});

test('the quiet-fortnight fixture has too few passing items', () => {
  const thin = require(path.join(__dirname, 'fixtures', 'snapshot-thin.json'));
  const { passing } = scoreSnapshot(thin.items, cfg, tax);
  assert.ok(passing.length < cfg.scoring.minItems, String(passing.length));
});

test('ISO week parity gate: an odd week skips without force', () => {
  // 2026-10-26 is a Monday in ISO week 44 (even); 2026-11-02 is week 45 (odd).
  assert.equal(isoWeek(new Date('2026-10-26T06:00:00Z')), 44);
  assert.equal(isoWeek(new Date('2026-11-02T06:00:00Z')), 45);
  assert.equal(isoWeek(new Date('2026-11-16T06:00:00Z')), 47);
  const allows = d => (cfg.weekParity === 'even' ? isoWeek(d) % 2 === 0 : isoWeek(d) % 2 === 1);
  assert.equal(allows(new Date('2026-10-26T06:00:00Z')), true);
  assert.equal(allows(new Date('2026-11-02T06:00:00Z')), false);
});

test('chooseFormat on the fixture with the mock ranking gives C (top story clear with a lesson)', () => {
  const { shortlist } = scoreSnapshot(snap.items, cfg, tax);
  const ranking = require(path.join(__dirname, 'fixtures', 'mock-ranking.json'));
  const byIndex = new Map(ranking.ranked.map(r => [r.index, r]));
  const ranked = shortlist.map((it, i) => ({ ...it, finalScore: byIndex.get(i).score, isRegulatoryChange: byIndex.get(i).isRegulatoryChange, hasOperationalLesson: byIndex.get(i).hasOperationalLesson }))
    .sort((a, b) => b.finalScore - a.finalScore);
  assert.equal(chooseFormat(ranked, { issue: 0 }, cfg, tax).format, 'C');
});
