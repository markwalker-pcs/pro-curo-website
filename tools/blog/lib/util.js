'use strict';
// Shared helpers for the blog editor: paths, line endings, escaping, dates.

const fs = require('fs');
const path = require('path');

const TOOL_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(TOOL_ROOT, '..', '..');
const CONTENT_ROOT = path.join(REPO_ROOT, 'content');

function loadConfig() {
  const cfg = JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, 'config', 'site.json'), 'utf8'));
  cfg.sectionUrl = cfg.siteUrl + cfg.sectionPath;
  return cfg;
}

// The working tree may be CRLF (Windows checkout with autocrlf) or LF (CI).
// Generated files follow whatever index.html uses, so a run never flips the
// line endings of the repo it is committing into.
let cachedEol = null;
function repoEol() {
  if (cachedEol) return cachedEol;
  try {
    const sample = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
    cachedEol = sample.includes('\r\n') ? '\r\n' : '\n';
  } catch {
    cachedEol = '\n';
  }
  return cachedEol;
}

function normaliseEol(text) {
  const eol = repoEol();
  return text.replace(/\r\n/g, '\n').replace(/\n/g, eol);
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, normaliseEol(text), 'utf8');
}

function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (fallback !== undefined && err.code === 'ENOENT') return fallback;
    throw err;
  }
}

function writeJson(file, obj) {
  writeText(file, JSON.stringify(obj, null, 2) + '\n');
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(s) {
  return escapeHtml(s).replace(/&#39;/g, '&apos;');
}

function stripTags(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

function wordCount(text) {
  const t = stripTags(text);
  return t ? t.split(/\s+/).length : 0;
}

function isoDate(d) {
  return (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function ukDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}

function rfc822(d) {
  return (d instanceof Date ? d : new Date(d)).toUTCString();
}

// ISO 8601 week number (Monday-based). Used for the fortnight parity gate.
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function daysAgo(n, from) {
  const d = from ? new Date(from) : new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function log(...args) {
  // eslint-disable-next-line no-console
  console.log('[blog]', ...args);
}

module.exports = {
  TOOL_ROOT, REPO_ROOT, CONTENT_ROOT,
  loadConfig, repoEol, normaliseEol, writeText, readText, readJson, writeJson,
  escapeHtml, escapeXml, stripTags, slugify, wordCount,
  isoDate, ukDate, rfc822, isoWeek, daysAgo, log
};
