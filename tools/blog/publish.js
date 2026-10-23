#!/usr/bin/env node
'use strict';
// Marks an issue as published after its pull request is merged.
//   node publish.js --slug <slug> --pr <n>
// Updates content/blog-state.json and the article record's status. Does not
// touch the generated pages, so no redeploy is needed.

const fs = require('fs');
const path = require('path');
const { loadState, saveState, ARTICLES_DIR } = require('./lib/state');
const { readJson, writeJson, log } = require('./lib/util');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
if (!args.slug) { console.error('usage: publish.js --slug <slug> [--pr <n>]'); process.exit(1); }

const now = new Date().toISOString();
const state = loadState();
let hit = false;
for (const iss of state.issues || []) {
  if (iss.slug === args.slug) {
    iss.status = 'published';
    iss.publishedAt = now;
    if (args.pr) iss.pr = Number(args.pr);
    hit = true;
  }
}
if (!hit) log(`warning: no issue with slug ${args.slug} in blog-state.json`);
saveState(state);

if (fs.existsSync(ARTICLES_DIR)) {
  for (const f of fs.readdirSync(ARTICLES_DIR)) {
    if (f.endsWith(`-${args.slug}.json`)) {
      const p = path.join(ARTICLES_DIR, f);
      const rec = readJson(p);
      rec.status = 'published';
      rec.publishedAt = now;
      if (args.pr) rec.pr = Number(args.pr);
      writeJson(p, rec);
    }
  }
}
log(`marked ${args.slug} as published${args.pr ? ` (PR #${args.pr})` : ''}`);
