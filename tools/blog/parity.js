#!/usr/bin/env node
'use strict';
// Prints whether this ISO week is a run week. Used by the workflow for its
// step summary; run.js applies the same rule itself unless --force is given.
//
// GitHub cron cannot say "every two weeks", so the workflow runs every Monday
// at 06:00 UTC and this parity gate skips alternate weeks. 06:00 UTC is 06:00
// UK in winter (GMT) and 07:00 UK in summer (BST); the cron does not shift
// with daylight saving.

const { loadConfig, isoWeek } = require('./lib/util');

const cfg = loadConfig();
const now = process.argv[2] ? new Date(process.argv[2]) : new Date();
const week = isoWeek(now);
const even = week % 2 === 0;
const run = cfg.weekParity === 'even' ? even : !even;
console.log(`ISO week ${week} (${even ? 'even' : 'odd'}); run weeks are ${cfg.weekParity}; ${run ? 'RUN' : 'SKIP'}`);
process.exit(0);
