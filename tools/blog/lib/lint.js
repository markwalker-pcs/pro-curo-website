'use strict';
// Step 6 CHECK (b): deterministic lint. Any problem FAILS the run.
//
// Rules (CW042 part C.7):
//   - U+2014 em dash anywhere in output (page, metadata, social pack, email)
//   - any name on the banned-names list (GitHub Actions variable
//     BLOG_BANNED_NAMES, comma separated; never committed to the repo)
//   - US spellings from a short list
//   - title or meta description over length
//   - missing source links (no sources, or a source URL not linked in the body)
//   - more than one Pro-curo product mention in the body
//   - any price or currency symbol
//   - words from the banned-hype list in EDITORIAL.md
// Hyphens and en dashes are allowed.

const path = require('path');
const { TOOL_ROOT, readText, stripTags, wordCount } = require('./util');

const US_SPELLINGS = [
  // -ize endings: flag common verbs; allow words that are correct UK spelling
  { re: /\b(organi[sz]ation|organize[sd]?|organizing|recogni[z]e[sd]?|recognizing|reali[z]e[sd]?|realizing|analyze[sd]?|analyzing|standardi[z]e[sd]?|prioriti[z]e[sd]?|utili[z]e[sd]?|minimi[z]e[sd]?|maximi[z]e[sd]?|optimi[z]e[sd]?|customi[z]e[sd]?|summari[z]e[sd]?|emphasi[z]e[sd]?|authori[z]e[sd]?|authorization|categori[z]e[sd]?|characteri[z]e[sd]?|digiti[z]e[sd]?|steriliz(e[sd]?|ation)|crystalliz(e[sd]?|ation)|centraliz(e[sd]?|ation)|speciali[z]e[sd]?|finali[z]e[sd]?)\b/gi,
    test: (m) => /z/i.test(m) && !/^organisation$/i.test(m) },
  { re: /\bcolors?\b/gi }, { re: /\bcenters?\b/gi }, { re: /\bcentered\b/gi },
  { re: /\banalyzed?\b/gi }, { re: /\bbehaviors?\b/gi }, { re: /\blabor\b/gi },
  { re: /\blicense\b(?=\s+(is|was|holder|condition|number|fee|renewal|application))/gi },
  { re: /\bdefense\b/gi }, { re: /\bfavor(s|ed|ite)?\b/gi }, { re: /\bgray\b/gi },
  { re: /\bcatalogs?\b/gi }, { re: /\bfulfill\b/gi }, { re: /\bskillful\b/gi },
  { re: /\btraveled\b/gi }, { re: /\bmodeling\b/gi }, { re: /\bcanceled\b/gi },
  { re: /\bliters?\b/gi }, { re: /\bmeters?\b(?!\s*(per|reading))/gi },
  { re: /\bpracticed\b/gi, note: 'practised is the UK verb' },
  // program when not computing
  { re: /\bprograms?\b/gi, test: (m, ctx) => !/(software|computer|computing|coding|code|programming language)/i.test(ctx) }
];

const PRICE_RE = /(£\s?\d|\$\s?\d|€\s?\d|\b\d[\d,.]*\s?(GBP|EUR|USD)\b|\bper\s+(seat|user|licence|license)\b.*\b\d)/i;

function loadBannedHype() {
  const guide = readText(path.join(TOOL_ROOT, 'EDITORIAL.md'));
  const m = guide.match(/## Banned words\s*\n([\s\S]*?)(?=\n## )/);
  if (!m) return [];
  return m[1].split(/\n/).join(' ').replace(/Any of these.*?run:/i, '').split(',').map(s => s.trim()).filter(Boolean);
}

function bannedNamesFromEnv() {
  return String(process.env.BLOG_BANNED_NAMES || '').split(',').map(s => s.trim()).filter(Boolean);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Collects every text field of the output into named chunks.
function collectFields(draft, extra = {}) {
  const fields = [];
  const add = (name, val) => { if (val != null && String(val).trim()) fields.push({ name, text: String(val) }); };
  add('title', draft.title);
  add('slug', draft.slug);
  add('metaDescription', draft.metaDescription);
  (draft.whyThisMatters || []).forEach((b, i) => add(`whyThisMatters[${i}]`, b));
  add('bodyHtml', draft.bodyHtml);
  (draft.alsoThisFortnight || []).forEach((a, i) => { add(`also[${i}].title`, a.title); add(`also[${i}].summary`, a.summary); });
  (draft.sources || []).forEach((s, i) => { add(`sources[${i}].title`, s.title); add(`sources[${i}].publisher`, s.publisher); });
  (draft.tags || []).forEach((t, i) => add(`tags[${i}]`, t));
  (draft.faq || []).forEach((f, i) => { add(`faq[${i}].question`, f.question); add(`faq[${i}].answer`, f.answer); });
  if (draft.social) for (const [k, v] of Object.entries(draft.social)) add(`social.${k}`, Array.isArray(v) ? v.join(' ') : v);
  for (const [k, v] of Object.entries(extra)) add(k, v);
  return fields;
}

function lintDraft(draft, cfg, opts = {}) {
  const problems = [];
  const bannedNames = opts.bannedNames || bannedNamesFromEnv();
  const hype = opts.bannedHype || loadBannedHype();
  const fields = collectFields(draft, opts.extraFields || {});

  for (const f of fields) {
    if (f.text.includes('\u2014')) problems.push(`${f.name}: contains an em dash (U+2014)`);
    for (const name of bannedNames) {
      if (new RegExp(escapeRe(name), 'i').test(f.text)) problems.push(`${f.name}: contains a banned name`);
    }
    const plain = stripTags(f.text);
    for (const word of hype) {
      const re = new RegExp('\\b' + escapeRe(word).replace(/\\ /g, '\\s+') + '\\b', 'i');
      if (re.test(plain)) problems.push(`${f.name}: banned word "${word}"`);
    }
    // Third-party titles are quoted as published, so they are exempt from the
    // UK spelling rule (an American journal title is not our spelling error).
    const thirdPartyTitle = /^(sources|also)\[\d+\]\.title$/.test(f.name);
    for (const rule of US_SPELLINGS) {
      if (thirdPartyTitle) break;
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(plain)) !== null) {
        const ctx = plain.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40);
        if (rule.test && !rule.test(m[0], ctx)) continue;
        problems.push(`${f.name}: US spelling "${m[0]}"${rule.note ? ' (' + rule.note + ')' : ''}`);
      }
    }
    if (PRICE_RE.test(plain)) problems.push(`${f.name}: contains a price or currency amount`);
  }

  if (!draft.title || draft.title.length > cfg.limits.titleMax) problems.push(`title: ${draft.title ? draft.title.length : 0} characters, limit ${cfg.limits.titleMax}`);
  if (!draft.metaDescription || draft.metaDescription.length > cfg.limits.metaDescriptionMax) problems.push(`metaDescription: ${draft.metaDescription ? draft.metaDescription.length : 0} characters, limit ${cfg.limits.metaDescriptionMax}`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(draft.slug || '')) problems.push('slug: must be lower case words joined by hyphens');
  if (!draft.whyThisMatters || draft.whyThisMatters.length !== 3) problems.push('whyThisMatters: exactly three bullets required');

  // Sources: at least one, every source URL linked somewhere in the body or also list.
  const sources = draft.sources || [];
  if (sources.length === 0) problems.push('sources: none listed');
  const linked = new Set();
  const hrefRe = /href="([^"]+)"/g;
  let hm;
  while ((hm = hrefRe.exec(draft.bodyHtml || '')) !== null) linked.add(hm[1].replace(/\/$/, ''));
  for (const a of draft.alsoThisFortnight || []) linked.add(String(a.url).replace(/\/$/, ''));
  for (const s of sources) {
    if (!/^https?:\/\//.test(s.url)) problems.push(`sources: "${s.title}" has no valid URL`);
    else if (!linked.has(s.url.replace(/\/$/, ''))) problems.push(`sources: "${s.title}" is listed but not linked in the body`);
  }
  if (linked.size === 0) problems.push('bodyHtml: no source links');

  // One soft Pro-curo mention at most in the body.
  const mentions = (stripTags(draft.bodyHtml || '').match(/pro-curo/gi) || []).length;
  if (mentions > 1) problems.push(`bodyHtml: ${mentions} Pro-curo mentions, limit 1`);

  // Body HTML whitelist of tags.
  const tagRe = /<\/?([a-z0-9]+)/gi;
  let tm;
  const allowed = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'blockquote']);
  const bad = new Set();
  while ((tm = tagRe.exec(draft.bodyHtml || '')) !== null) if (!allowed.has(tm[1].toLowerCase())) bad.add(tm[1]);
  if (bad.size) problems.push(`bodyHtml: disallowed tags ${[...bad].join(', ')}`);
  if (/<h1\b/i.test(draft.bodyHtml || '')) problems.push('bodyHtml: contains an h1');
  if (/!/.test(stripTags(draft.bodyHtml || ''))) problems.push('bodyHtml: contains an exclamation mark');

  // Length.
  const fmt = cfg.formats[opts.format || 'A'];
  const words = wordCount(draft.bodyHtml || '');
  if (fmt && words < Math.floor(fmt.minWords * 0.8)) problems.push(`bodyHtml: ${words} words, below ${fmt.minWords} for format ${opts.format}`);
  if (fmt && words > Math.ceil(fmt.maxWords * 1.25)) problems.push(`bodyHtml: ${words} words, above ${fmt.maxWords} for format ${opts.format}`);

  // Social pack lengths.
  const soc = draft.social || {};
  const lw = wordCount(soc.linkedin || '');
  if (lw < cfg.limits.linkedinMinWords || lw > cfg.limits.linkedinMaxWords) problems.push(`social.linkedin: ${lw} words, must be ${cfg.limits.linkedinMinWords} to ${cfg.limits.linkedinMaxWords}`);
  const fw = wordCount(soc.facebook || '');
  if (fw < cfg.limits.facebookMinWords || fw > cfg.limits.facebookMaxWords) problems.push(`social.facebook: ${fw} words, must be ${cfg.limits.facebookMinWords} to ${cfg.limits.facebookMaxWords}`);
  const tags = soc.hashtags || [];
  if (tags.length < cfg.limits.hashtagsMin || tags.length > cfg.limits.hashtagsMax) problems.push(`social.hashtags: ${tags.length}, must be ${cfg.limits.hashtagsMin} to ${cfg.limits.hashtagsMax}`);
  if (tags.some(t => !/^#[A-Za-z0-9]+$/.test(t))) problems.push('social.hashtags: each must be a single #Word');
  if ((soc.emailSubject || '').length > cfg.limits.emailSubjectMax) problems.push(`social.emailSubject: ${soc.emailSubject.length} characters, limit ${cfg.limits.emailSubjectMax}`);
  if (/https?:\/\//i.test(`${soc.linkedin} ${soc.facebook} ${soc.linkedinWeekTwo}`)) problems.push('social: posts must not contain links (the tracked link is appended)');

  // FAQ only on E.
  if ((draft.faq || []).length && opts.format !== 'E') problems.push('faq: only allowed on format E');
  if (opts.format === 'E' && (draft.faq || []).length < 5) problems.push('faq: format E needs at least five questions');

  return problems;
}

// Lint any plain text (PR body, social pack file, email) for the global rules.
function lintText(text, opts = {}) {
  const problems = [];
  const bannedNames = opts.bannedNames || bannedNamesFromEnv();
  if (text.includes('\u2014')) problems.push('contains an em dash (U+2014)');
  for (const name of bannedNames) if (new RegExp(escapeRe(name), 'i').test(text)) problems.push('contains a banned name');
  return problems;
}

module.exports = { lintDraft, lintText, loadBannedHype, bannedNamesFromEnv, US_SPELLINGS, PRICE_RE };
