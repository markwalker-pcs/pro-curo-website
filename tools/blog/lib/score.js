'use strict';
// Step 2 SCORE, rules pass: source or category weight plus keyword taxonomy.
// Deterministic and unit-tested. The model ranking pass lives in model.js.

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const { TOOL_ROOT } = require('./util');

function loadTaxonomy() {
  return YAML.parse(fs.readFileSync(path.join(TOOL_ROOT, 'config', 'taxonomy.yaml'), 'utf8'));
}

function scoreItem(item, tax) {
  const title = String(item.title || '').toLowerCase();
  const desc = String(item.description || '').toLowerCase();
  let score = 0;
  const reasons = [];

  const sw = tax.sourceWeights && tax.sourceWeights[item.sourceId];
  const cw = tax.categoryWeights && item.category ? tax.categoryWeights[item.category] : undefined;
  const base = sw !== undefined ? sw : (cw !== undefined ? cw : 0);
  score += base;
  if (base) reasons.push(`source ${item.sourceId || item.category} +${base}`);

  for (const [kw, w] of Object.entries(tax.keywords || {})) {
    const k = kw.toLowerCase();
    if (title.includes(k)) {
      score += w * 2;
      reasons.push(`title "${kw}" +${w * 2}`);
    } else if (desc.includes(k)) {
      score += w;
      reasons.push(`text "${kw}" +${w}`);
    }
  }
  return { score, reasons };
}

// Returns items with rulesScore and rulesReasons, sorted high to low, and the
// subset that passes the threshold. Items already covered within the repeat
// window are excluded before scoring.
function scoreSnapshot(items, cfg, tax, coveredLinks = new Set()) {
  const scored = items
    .filter(it => it.link && !coveredLinks.has(it.link))
    .map(it => {
      const { score, reasons } = scoreItem(it, tax);
      return { ...it, rulesScore: score, rulesReasons: reasons };
    })
    .sort((a, b) => b.rulesScore - a.rulesScore);
  const passing = scored.filter(it => it.rulesScore >= cfg.scoring.threshold);
  const shortlist = passing.slice(0, cfg.scoring.shortlist);
  return { scored, passing, shortlist };
}

module.exports = { loadTaxonomy, scoreItem, scoreSnapshot };
