'use strict';
// content/blog-state.json: issue counter, last format, and the covered story
// links for the repeat window. Also the article records the index, feed,
// sitemap and llms.txt are regenerated from (content/articles/*.json).

const path = require('path');
const fs = require('fs');
const { CONTENT_ROOT, readJson, writeJson } = require('./util');

const STATE_FILE = path.join(CONTENT_ROOT, 'blog-state.json');
const ARTICLES_DIR = path.join(CONTENT_ROOT, 'articles');

function loadState() {
  return readJson(STATE_FILE, { issue: 0, lastFormat: null, issues: [] });
}

function saveState(state) {
  writeJson(STATE_FILE, state);
}

// Links covered in the last N issues (proposed or published). A closed,
// unmerged PR never reaches main, so its entry never lands here.
function coveredLinks(state, windowIssues) {
  const recent = (state.issues || []).slice(-windowIssues);
  const set = new Set();
  for (const iss of recent) for (const l of iss.coveredLinks || []) set.add(l);
  return set;
}

function recordIssue(state, entry) {
  state.issue = entry.issue;
  state.lastFormat = entry.format;
  state.issues = (state.issues || []).filter(i => i.issue !== entry.issue);
  state.issues.push(entry);
  state.issues.sort((a, b) => a.issue - b.issue);
  return state;
}

function loadArticles() {
  if (!fs.existsSync(ARTICLES_DIR)) return [];
  return fs.readdirSync(ARTICLES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => readJson(path.join(ARTICLES_DIR, f)))
    .sort((a, b) => String(b.datePublished).localeCompare(String(a.datePublished)));
}

function saveArticle(record) {
  fs.mkdirSync(ARTICLES_DIR, { recursive: true });
  writeJson(path.join(ARTICLES_DIR, `${record.year}-${record.slug}.json`), record);
}

module.exports = { STATE_FILE, ARTICLES_DIR, loadState, saveState, coveredLinks, recordIssue, loadArticles, saveArticle };
