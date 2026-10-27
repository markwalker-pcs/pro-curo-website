'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { previousEditionTitle, isRecurringPublication, stripPrefix } = require('../lib/editions');
const { applyResearchFallback } = require('../lib/choose');
const { loadConfig } = require('../lib/util');

const cfg = loadConfig();

test('previous edition title steps a year range back by one', () => {
  assert.equal(previousEditionTitle('Human Tissue Authority annual report and accounts: 2025 to 2026'), 'Human Tissue Authority annual report and accounts: 2024 to 2025');
  assert.equal(previousEditionTitle('Annual report 2025/26'), 'Annual report 2024/25');
  assert.equal(previousEditionTitle('Annual report 2025-2026'), 'Annual report 2024-2025');
  assert.equal(previousEditionTitle('Inspection findings 2026'), 'Inspection findings 2025');
  assert.equal(previousEditionTitle('Guidance on consent'), null);
});

test('recurring publications are recognised and prefixes stripped', () => {
  assert.ok(isRecurringPublication({ title: 'Corporate report: Human Tissue Authority annual report and accounts: 2025 to 2026' }));
  assert.ok(!isRecurringPublication({ title: 'Guidance: COVID-19 test validation approved products' }));
  assert.ok(!isRecurringPublication({ title: 'Annual report' }));
  assert.equal(stripPrefix('Corporate report: HTA annual report 2024 to 2025'), 'HTA annual report 2024 to 2025');
});

test('a deep dive without fetched primary text falls back to a briefing', () => {
  const r = applyResearchFallback('C', [{ title: 't', link: 'x', fetched: false, note: 'fetch failed', text: 'short' }], cfg);
  assert.equal(r.format, 'A');
  assert.ok(r.changed);
});

test('a deep dive on a thin landing page falls back to a briefing', () => {
  const r = applyResearchFallback('B', [{ title: 't', link: 'x', fetched: true, text: 'x'.repeat(1500) }], cfg);
  assert.equal(r.format, 'A');
  assert.ok(r.reason.includes('too thin'));
});

test('a deep dive with the full text keeps its format, and A is never changed', () => {
  const full = [{ title: 't', link: 'x', fetched: true, text: 'x'.repeat(9000) }];
  assert.equal(applyResearchFallback('C', full, cfg).changed, false);
  assert.equal(applyResearchFallback('A', [{ fetched: false, text: '' }], cfg).changed, false);
});

test('the fallback judges the lead, not the previous edition', () => {
  const r = applyResearchFallback('C', [
    { title: 'prev', link: 'p', fetched: true, text: 'x'.repeat(9000), isPreviousEdition: true },
    { title: 'lead', link: 'l', fetched: false, text: 'summary' }
  ], cfg);
  assert.equal(r.format, 'A');
});
