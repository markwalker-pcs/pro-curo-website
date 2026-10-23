'use strict';
// Step 3 CHOOSE: the format selection rule from plan section 4.1, in order.
//
//   1. A qualifying regulatory item forces format B. "Qualifying" means the
//      item comes from a regulator source AND the model ranking marked it as
//      changing or clarifying an obligation AND it passed the threshold.
//   2. Otherwise, if the top-scored story is well clear of the rest (by
//      scoring.clearMargin) and has an operational lesson, format C.
//   3. Every sixth issue is format D (issue 6, 12, 18, ...).
//   4. Otherwise format A.
//   E is only chosen when asked for (format override).
//
// Items carry: finalScore (model rank score, else rulesScore), sourceId,
// isRegulatoryChange, hasOperationalLesson.

function chooseFormat(ranked, state, cfg, tax, opts = {}) {
  const nextIssue = (state.issue || 0) + 1;
  const regulatorSources = new Set(tax.regulatorSources || []);
  const threshold = cfg.scoring.threshold;

  if (opts.formatOverride) {
    const f = String(opts.formatOverride).toUpperCase();
    if (!cfg.formats[f]) throw new Error(`Unknown format override: ${opts.formatOverride}`);
    return { format: f, issue: nextIssue, reason: `format forced to ${f} by workflow input`, lead: ranked[0] || null };
  }

  // The rules threshold is on the rules score (the model score is 0 to 10 and
  // is only used for ordering), so a regulator item qualifies when it passed
  // the rules pass and the model says it changes or clarifies an obligation.
  const regulatory = ranked.find(it =>
    regulatorSources.has(it.sourceId) && it.isRegulatoryChange && (it.rulesScore ?? 0) >= threshold);
  if (regulatory) {
    return { format: 'B', issue: nextIssue, reason: `regulatory item from ${regulatory.source}: "${regulatory.title}"`, lead: regulatory };
  }

  if (ranked.length >= 1) {
    const top = ranked[0];
    const second = ranked[1];
    const gap = second ? (top.finalScore ?? top.rulesScore) - (second.finalScore ?? second.rulesScore) : Infinity;
    if (top.hasOperationalLesson && gap >= cfg.scoring.clearMargin) {
      return { format: 'C', issue: nextIssue, reason: `top story clear by ${gap === Infinity ? 'default' : gap} with an operational lesson: "${top.title}"`, lead: top };
    }
  }

  if (nextIssue % 6 === 0) {
    return { format: 'D', issue: nextIssue, reason: `issue ${nextIssue} is a sixth issue`, lead: ranked[0] || null };
  }

  return { format: 'A', issue: nextIssue, reason: 'normal fortnight', lead: ranked[0] || null };
}

// Which items the article will cover. B and C lead with one story and carry
// the rest as "also this fortnight"; A, D and E use the top stories.
function selectStories(format, ranked, cfg) {
  const top = ranked.slice(0, cfg.scoring.shortlist);
  if (format === 'B' || format === 'C') {
    return { lead: [top[0]].filter(Boolean), also: top.slice(1, 6) };
  }
  if (format === 'A') return { lead: top.slice(0, 6), also: top.slice(6, 9) };
  if (format === 'D') return { lead: top.slice(0, 12), also: [] };
  return { lead: top.slice(0, 7), also: [] };
}

module.exports = { chooseFormat, selectStories };
