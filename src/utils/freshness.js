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

/**
 * Verified public profiles for this business (schema.org "sameAs").
 *
 * This is the single source of truth for entity disambiguation — it tells
 * Google/AI engines that this website is the same entity as these profiles,
 * separating us from unrelated businesses with a similar name.
 *
 * TO ADD A PROFILE: paste the full public URL as a string in the array below.
 * Example once ready:
 *   'https://www.linkedin.com/company/simply-black-and-white',
 *   'https://www.google.com/maps/place/...'  (Google Business Profile share link)
 *
 * The list is injected wherever the token __SAME_AS_JSON__ appears, so you
 * only ever edit it here — every page updates automatically.
 */
const SAME_AS = [
  // Add verified profile URLs here (LinkedIn, Google Business Profile, etc.)
];

// Pre-serialized JSON array string for injection into JSON-LD schema.
const SAME_AS_JSON = JSON.stringify(SAME_AS);

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
    .split('__LAST_UPDATED_HUMAN__').join(HUMAN_DATE)
    .split('__SAME_AS_JSON__').join(SAME_AS_JSON);

  cache.set(filePath, rendered);
  return rendered;
}

module.exports = {
  renderWithFreshness,
  ISO_DATE,
  HUMAN_DATE,
  BUILD_DATE,
  SAME_AS,
  SAME_AS_JSON,
};
