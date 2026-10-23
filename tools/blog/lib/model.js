'use strict';
// All Claude API calls for the editor: ranking, drafting, claim checking and
// revision. One model, named in config/site.json. Structured outputs through
// the SDK's zod helper so every response is validated JSON.
//
// BLOG_MOCK_MODEL=1 swaps the API for canned responses from test/fixtures so
// the whole pipeline (lint, build, card, feed, PR body) can run without a key.

const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const { TOOL_ROOT, readText, log } = require('./util');

const RankingSchema = z.object({
  ranked: z.array(z.object({
    index: z.number().int().describe('Index of the item in the list you were given'),
    score: z.number().min(0).max(10).describe('Relevance to the audience, 0 to 10'),
    reason: z.string().describe('One sentence on why this matters, or does not, to sample custodians'),
    isRegulatoryChange: z.boolean().describe('True only if the item changes or clarifies an obligation for regulated establishments'),
    hasOperationalLesson: z.boolean().describe('True if the story carries a practical lesson for running a sample collection')
  })),
  misconception: z.string().nullable().describe('A common misconception one of these stories exposes, if any, else null')
});

const SourceSchema = z.object({
  title: z.string(),
  publisher: z.string(),
  url: z.string(),
  type: z.enum(['regulator', 'primary-document', 'peer-reviewed', 'trade-press', 'other'])
});

const DraftSchema = z.object({
  title: z.string().describe('At or under 60 characters'),
  slug: z.string().describe('lower-case-with-hyphens, no dates'),
  metaDescription: z.string().describe('At or under 155 characters'),
  whyThisMatters: z.array(z.string()).length(3).describe('Exactly three one-sentence bullets'),
  bodyHtml: z.string().describe('Clean HTML using only p, h2, h3, ul, ol, li, a, strong, em, blockquote. Every factual claim linked to its source.'),
  alsoThisFortnight: z.array(z.object({ title: z.string(), summary: z.string(), url: z.string() })).describe('Short list of other items, may be empty'),
  sources: z.array(SourceSchema).min(1),
  tags: z.array(z.string()).min(3).max(6),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })).describe('Only for format E, else empty'),
  social: z.object({
    linkedin: z.string().describe('120 to 200 words, ends with a question, no hashtags in the text (hashtags are listed separately), no link'),
    linkedinWeekTwo: z.string().describe('Under 80 words, one striking fact or checklist item, no link'),
    facebook: z.string().describe('40 to 80 words, plainer tone, no link'),
    hashtags: z.array(z.string()).min(3).max(5).describe('Each starting with #'),
    emailSubject: z.string().describe('Under 60 characters'),
    emailPreheader: z.string().describe('One sentence'),
    emailIntro: z.string().describe('Two or three sentences that stand alone in the email body')
  })
});

const ClaimCheckSchema = z.object({
  claims: z.array(z.object({
    claim: z.string().describe('The factual claim as written in the article'),
    supported: z.boolean(),
    sourceUrl: z.string().nullable().describe('The listed source that supports it, else null'),
    evidence: z.string().describe('A short paraphrase of the supporting passage, or why it is unsupported')
  }))
});

function mockMode() {
  return process.env.BLOG_MOCK_MODEL === '1';
}

function loadMock(name) {
  const f = path.join(TOOL_ROOT, 'test', 'fixtures', `mock-${name}.json`);
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

let client = null;
function getClient() {
  if (client) return client;
  const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
  client = new Anthropic({ maxRetries: 3, timeout: 15 * 60 * 1000 });
  return client;
}

async function parseCall(cfg, { system, user, schema, effort, maxTokens }) {
  const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
  const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
  const c = getClient();
  let response;
  try {
    response = await c.messages.parse({
      model: cfg.model,
      max_tokens: maxTokens || 16000,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort: effort || 'high', format: zodOutputFormat(schema) }
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error('Anthropic API key missing or invalid (ANTHROPIC_API_KEY).');
    if (err instanceof Anthropic.RateLimitError) throw new Error(`Anthropic rate limit: ${err.message}`);
    if (err instanceof Anthropic.APIError) throw new Error(`Anthropic API error ${err.status}: ${err.message}`);
    throw err;
  }
  if (response.stop_reason === 'refusal') {
    const cat = response.stop_details && response.stop_details.category;
    throw new Error(`Model declined the request (refusal${cat ? ', ' + cat : ''}).`);
  }
  if (response.stop_reason === 'max_tokens') throw new Error('Model output was cut off at max_tokens.');
  if (!response.parsed_output) throw new Error('Model output did not match the expected schema.');
  const usage = response.usage || {};
  log(`model ${cfg.model}: in ${usage.input_tokens || 0}, out ${usage.output_tokens || 0}`);
  return response.parsed_output;
}

function editorialGuide() {
  return readText(path.join(TOOL_ROOT, 'EDITORIAL.md'));
}

function audienceBlock() {
  const guide = editorialGuide();
  const m = guide.match(/## Who we write for[\s\S]*?(?=\n## )/);
  return m ? m[0] : guide;
}

// ---- Ranking -------------------------------------------------------------
async function rankItems(cfg, shortlist) {
  if (mockMode()) return loadMock('ranking');
  const list = shortlist.map((it, i) =>
    `${i}. [${it.source}${it.category ? ', ' + it.category : ''}] ${it.title}\n   ${it.description || ''}\n   ${it.link}\n   rules score ${it.rulesScore}`).join('\n\n');
  const system = `You rank industry news for the editor of Sample Matters, the fortnightly briefing published by Pro-curo Software Limited for people who look after human tissue and biological sample collections in the UK.\n\n${audienceBlock()}\n\nScore each item 0 to 10 for how much it matters to that audience. A regulator publication that changes or clarifies an obligation scores high. General science with no bearing on running a sample collection scores low. Mark isRegulatoryChange true only when the item itself changes, introduces or clarifies a rule, standard, licence condition, code of practice or statutory date for regulated establishments; an annual report, a news story about a regulator, or a consultation summary is not a change unless it states one. Mark hasOperationalLesson true when the story carries a practical lesson about storage, consent, labelling, traceability, data, audit or inspection. Write every reason in UK English without em dashes.`;
  const user = `Rank these ${shortlist.length} items. Return every index exactly once.\n\n${list}`;
  return parseCall(cfg, { system, user, schema: RankingSchema, effort: 'medium', maxTokens: 8000 });
}

// ---- Drafting ------------------------------------------------------------
function formatBrief(cfg, format) {
  const f = cfg.formats[format];
  return `Format ${format}: ${f.name} (${f.label}). Target length ${f.minWords} to ${f.maxWords} words in the body.`;
}

function sourcesBlock(researched) {
  return researched.map((r, i) =>
    `--- SOURCE ${i + 1} ---\nTitle: ${r.title}\nPublisher: ${r.source}\nURL: ${r.link}\nPublished: ${r.isoDate}\nFetched text: ${r.fetched ? 'yes' : 'no (feed summary only)'}\n\n${r.text}\n`).join('\n');
}

async function draftArticle(cfg, { format, issue, lead, also, researched, snapshotDate, previousTitles }) {
  if (mockMode()) return loadMock('draft');
  const system = `You are the writer for Sample Matters, ${cfg.seriesTagline}, published on pro-curo.com by Pro-curo Software Limited. Follow this editorial guide exactly.\n\n${editorialGuide()}\n\nIssue ${issue}, collected ${snapshotDate}. ${formatBrief(cfg, format)}\n\nYou must only state facts that appear in the source texts below. Link each claim to its source URL inside the body HTML using <a href="URL">. Quote at most one sentence per source, in quotation marks and attributed. Do not invent dates, figures, names or quotations. Where the fetched text is a feed summary only, say the detail comes from the summary and keep claims to what it states. Write the whole output in UK English with no em dashes. The disclosure line, reviewer line and not-advice line are added by the template, so do not write them.`;
  const alsoList = also.length
    ? `\n\nOther items from the fortnight for the "also this fortnight" list (summarise in one sentence each from the summary given, do not invent detail):\n${also.map(a => `- ${a.title} (${a.source}) ${a.link}\n  ${a.description || ''}`).join('\n')}`
    : '';
  const prev = previousTitles && previousTitles.length ? `\n\nTitles of recent issues, do not reuse them: ${previousTitles.join(' | ')}` : '';
  const user = `Write issue ${issue} as format ${format}. Lead stories, with their fetched source text:\n\n${sourcesBlock(researched)}${alsoList}${prev}`;
  return parseCall(cfg, { system, user, schema: DraftSchema, effort: 'high', maxTokens: 24000 });
}

// ---- Claim check ---------------------------------------------------------
async function checkClaims(cfg, draft, researched) {
  if (mockMode()) return loadMock('claims');
  const system = `You are a fact checker. List every factual claim in the article (dates, figures, names, what a document says, what an organisation did or will do, quotations). For each, decide whether the source texts provided support it. A claim is supported only if a source text states it or it follows directly from a stated fact. General background knowledge, inferences about motives and anything not in the sources is unsupported. Be strict. Write in UK English without em dashes.`;
  const user = `ARTICLE TITLE: ${draft.title}\n\nWHY THIS MATTERS:\n${draft.whyThisMatters.map(b => '- ' + b).join('\n')}\n\nBODY HTML:\n${draft.bodyHtml}\n\n${draft.alsoThisFortnight.length ? 'ALSO THIS FORTNIGHT:\n' + draft.alsoThisFortnight.map(a => `- ${a.title}: ${a.summary} (${a.url})`).join('\n') + '\n\n' : ''}SOURCE TEXTS:\n\n${sourcesBlock(researched)}`;
  return parseCall(cfg, { system, user, schema: ClaimCheckSchema, effort: 'high', maxTokens: 12000 });
}

// ---- Revision ------------------------------------------------------------
async function reviseDraft(cfg, draft, unsupported, lintProblems, researched) {
  if (mockMode()) return loadMock('draft');
  const system = `You are revising an article for Sample Matters, published by Pro-curo Software Limited. Follow this editorial guide exactly.\n\n${editorialGuide()}\n\nReturn the complete revised article in the same structure. Remove or rewrite every unsupported claim so that only facts in the source texts remain. Fix every lint problem listed. Keep everything else as close to the original as possible. UK English, no em dashes.`;
  const user = `UNSUPPORTED CLAIMS TO REMOVE OR REWRITE:\n${unsupported.map(c => `- ${c.claim} (${c.evidence})`).join('\n') || '(none)'}\n\nLINT PROBLEMS TO FIX:\n${lintProblems.map(p => '- ' + p).join('\n') || '(none)'}\n\nCURRENT ARTICLE (JSON):\n${JSON.stringify(draft, null, 2)}\n\nSOURCE TEXTS:\n\n${sourcesBlock(researched)}`;
  return parseCall(cfg, { system, user, schema: DraftSchema, effort: 'high', maxTokens: 24000 });
}

module.exports = { rankItems, draftArticle, checkClaims, reviseDraft, mockMode, DraftSchema, RankingSchema, ClaimCheckSchema };
