'use strict';

/**
 * Freshness helper — Simply Black and White
 *
 * Injects an automated "last updated" date into public HTML pages so AI
 * crawlers and search engines can tell the content is current (not stale).
 *
 * How it works:
 *  - Public pages contain the token __LAST_UPDATED_ISO__ (machine date, e.g.
 *    2026-09-05) and __LAST_UPDATED_HUMAN__ (e.g. September 5, 2026).
 *  - On first request for a page, we read it, replace the tokens with the
 *    current date, and cache the result in memory.
 *  - The date resolves at server-start time. On Railway, a deploy restarts the
 *    server, so the date always reflects the most recent deploy — fully
 *    automated, zero manual maintenance.
 *
 * Safety:
 *  - If a file can't be read, the caller falls back to normal static serving.
 *  - Tokens are inert text; a failure never crashes the app.
 */

const fs = require('fs');

// Captured once when the server starts (≈ deploy time on Railway).
const BUILD_DATE = new Date();

const ISO_DATE = BUILD_DATE.toISOString().slice(0, 10); // YYYY-MM-DD
const HUMAN_DATE = BUILD_DATE.toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

// In-memory cache: absolute file path -> rendered HTML string.
const cache = new Map();

/**
 * Return the HTML for a page with freshness tokens replaced.
 * Reads + renders once, then serves from cache.
 *
 * @param {string} filePath - Absolute path to the HTML file.
 * @returns {string|null} - Rendered HTML, or null if the file can't be read.
 */
function renderWithFreshness(filePath) {
  if (cache.has(filePath)) {
    return cache.get(filePath);
  }

  let html;
  try {
    html = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error('[Freshness] Could not read file:', filePath, err.message);
    return null;
  }

  const rendered = html
    .split('__LAST_UPDATED_ISO__').join(ISO_DATE)
    .split('__LAST_UPDATED_HUMAN__').join(HUMAN_DATE);

  cache.set(filePath, rendered);
  return rendered;
}

module.exports = {
  renderWithFreshness,
  ISO_DATE,
  HUMAN_DATE,
  BUILD_DATE,
};
