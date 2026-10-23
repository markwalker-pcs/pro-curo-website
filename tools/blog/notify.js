#!/usr/bin/env node
'use strict';
/*
 * Email notifications for the blog editor, sent through Azure Communication
 * Services (resource in rg-procuro-website; see CLAUDE.md "Blog").
 *
 *   node notify.js published --slug <slug> --pr <n> --url <live url>
 *   node notify.js skip --reason "<text>"
 *   node notify.js failure --step "<name>" --error "<text>" --run-url <url>
 *
 * Environment (GitHub Actions secrets and variables, never in the repo):
 *   ACS_EMAIL_CONNECTION_STRING  secret, the ACS resource connection string
 *   BLOG_MAIL_FROM               variable, sender on the ACS-verified domain
 *   BLOG_NOTIFY_TO               variable, comma separated distribution list
 *                                (Abeer and Mark) for the social pack
 *   BLOG_ALERT_TO                variable, Mark's address for skip and failure
 *                                notices (falls back to BLOG_NOTIFY_TO)
 *
 * Without a connection string the script logs what it would have sent and
 * exits 0, so a missing mail set-up never blocks a publish.
 */

const fs = require('fs');
const path = require('path');
const { REPO_ROOT, CONTENT_ROOT, loadConfig, readText, escapeHtml, log } = require('./lib/util');
const { lintText } = require('./lib/lint');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { args[a.slice(2)] = argv[i + 1]; i++; } else args._.push(a);
  }
  return args;
}

function recipients(varValue) {
  return String(varValue || '').split(/[,;\s]+/).map(s => s.trim()).filter(Boolean).map(address => ({ address }));
}

function mdToHtml(md) {
  // Just enough for the social pack: headings, bullets, paragraphs, links.
  const esc = s => escapeHtml(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  const lines = md.split('\n');
  const out = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^## /.test(line)) { if (inList) { out.push('</ul>'); inList = false; } out.push(`<h2>${esc(line.slice(3))}</h2>`); }
    else if (/^# /.test(line)) { if (inList) { out.push('</ul>'); inList = false; } out.push(`<h1>${esc(line.slice(2))}</h1>`); }
    else if (/^- /.test(line)) { if (!inList) { out.push('<ul>'); inList = true; } out.push(`<li>${esc(line.slice(2))}</li>`); }
    else if (!line.trim()) { if (inList) { out.push('</ul>'); inList = false; } }
    else out.push(`<p>${esc(line)}</p>`);
  }
  if (inList) out.push('</ul>');
  return `<div style="font-family:Segoe UI,Arial,sans-serif;color:#2c3e50;line-height:1.6;max-width:720px">${out.join('\n')}</div>`;
}

async function send({ to, subject, text, html, attachments }) {
  const conn = process.env.ACS_EMAIL_CONNECTION_STRING;
  const from = process.env.BLOG_MAIL_FROM;
  const problems = lintText(`${subject}\n${text}`);
  if (problems.length) throw new Error(`Email text failed lint: ${problems.join('; ')}`);
  if (!to.length) { log('No recipients configured; nothing sent.'); return { sent: false, reason: 'no recipients' }; }
  if (!conn || !from) {
    log(`Mail not configured (ACS_EMAIL_CONNECTION_STRING / BLOG_MAIL_FROM). Would send "${subject}" to ${to.map(t => t.address).join(', ')}.`);
    return { sent: false, reason: 'mail not configured' };
  }
  const { EmailClient } = require('@azure/communication-email');
  const client = new EmailClient(conn);
  const message = {
    senderAddress: from,
    recipients: { to },
    content: { subject, plainText: text, html },
    attachments: attachments || []
  };
  const poller = await client.beginSend(message);
  const result = await poller.pollUntilDone();
  log(`Sent "${subject}" to ${to.length} recipient(s): ${result.status} (${result.id})`);
  return { sent: true, id: result.id, status: result.status };
}

async function published(args, cfg) {
  const slug = args.slug;
  if (!slug) throw new Error('--slug required');
  const packFile = path.join(CONTENT_ROOT, 'social-packs', `${slug}.md`);
  const md = readText(packFile);
  const recFile = fs.readdirSync(path.join(CONTENT_ROOT, 'articles')).find(f => f.endsWith(`-${slug}.json`));
  const rec = recFile ? JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, 'articles', recFile), 'utf8')) : null;
  const liveUrl = args.url || (rec ? `${cfg.siteUrl}${cfg.sectionPath}${rec.year}/${rec.slug}.html` : cfg.sectionUrl);
  const imgFile = rec ? path.join(REPO_ROOT, 'blog', String(rec.year), 'img', `${rec.slug}.png`) : null;
  const attachments = imgFile && fs.existsSync(imgFile)
    ? [{ name: `${slug}.png`, contentType: 'image/png', contentInBase64: fs.readFileSync(imgFile).toString('base64') }]
    : [];
  const intro = `The ${cfg.seriesName} article "${rec ? rec.title : slug}" is approved and live at ${liveUrl}${args.pr ? ` (pull request #${args.pr})` : ''}. The social pack is below and the social card is attached. Suggested times are in the pack.`;
  const text = `${intro}\n\n${md}`;
  const html = mdToHtml(`${intro}\n\n${md}`);
  return send({
    to: recipients(process.env.BLOG_NOTIFY_TO),
    subject: `${cfg.seriesName} issue ${rec ? rec.issue : ''}: ${rec ? rec.title : slug} is live, social pack attached`.replace(/\s+/g, ' '),
    text, html, attachments
  });
}

async function skip(args, cfg) {
  const reason = args.reason || 'no reason given';
  const text = `The fortnightly ${cfg.seriesName} editor ran and opened no pull request.\n\nReason: ${reason}\n\nNothing publishes this fortnight. The next scheduled run starts fresh. To run again now, use the workflow's manual trigger with force set to true.`;
  return send({
    to: recipients(process.env.BLOG_ALERT_TO || process.env.BLOG_NOTIFY_TO),
    subject: `${cfg.seriesName}: no issue this fortnight`,
    text, html: mdToHtml(text)
  });
}

async function failure(args, cfg) {
  const text = `The fortnightly ${cfg.seriesName} editor failed.\n\nStep: ${args.step || 'unknown'}\nError: ${args.error || 'see the run log'}\nRun: ${args['run-url'] || 'n/a'}\n\nNo pull request was opened and nothing was published. Fix the cause and rerun the workflow manually with force set to true.`;
  return send({
    to: recipients(process.env.BLOG_ALERT_TO || process.env.BLOG_NOTIFY_TO),
    subject: `${cfg.seriesName}: editor run failed at ${args.step || 'unknown step'}`,
    text, html: mdToHtml(text)
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = loadConfig();
  const cmd = args._[0];
  if (cmd === 'published') return published(args, cfg);
  if (cmd === 'skip') return skip(args, cfg);
  if (cmd === 'failure') return failure(args, cfg);
  throw new Error('usage: notify.js published|skip|failure ...');
}

main().then(r => log(JSON.stringify(r))).catch(err => {
  // eslint-disable-next-line no-console
  console.error('[blog] notify failed:', err.message);
  process.exit(1);
});
