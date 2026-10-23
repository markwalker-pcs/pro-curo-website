'use strict';
// Social card: 1200 by 627 PNG rendered from templates/card.svg with resvg.
// Fixed layout, brand colours, our own logo. No third-party or AI imagery.

const fs = require('fs');
const path = require('path');
const { REPO_ROOT, TOOL_ROOT, escapeXml } = require('./util');

const FONT_FAMILY = "'Segoe UI', 'DejaVu Sans', 'Liberation Sans', Arial, sans-serif";

// Greedy wrap by estimated glyph width. Average glyph is about 0.52 em for the
// fonts above at bold weight; the width budget is 1056 px (72 to 1128).
function wrapTitle(title, fontSize, maxWidth = 1056) {
  const avg = fontSize * 0.54;
  const maxChars = Math.floor(maxWidth / avg);
  const words = String(title).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function layoutTitle(title) {
  // Try sizes from large to small until the title fits in four lines.
  for (const size of [60, 54, 48, 42, 36]) {
    const lines = wrapTitle(title, size);
    if (lines.length <= 4) return { size, lines };
  }
  const lines = wrapTitle(title, 36).slice(0, 4);
  lines[3] = lines[3].replace(/\s+\S*$/, '') + '…';
  return { size: 36, lines };
}

function buildSvg(cfg, { title, formatLabel, issue, dateUk }) {
  let svg = fs.readFileSync(path.join(TOOL_ROOT, 'templates', 'card.svg'), 'utf8');
  const logoPath = path.join(REPO_ROOT, 'img', 'logo-icon.jpg');
  const logo = fs.existsSync(logoPath) ? `data:image/jpeg;base64,${fs.readFileSync(logoPath).toString('base64')}` : '';
  const { size, lines } = layoutTitle(title);
  const lineHeight = Math.round(size * 1.18);
  const blockHeight = lines.length * lineHeight;
  // Title block centred vertically between the pill (y 228) and the footer rule (y 540).
  const top = 228 + Math.max(0, Math.floor((312 - blockHeight) / 2)) + size;
  const titleLines = lines.map((l, i) => `    <tspan x="72" y="${top + i * lineHeight}">${escapeXml(l)}</tspan>`).join('\n');
  const pillWidth = Math.max(120, Math.round(formatLabel.length * 13 + 44));
  const vars = {
    LOGO_DATA_URI: logo,
    FONT_FAMILY: escapeXml(FONT_FAMILY),
    SERIES_NAME: escapeXml(cfg.seriesName),
    SERIES_TAGLINE: escapeXml(cfg.seriesTagline.charAt(0).toUpperCase() + cfg.seriesTagline.slice(1)),
    FORMAT_PILL_WIDTH: pillWidth,
    FORMAT_PILL_TEXT_X: 72 + pillWidth / 2,
    FORMAT_LABEL: escapeXml(formatLabel.toUpperCase()),
    TITLE_SIZE: size,
    TITLE_LINES: titleLines,
    ISSUE_LINE: escapeXml(`Issue ${issue}  |  ${dateUk}`)
  };
  svg = svg.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return svg;
}

function renderPng(svg) {
  const { Resvg } = require('@resvg/resvg-js');
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
    font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' },
    background: '#1F4E79'
  });
  return r.render().asPng();
}

// Writes blog/<yyyy>/img/<slug>.png and returns {file, bytes}.
function writeCard(cfg, rec) {
  const svg = buildSvg(cfg, {
    title: rec.title,
    formatLabel: (cfg.formats[rec.format] || { label: rec.format }).label,
    issue: rec.issue,
    dateUk: require('./util').ukDate(rec.datePublished)
  });
  const png = renderPng(svg);
  const file = path.join(REPO_ROOT, 'blog', String(rec.year), 'img', `${rec.slug}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png);
  return { file, bytes: png.length };
}

module.exports = { wrapTitle, layoutTitle, buildSvg, renderPng, writeCard };
