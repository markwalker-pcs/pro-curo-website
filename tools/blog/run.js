#!/usr/bin/env node
'use strict';
/*
 * Fortnightly editor for the Pro-curo blog (CW042).
 *
 *   node run.js [--force] [--format A|B|C|D|E] [--snapshot file.json]
 *               [--now 2026-11-16] [--out result.json] [--pr-body body.md]
 *               [--offline] [--no-card]
 *   node run.js rebuild [--cards]
 *
 * Steps: collect, score, choose, research, draft, check, build, propose.
 * The script never pushes or opens the pull request itself: the workflow does
 * that from the files this script writes, so the editor stays runnable as a
 * plain `node run.js` anywhere (CW039 box later, laptop now).
 *
 * Exit codes: 0 done (see --out for status "proposed" or "skip"), 1 failure.
 */

const path = require('path');
const fs = require('fs');
const {
  REPO_ROOT, loadConfig, isoWeek, isoDate, writeText, readText, log
} = require('./lib/util');
const { collect, recentSnapshots } = require('./lib/collect');
const { loadTaxonomy, scoreSnapshot } = require('./lib/score');
const { chooseFormat, selectStories, applyResearchFallback } = require('./lib/choose');
const { findPreviousEdition } = require('./lib/editions');
const { loadState, saveState, coveredLinks, recordIssue, loadArticles, saveArticle } = require('./lib/state');
const { research } = require('./lib/research');
const model = require('./lib/model');
const { lintDraft, lintText } = require('./lib/lint');
const { buildAll } = require('./lib/build');
const { writeCard } = require('./lib/card');
const { writeSocialPack } = require('./lib/social');
const { prBody } = require('./lib/prbody');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { args[k] = next; i++; } else args[k] = true;
    } else args._.push(a);
  }
  return args;
}

function parityAllows(cfg, now) {
  const week = isoWeek(now);
  const even = week % 2 === 0;
  return cfg.weekParity === 'even' ? even : !even;
}

function writeOut(args, obj) {
  if (args.out) writeText(path.resolve(args.out), JSON.stringify(obj, null, 2) + '\n');
  log('result:', JSON.stringify(obj));
}

function mergeRanking(shortlist, ranking) {
  const byIndex = new Map(ranking.ranked.map(r => [r.index, r]));
  return shortlist.map((it, i) => {
    const r = byIndex.get(i);
    return {
      ...it,
      finalScore: r ? Number(r.score) : 0,
      modelReason: r ? r.reason : 'not ranked by the model',
      isRegulatoryChange: r ? !!r.isRegulatoryChange : false,
      hasOperationalLesson: r ? !!r.hasOperationalLesson : false
    };
  }).sort((a, b) => b.finalScore - a.finalScore || b.rulesScore - a.rulesScore);
}

// Third-party titles are quoted as published, except that an em dash in one
// would fail the site-wide rule, so it becomes a colon.
function sanitiseThirdPartyTitles(draft) {
  const fix = s => String(s || '').replace(/\s*\u2014\s*/g, ': ').trim();
  for (const s of draft.sources || []) s.title = fix(s.title);
  for (const a of draft.alsoThisFortnight || []) a.title = fix(a.title);
  return draft;
}

function uniqueSlug(slug, existing) {
  let s = slug;
  let n = 2;
  const taken = new Set(existing.map(a => a.slug));
  while (taken.has(s)) s = `${slug}-${n++}`;
  return s;
}

async function rebuild(args) {
  const cfg = loadConfig();
  const all = loadArticles();
  if (args.cards) for (const rec of all) { const { bytes } = writeCard(cfg, rec); rec.imageBytes = bytes; saveArticle(rec); }
  const written = buildAll(cfg, all);
  log(`rebuilt ${all.length} article(s); wrote ${written.length} files`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args._[0] === 'rebuild') return rebuild(args);

  const cfg = loadConfig();
  const tax = loadTaxonomy();
  const now = args.now ? new Date(args.now) : new Date();
  const force = !!args.force;

  if (!force && !parityAllows(cfg, now)) {
    log(`ISO week ${isoWeek(now)} is not a ${cfg.weekParity} week; nothing to do.`);
    return writeOut(args, { status: 'skip', reason: 'odd week', week: isoWeek(now) });
  }

  const state = loadState();
  const covered = coveredLinks(state, cfg.repeatWindowIssues);
  const existing = loadArticles();

  // 1 COLLECT
  const snapshot = await collect(cfg, { now, snapshotFile: args.snapshot });

  // 2 SCORE (rules)
  let { scored, passing, shortlist } = scoreSnapshot(snapshot.items, cfg, tax, covered);
  let quiet = false;
  let formatOverride = args.format;

  // 11 QUIET FORTNIGHT
  if (passing.length < cfg.scoring.minItems) {
    log(`Only ${passing.length} item(s) passed the threshold; trying a round-up from recent snapshots.`);
    const older = recentSnapshots(cfg.scoring.quietFortnightSnapshots, snapshot.date);
    const pool = [];
    const seen = new Set();
    for (const s of [snapshot, ...older]) for (const it of s.items) if (it.link && !seen.has(it.link)) { seen.add(it.link); pool.push(it); }
    const re = scoreSnapshot(pool, cfg, tax, covered);
    if (re.passing.length >= cfg.scoring.quietFortnightMinItems) {
      ({ scored, passing, shortlist } = re);
      quiet = true;
      formatOverride = formatOverride || 'D';
    } else {
      const reason = `quiet fortnight: ${passing.length} item(s) passed the threshold this fortnight and ${re.passing.length} across the last ${older.length + 1} snapshots (need ${cfg.scoring.quietFortnightMinItems} for a round-up)`;
      log(reason);
      return writeOut(args, { status: 'skip', reason, snapshot: snapshot.date });
    }
  }

  // 2 SCORE (model ranking)
  const ranking = await model.rankItems(cfg, shortlist);
  const ranked = mergeRanking(shortlist, ranking);

  // 3 CHOOSE
  const choice = chooseFormat(ranked, state, cfg, tax, { formatOverride });
  let format = choice.format;
  let stories = selectStories(format, ranked, cfg);
  if (format === 'B' && choice.lead && stories.lead[0] !== choice.lead) {
    stories.also = [stories.lead[0], ...stories.also].filter(s => s && s !== choice.lead).slice(0, 5);
    stories.lead = [choice.lead];
  }
  log(`Issue ${choice.issue}, format ${format}: ${choice.reason}`);

  // 4 RESEARCH (lead stories, plus the previous edition of a recurring
  // regulator publication so the draft can compare substance with substance)
  let researched = await research(stories.lead, cfg.userAgent, { offline: !!args.offline });
  for (const lead of stories.lead.slice(0, 2)) {
    const prev = await findPreviousEdition(lead, cfg.userAgent, { offline: !!args.offline });
    if (prev) researched.push(...(await research([prev], cfg.userAgent, { offline: !!args.offline })));
  }

  // Format fallback: no deep dive or explainer without the primary text.
  const fallback = applyResearchFallback(format, researched, cfg);
  if (fallback.changed) {
    log(`Format ${format} dropped to ${fallback.format}: ${fallback.reason}`);
    choice.reason += `; dropped to ${fallback.format} after research because ${fallback.reason}`;
    format = fallback.format;
    const wider = selectStories(format, ranked, cfg);
    const have = new Set(researched.map(r => r.link));
    const extra = wider.lead.filter(s => !have.has(s.link));
    if (extra.length) researched = researched.concat(await research(extra, cfg.userAgent, { offline: !!args.offline }));
    stories = { lead: wider.lead, also: wider.also };
  }

  // 5 DRAFT
  let draft = await model.draftArticle(cfg, {
    format, issue: choice.issue, lead: stories.lead, also: stories.also, researched,
    snapshotDate: snapshot.date, previousTitles: existing.slice(0, 6).map(a => a.title)
  });

  // 6 CHECK: lint, claim check, revise (up to two passes)
  draft = sanitiseThirdPartyTitles(draft);
  let problems = lintDraft(draft, cfg, { format });
  let claims = (await model.checkClaims(cfg, draft, researched)).claims;
  let unsupported = claims.filter(c => !c.supported);
  let revisions = 0;
  while ((problems.length || unsupported.length) && revisions < 2) {
    revisions++;
    log(`Revision ${revisions}: ${problems.length} lint problem(s), ${unsupported.length} unsupported claim(s)`);
    draft = sanitiseThirdPartyTitles(await model.reviseDraft(cfg, draft, unsupported, problems, researched));
    problems = lintDraft(draft, cfg, { format });
    claims = (await model.checkClaims(cfg, draft, researched)).claims;
    unsupported = claims.filter(c => !c.supported);
  }
  if (problems.length) {
    throw new Error(`Lint failed after ${revisions} revision pass(es):\n- ${problems.join('\n- ')}`);
  }

  // 7 BUILD
  const year = now.getUTCFullYear();
  const slug = uniqueSlug(draft.slug, existing);
  const rec = {
    issue: choice.issue,
    format,
    slug,
    year,
    title: draft.title,
    metaDescription: draft.metaDescription,
    whyThisMatters: draft.whyThisMatters,
    bodyHtml: draft.bodyHtml,
    alsoThisFortnight: draft.alsoThisFortnight || [],
    sources: draft.sources,
    tags: draft.tags,
    faq: format === 'E' ? (draft.faq || []) : [],
    social: draft.social,
    datePublished: now.toISOString(),
    dateModified: now.toISOString(),
    snapshot: snapshot.date,
    quietFortnight: quiet,
    status: 'proposed',
    imageBytes: 0
  };
  if (!args['no-card']) {
    const { bytes } = writeCard(cfg, rec);
    rec.imageBytes = bytes;
  }
  saveArticle(rec);
  const all = [rec, ...existing.filter(a => a.slug !== rec.slug)];
  const written = buildAll(cfg, all);
  const { md: socialMd } = writeSocialPack(cfg, rec);

  // Final text lint on everything that will be committed or posted.
  const pageHtml = readText(path.join(REPO_ROOT, 'blog', String(year), `${slug}.html`));
  const finalProblems = [
    ...lintText(pageHtml).map(p => `page: ${p}`),
    ...lintText(socialMd).map(p => `social pack: ${p}`)
  ];

  // State: the issue is recorded as proposed; it reaches main only if merged.
  const coveredNow = [...stories.lead, ...stories.also].map(s => s.link);
  recordIssue(state, {
    issue: choice.issue, format, slug, year, title: rec.title, date: isoDate(now),
    snapshot: snapshot.date, coveredLinks: coveredNow, status: 'proposed'
  });
  saveState(state);

  // 8 PROPOSE: PR body for the workflow
  const chosenLinks = new Set(coveredNow);
  const rejected = ranked.filter(r => !chosenLinks.has(r.link));
  const dropped = scored.filter(s => !shortlist.includes(s));
  const body = prBody(cfg, { rec, choice, ranked, rejected, dropped, claims, revisions, lintResult: problems, socialMd, snapshot, research: researched, chosenLinks });
  finalProblems.push(...lintText(body).map(p => `PR body: ${p}`));
  if (finalProblems.length) throw new Error(`Final lint failed:\n- ${finalProblems.join('\n- ')}`);
  if (args['pr-body']) writeText(path.resolve(args['pr-body']), body);

  writeOut(args, {
    status: 'proposed',
    issue: choice.issue,
    format,
    slug,
    year,
    title: rec.title,
    branch: `blog/${isoDate(now)}-${slug}`,
    prTitle: `Blog: ${rec.title} (issue ${choice.issue}, ${format})`,
    unsupportedClaims: unsupported.length,
    revisions,
    quietFortnight: quiet,
    files: [
      ...written,
      `blog/${year}/img/${slug}.png`,
      `content/articles/${year}-${slug}.json`,
      `content/social-packs/${slug}.md`,
      `content/news-snapshots/${snapshot.date}.json`,
      'content/blog-state.json'
    ]
  });
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error('[blog] FAILED:', err && err.stack ? err.stack : err);
  const args = parseArgs(process.argv.slice(2));
  try { if (args.out) fs.writeFileSync(path.resolve(args.out), JSON.stringify({ status: 'failed', error: String(err && err.message || err) }, null, 2)); } catch { /* ignore */ }
  process.exit(1);
});
