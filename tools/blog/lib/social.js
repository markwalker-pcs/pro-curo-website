'use strict';
// Social pack: content/social-packs/<slug>.md with LinkedIn, Facebook,
// optional week-two LinkedIn, MailerLite subject, preheader and intro, all
// with UTM-tagged links, suggested posting times and the image path.

const path = require('path');
const { CONTENT_ROOT, writeText } = require('./util');
const { articleUrl, imageUrl } = require('./build');

function utmLink(cfg, rec, source, medium) {
  const u = new URL(articleUrl(cfg, rec));
  u.searchParams.set('utm_source', source);
  u.searchParams.set('utm_medium', medium);
  u.searchParams.set('utm_campaign', `${cfg.utm.campaignPrefix}${rec.issue}`);
  return u.toString();
}

function socialPack(cfg, rec) {
  const s = rec.social;
  const li = utmLink(cfg, rec, 'linkedin', 'social');
  const fb = utmLink(cfg, rec, 'facebook', 'social');
  const em = utmLink(cfg, rec, 'mailerlite', 'email');
  const img = imageUrl(cfg, rec);
  const imgRepo = `blog/${rec.year}/img/${rec.slug}.png`;
  const f = cfg.formats[rec.format];
  const md = `# Social pack: ${rec.title}

- Series: ${cfg.seriesName}, issue ${rec.issue} (${f.name})
- Article: ${articleUrl(cfg, rec)}
- Social card: ${imgRepo} (live at ${img} once merged; 1200 by 627 PNG)
- Suggested times (plan section 12): article live ${cfg.postingTimes.articleLive}; LinkedIn ${cfg.postingTimes.linkedin}; Facebook ${cfg.postingTimes.facebook}; email ${cfg.postingTimes.email}; optional second LinkedIn post ${cfg.postingTimes.linkedinWeekTwo}

## LinkedIn (company page, ${cfg.postingTimes.linkedin})

${s.linkedin.trim()}

${li}

${s.hashtags.join(' ')}

## Facebook (page, ${cfg.postingTimes.facebook})

${s.facebook.trim()}

${fb}

## LinkedIn, week two (optional, ${cfg.postingTimes.linkedinWeekTwo})

${s.linkedinWeekTwo.trim()}

${li}

## MailerLite (${cfg.postingTimes.email})

- Subject: ${s.emailSubject.trim()}
- Preheader: ${s.emailPreheader.trim()}

${s.emailIntro.trim()}

Read the full article: ${em}

## Why this matters (for excerpting)

${rec.whyThisMatters.map(b => `- ${b}`).join('\n')}
`;
  return md;
}

function writeSocialPack(cfg, rec) {
  const file = path.join(CONTENT_ROOT, 'social-packs', `${rec.slug}.md`);
  const md = socialPack(cfg, rec);
  writeText(file, md);
  return { file, md };
}

module.exports = { socialPack, writeSocialPack, utmLink };
