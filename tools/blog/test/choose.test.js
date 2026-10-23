'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { chooseFormat, selectStories } = require('../lib/choose');
const { loadConfig } = require('../lib/util');
const { loadTaxonomy } = require('../lib/score');

const cfg = loadConfig();
const tax = loadTaxonomy();

function item(over) {
  return { title: 't', link: 'https://example.org/' + Math.random(), source: 's', sourceId: 'lab-news', rulesScore: 8, finalScore: 5, isRegulatoryChange: false, hasOperationalLesson: false, ...over };
}

test('a qualifying regulator item forces format B', () => {
  const ranked = [item({ finalScore: 6 }), item({ sourceId: 'hta', finalScore: 5, isRegulatoryChange: true, rulesScore: 20 })];
  const c = chooseFormat(ranked, { issue: 0 }, cfg, tax);
  assert.equal(c.format, 'B');
  assert.equal(c.lead.sourceId, 'hta');
  assert.equal(c.issue, 1);
});

test('a regulator item that is not a change does not force B', () => {
  const ranked = [item({ sourceId: 'hta', finalScore: 9, isRegulatoryChange: false }), item({ finalScore: 8 })];
  assert.equal(chooseFormat(ranked, { issue: 0 }, cfg, tax).format, 'A');
});

test('a regulatory change from a non-regulator source does not force B', () => {
  const ranked = [item({ sourceId: 'the-scientist', finalScore: 9, isRegulatoryChange: true }), item({ finalScore: 8 })];
  assert.equal(chooseFormat(ranked, { issue: 0 }, cfg, tax).format, 'A');
});

test('a regulatory item below the threshold does not force B', () => {
  const ranked = [item({ sourceId: 'hta', finalScore: 2, rulesScore: 2, isRegulatoryChange: true }), item({ finalScore: 8 })];
  assert.notEqual(chooseFormat(ranked, { issue: 0 }, cfg, tax).format, 'B');
});

test('a top story well clear with an operational lesson gives C', () => {
  const ranked = [item({ finalScore: 9, hasOperationalLesson: true }), item({ finalScore: 6 })];
  assert.equal(chooseFormat(ranked, { issue: 0 }, cfg, tax).format, 'C');
});

test('a top story clear but without a lesson gives A', () => {
  const ranked = [item({ finalScore: 9 }), item({ finalScore: 5 })];
  assert.equal(chooseFormat(ranked, { issue: 0 }, cfg, tax).format, 'A');
});

test('a top story with a lesson but not clear gives A', () => {
  const ranked = [item({ finalScore: 8, hasOperationalLesson: true }), item({ finalScore: 7 })];
  assert.equal(chooseFormat(ranked, { issue: 0 }, cfg, tax).format, 'A');
});

test('issues 6, 12 and 18 select D on a normal fortnight', () => {
  const ranked = [item({ finalScore: 7 }), item({ finalScore: 7 })];
  for (const prev of [5, 11, 17]) {
    const c = chooseFormat(ranked, { issue: prev }, cfg, tax);
    assert.equal(c.format, 'D', `issue ${prev + 1}`);
    assert.equal(c.issue, prev + 1);
  }
  assert.equal(chooseFormat(ranked, { issue: 6 }, cfg, tax).format, 'A');
});

test('B still wins on a sixth issue', () => {
  const ranked = [item({ sourceId: 'mhra', finalScore: 8, isRegulatoryChange: true })];
  assert.equal(chooseFormat(ranked, { issue: 5 }, cfg, tax).format, 'B');
});

test('a format override wins and E is only reachable that way', () => {
  const ranked = [item({ sourceId: 'hta', finalScore: 8, isRegulatoryChange: true })];
  assert.equal(chooseFormat(ranked, { issue: 0 }, cfg, tax, { formatOverride: 'E' }).format, 'E');
  assert.throws(() => chooseFormat(ranked, { issue: 0 }, cfg, tax, { formatOverride: 'Z' }));
});

test('selectStories gives B and C one lead and the rest as also', () => {
  const ranked = [item(), item(), item(), item()];
  const s = selectStories('B', ranked, cfg);
  assert.equal(s.lead.length, 1);
  assert.equal(s.also.length, 3);
  const a = selectStories('A', ranked, cfg);
  assert.equal(a.lead.length, 4);
});
