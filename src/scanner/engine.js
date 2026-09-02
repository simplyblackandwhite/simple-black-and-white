'use strict';

const puppeteer = require('puppeteer');
const path = require('path');
const { analyzeFullAeo, analyzeSnapshotAeo, getPageEvalScript } = require('./aeo-analyzer');

// axe-core source path (injected into the page)
const AXE_SOURCE_PATH = path.resolve(
  __dirname, '../../node_modules/axe-core/axe.min.js'
);

// ─── Default Crawl Configuration ─────────────────────────────────────────────
const DEFAULT_CRAWL_OPTIONS = {
  maxPages: 50,
  maxDepth: 3,
  respectRobots: true,
  sameDomainOnly: true,
  handleAgeGate: false,
};

// ─── Disability Category Mapping ─────────────────────────────────────────────
// Maps axe-core rule IDs and tags to disability categories
const DISABILITY_CATEGORY_MAP = {
  visual: [
    'color-contrast', 'color-contrast-enhanced', 'image-alt', 'image-redundant-alt',
    'link-in-text-block', 'meta-viewport', 'focus-visible', 'target-size',
  ],
  auditory: [
    'video-caption', 'audio-caption', 'video-description',
  ],
  motor: [
    'bypass', 'keyboard', 'tabindex', 'focus-order-semantics',
    'nested-interactive', 'scrollable-region-focusable',
    'aria-hidden-focus', 'focus-visible',
  ],
  cognitive: [
    'heading-order', 'empty-heading', 'document-title', 'html-has-lang',
    'html-lang-valid', 'link-name', 'button-name', 'label', 'select-name',
    'landmark-one-main', 'region', 'page-has-heading-one',
  ],
};

/**
 * Determine which disability categories a violation affects.
 * @param {object} violation - axe-core violation object
 * @returns {string[]} - Array of category names
 */
function getDisabilityCategories(violation) {
  const categories = [];
  for (const [category, rules] of Object.entries(DISABILITY_CATEGORY_MAP)) {
    if (rules.includes(violation.id)) {
      categories.push(category);
    }
  }
  // If no specific mapping, infer from axe tags
  if (categories.length === 0) {
    const tags = violation.tags || [];
    if (tags.some(t => t.includes('sensory'))) categories.push('visual');
    if (tags.some(t => t.includes('keyboard'))) categories.push('motor');
    if (tags.some(t => t.includes('language') || t.includes('semantics'))) categories.push('cognitive');
    // Default: visual + cognitive (most common)
    if (categories.length === 0) categories.push('visual', 'cognitive');
  }
  return categories;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIGHT SCAN — Single page, public-facing, quick results
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run a light accessibility scan on a target URL.
 * Returns 2 human-impact risks, 2 technical risks, and an AEO snapshot.
 *
 * @param {string} url - Validated, sanitized URL to scan
 * @returns {Promise<object>} - Scan results
 */
async function runLightScan(url) {
  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
      ],
      timeout: 30000,
    });

    const page = await browser.newPage();

    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (compatible; SimplyBlackAndWhite-Scanner/1.0; +https://simplyblackandwhite.com)'
    );

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Inject axe-core
    await page.addScriptTag({ path: AXE_SOURCE_PATH });

    // Run axe-core analysis
    const axeResults = await page.evaluate(async () => {
      /* global axe */
      const results = await axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag2aaa', 'best-practice'],
        },
        resultTypes: ['violations'],
      });
      return results;
    });

    // Run AEO structural analysis
    const aeoData = await page.evaluate(getPageEvalScript());

    // Process axe results
    const violations = axeResults.violations || [];
    const processed = processViolations(violations);
    const aeoSnapshot = analyzeSnapshotAeo(aeoData);

    return {
      success: true,
      url,
      timestamp: new Date().toISOString(),
      summary: {
        totalIssues: violations.length,
        critical: processed.counts.critical,
        serious: processed.counts.serious,
        moderate: processed.counts.moderate,
        minor: processed.counts.minor,
        humanRisks: processed.humanRisks,
        technicalRisks: processed.technicalRisks,
      },
      aeo: aeoSnapshot,
    };
  } catch (err) {
    if (err.message.includes('net::ERR_')) {
      throw new Error('This site has protections that prevent automated scanning. No worries — we can still review it manually during a free consultation.');
    }
    if (err.message.includes('timeout') || err.message.includes('Timeout')) {
      throw new Error('This site took longer than expected to load. Some sites are tricky for automated tools — we can review it personally during a free consultation.');
    }
    throw new Error('We ran into a hiccup scanning that site. Some pages need a human touch — book a free consultation and we\'ll take a look together.');
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FULL SCAN — Multi-page crawl with depth tracking
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run a full multi-page accessibility scan.
 * Crawls internal links up to configured depth, runs axe-core on every page,
 * and aggregates results with per-page and site-wide metrics.
 *
 * @param {string} url - Validated, sanitized seed URL
 * @param {object} options - Crawl configuration options
 * @param {function} onProgress - Optional callback for progress updates
 * @returns {Promise<object>} - Complete multi-page scan results
 */
async function runFullScan(url, options = {}, onProgress = null) {
  const config = { ...DEFAULT_CRAWL_OPTIONS, ...options };
  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
      ],
      timeout: 60000,
    });

    // ─── Step 1: Parse robots.txt if configured ────────────────
    const seedUrl = new URL(url);
    const baseDomain = seedUrl.hostname;
    let disallowedPaths = [];

    if (config.respectRobots) {
      disallowedPaths = await fetchRobotsTxt(browser, seedUrl.origin);
    }

    // ─── Step 1b: Discover pages from sitemap.xml ──────────────
    let sitemapUrls = [];
    try {
      sitemapUrls = await fetchSitemap(browser, seedUrl.origin, baseDomain);
    } catch (e) {
      // Non-blocking — proceed without sitemap
    }

    // ─── Step 2: Crawl and scan pages ──────────────────────────
    const visited = new Set();
    const queue = [{ url: normalizeUrl(url, seedUrl.origin), depth: 0 }];

    // Seed queue with sitemap URLs (at depth 1 — they're directly linked from sitemap)
    for (const sitemapUrl of sitemapUrls) {
      const normalized = normalizeUrl(sitemapUrl, seedUrl.origin);
      if (!queue.some(q => q.url === normalized)) {
        queue.push({ url: normalized, depth: 1 });
      }
    }

    const pageResults = [];

    while (queue.length > 0 && visited.size < config.maxPages) {
      const { url: currentUrl, depth: currentDepth } = queue.shift();

      // Skip if already visited
      const normalizedCurrent = normalizeUrl(currentUrl, seedUrl.origin);
      if (visited.has(normalizedCurrent)) continue;
      visited.add(normalizedCurrent);

      // Skip if blocked by robots.txt
      if (config.respectRobots && isDisallowed(normalizedCurrent, disallowedPaths, seedUrl.origin)) {
        continue;
      }

      // Progress callback
      if (onProgress) {
        onProgress({
          phase: 'scanning',
          currentPage: visited.size,
          totalQueued: visited.size + queue.length,
          maxPages: config.maxPages,
          currentUrl: normalizedCurrent,
          depth: currentDepth,
        });
      }

      // Scan this page
      try {
        const pageResult = await scanSinglePage(browser, normalizedCurrent, currentDepth, config);
        pageResults.push(pageResult);

        // Discover new links (only if we haven't hit max depth)
        if (currentDepth < config.maxDepth) {
          const newLinks = await discoverLinks(browser, normalizedCurrent, baseDomain, config.sameDomainOnly);

          for (const link of newLinks) {
            const normalizedLink = normalizeUrl(link, seedUrl.origin);
            if (!visited.has(normalizedLink) && !queue.some(q => q.url === normalizedLink)) {
              queue.push({ url: normalizedLink, depth: currentDepth + 1 });
            }
          }
        }
      } catch (pageErr) {
        // Non-blocking: log failed page but continue crawling
        pageResults.push({
          url: normalizedCurrent,
          depth: currentDepth,
          error: pageErr.message,
          issues: [],
          violations: [],
          aeo: null,
          pageTitle: '',
          summary: { totalIssues: 0, critical: 0, serious: 0, moderate: 0, minor: 0 },
        });
      }
    }

    // ─── Step 3: Aggregate results ─────────────────────────────
    const aggregated = aggregateResults(pageResults, url, config);

    return aggregated;
  } catch (err) {
    if (err.message.includes('net::ERR_')) {
      throw new Error('This site has protections that prevent automated scanning. Try a different URL or check that the site is publicly accessible.');
    }
    if (err.message.includes('timeout') || err.message.includes('Timeout')) {
      throw new Error('The page took too long to load. The site may be too heavy or blocking headless browsers.');
    }
    throw new Error('Scan failed: ' + err.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// ─── Single Page Scanner ─────────────────────────────────────────────────────

/**
 * Scan a single page within the multi-page crawl.
 * Runs axe-core and AEO analysis, returns per-page results.
 */
async function scanSinglePage(browser, url, depth, config) {
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    page.setDefaultNavigationTimeout(45000);

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });

    // Wait for page to settle
    try {
      await page.waitForNetworkIdle({ idleTime: 1500, timeout: 10000 });
    } catch (e) {
      // Proceed anyway — DOM is loaded
    }

    // Attempt age gate bypass if enabled
    if (config && config.handleAgeGate) {
      await attemptAgeGateBypass(page);
    }

    const pageTitle = await page.title();

    // Inject axe-core and run analysis
    await page.addScriptTag({ path: AXE_SOURCE_PATH });

    const axeResults = await page.evaluate(async () => {
      /* global axe */
      const results = await axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag2aaa', 'best-practice'],
        },
        resultTypes: ['violations'],
        elementRef: false,
      });
      return results;
    });

    // AEO analysis
    const aeoData = await page.evaluate(getPageEvalScript());
    const aeoFull = analyzeFullAeo(aeoData);

    // Process violations
    const violations = axeResults.violations || [];
    const fullIssues = processFullViolations(violations, pageTitle, url);

    // Severity counts
    const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    for (const v of violations) {
      counts[v.impact] = (counts[v.impact] || 0) + 1;
    }

    // WCAG level counts
    const wcagLevels = { A: 0, AA: 0, AAA: 0, 'Best Practice': 0 };
    for (const v of violations) {
      const level = extractWcagLevel(v.tags);
      wcagLevels[level] = (wcagLevels[level] || 0) + 1;
    }

    // Disability category counts
    const disabilityCounts = { visual: 0, auditory: 0, motor: 0, cognitive: 0 };
    for (const v of violations) {
      const cats = getDisabilityCategories(v);
      for (const cat of cats) {
        disabilityCounts[cat] = (disabilityCounts[cat] || 0) + 1;
      }
    }

    // Detect platform (only on depth 0 — seed page)
    let platform = null;
    if (depth === 0) {
      platform = await detectPlatform(page);
    }

    // Detect last-modified (only on depth 0)
    let siteLastUpdated = null;
    if (depth === 0) {
      siteLastUpdated = await detectLastModified(page, url);
    }

    return {
      url,
      depth,
      pageTitle,
      platform,
      siteLastUpdated,
      issues: fullIssues,
      violations,
      aeo: aeoFull,
      summary: {
        totalIssues: violations.length,
        ...counts,
      },
      wcagLevels,
      disabilityCounts,
    };
  } finally {
    await page.close();
  }
}

// ─── Link Discovery ──────────────────────────────────────────────────────────

/**
 * Discover all internal links on a page.
 * Filters to same-domain, skips anchors, files, and duplicates.
 */
async function discoverLinks(browser, url, baseDomain, sameDomainOnly) {
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    const links = await page.evaluate((baseHost, sameOnly) => {
      const anchors = document.querySelectorAll('a[href]');
      const found = [];
      const seen = new Set();

      // Helper: strip www. for domain comparison
      function stripWww(host) { return host.replace(/^www\./, ''); }

      for (const a of anchors) {
        try {
          const href = a.href; // Resolved absolute URL
          if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;

          const parsed = new URL(href);

          // Same-domain check (www-agnostic)
          if (sameOnly && stripWww(parsed.hostname) !== stripWww(baseHost)) continue;

          // Skip file downloads
          const ext = parsed.pathname.split('.').pop().toLowerCase();
          if (['pdf', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'mp4', 'mp3', 'zip', 'doc', 'docx', 'xls', 'xlsx', 'css', 'js'].includes(ext)) continue;

          // Normalize: strip hash, trailing slash variations
          const clean = parsed.origin + parsed.pathname.replace(/\/$/, '') + parsed.search;

          if (!seen.has(clean)) {
            seen.add(clean);
            found.push(clean);
          }
        } catch (e) {
          // Invalid URL — skip
        }
      }

      return found;
    }, baseDomain, sameDomainOnly);

    return links;
  } catch (e) {
    return []; // Non-blocking — just return no links for this page
  } finally {
    await page.close();
  }
}

// ─── Robots.txt Handling ─────────────────────────────────────────────────────

/**
 * Fetch and parse robots.txt for disallowed paths.
 * Returns an array of path prefixes that are disallowed for all user-agents.
 */
async function fetchRobotsTxt(browser, origin) {
  const page = await browser.newPage();

  try {
    const robotsUrl = origin + '/robots.txt';
    const response = await page.goto(robotsUrl, { timeout: 10000, waitUntil: 'domcontentloaded' });

    if (!response || response.status() !== 200) return [];

    const text = await page.evaluate(() => document.body.innerText);
    const lines = text.split('\n');
    const disallowed = [];
    let inWildcardBlock = false;

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();

      if (trimmed.startsWith('user-agent:')) {
        const agent = trimmed.replace('user-agent:', '').trim();
        inWildcardBlock = (agent === '*');
      }

      if (inWildcardBlock && trimmed.startsWith('disallow:')) {
        const path = line.trim().replace(/^disallow:\s*/i, '').trim();
        if (path && path !== '/') {
          disallowed.push(path);
        }
      }
    }

    return disallowed;
  } catch (e) {
    return []; // Can't fetch robots.txt — proceed without restrictions
  } finally {
    await page.close();
  }
}

/**
 * Fetch and parse sitemap.xml to discover all site pages.
 * Handles sitemap indexes (references to sub-sitemaps).
 * Returns an array of page URLs found.
 */
async function fetchSitemap(browser, origin, baseDomain) {
  const page = await browser.newPage();
  const urls = [];

  try {
    const sitemapLocations = [
      origin + '/sitemap.xml',
      origin + '/sitemap_index.xml',
      origin + '/sitemap_0.xml',
    ];

    const processedSitemaps = new Set();

    async function parseSitemap(sitemapUrl) {
      if (processedSitemaps.has(sitemapUrl)) return;
      processedSitemaps.add(sitemapUrl);

      try {
        const response = await page.goto(sitemapUrl, { timeout: 10000, waitUntil: 'domcontentloaded' });
        if (!response || response.status() !== 200) return;

        const content = await page.evaluate(() => document.body.innerText || document.documentElement.outerHTML);
        const locMatches = content.match(/<loc>(.*?)<\/loc>/gi) || [];

        for (const match of locMatches) {
          const url = match.replace(/<\/?loc>/gi, '').trim();
          if (!url) continue;

          // Check if this is a sub-sitemap reference
          if (url.endsWith('.xml') || url.includes('sitemap')) {
            await parseSitemap(url);
            continue;
          }

          try {
            const parsed = new URL(url);
            const host = parsed.hostname.replace(/^www\./, '');
            const base = baseDomain.replace(/^www\./, '');
            if (host !== base) continue;

            const ext = parsed.pathname.split('.').pop().toLowerCase();
            if (['pdf', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'mp4', 'xml', 'css', 'js'].includes(ext)) continue;

            urls.push(url);
          } catch (e) {
            // Invalid URL — skip
          }
        }
      } catch (e) {
        // This sitemap location didn't work
      }
    }

    for (const location of sitemapLocations) {
      await parseSitemap(location);
      if (urls.length > 0) break;
    }

    return urls;
  } catch (e) {
    return [];
  } finally {
    await page.close();
  }
}

/**
 * Check if a URL is disallowed by robots.txt rules.
 */
function isDisallowed(url, disallowedPaths, origin) {
  if (disallowedPaths.length === 0) return false;

  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;

    for (const disallowed of disallowedPaths) {
      if (pathname.startsWith(disallowed)) return true;
    }
  } catch (e) {
    // Invalid URL — skip
  }

  return false;
}

// ─── Results Aggregation ─────────────────────────────────────────────────────

/**
 * Aggregate per-page results into a site-wide overview.
 */
function aggregateResults(pageResults, seedUrl, config) {
  const successfulPages = pageResults.filter(p => !p.error);
  const failedPages = pageResults.filter(p => p.error);

  // Site-wide issue totals
  const siteCounts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  let totalIssues = 0;
  const allIssues = [];

  for (const page of successfulPages) {
    totalIssues += page.summary.totalIssues;
    siteCounts.critical += page.summary.critical;
    siteCounts.serious += page.summary.serious;
    siteCounts.moderate += page.summary.moderate;
    siteCounts.minor += page.summary.minor;

    for (const issue of page.issues) {
      allIssues.push(issue);
    }
  }

  // WCAG level aggregation across all pages
  const wcagTotals = { A: 0, AA: 0, AAA: 0, 'Best Practice': 0 };
  for (const page of successfulPages) {
    if (page.wcagLevels) {
      for (const [level, count] of Object.entries(page.wcagLevels)) {
        wcagTotals[level] = (wcagTotals[level] || 0) + count;
      }
    }
  }

  // WCAG compliance percentages (issues per level as % of total)
  const totalWcagIssues = wcagTotals.A + wcagTotals.AA + wcagTotals.AAA + wcagTotals['Best Practice'];
  const wcagCompliance = {
    levelA: totalWcagIssues > 0 ? Math.round((wcagTotals.A / totalWcagIssues) * 1000) / 10 : 0,
    levelAA: totalWcagIssues > 0 ? Math.round((wcagTotals.AA / totalWcagIssues) * 1000) / 10 : 0,
    levelAAA: totalWcagIssues > 0 ? Math.round((wcagTotals.AAA / totalWcagIssues) * 1000) / 10 : 0,
    counts: wcagTotals,
  };

  // Disability category totals
  const disabilityTotals = { visual: 0, auditory: 0, motor: 0, cognitive: 0 };
  for (const page of successfulPages) {
    if (page.disabilityCounts) {
      for (const [cat, count] of Object.entries(page.disabilityCounts)) {
        disabilityTotals[cat] = (disabilityTotals[cat] || 0) + count;
      }
    }
  }

  // Average issues by depth level
  const depthGroups = {};
  for (const page of successfulPages) {
    if (!depthGroups[page.depth]) depthGroups[page.depth] = [];
    depthGroups[page.depth].push(page.summary.totalIssues);
  }

  const issuesByDepth = {};
  for (const [depth, issueCounts] of Object.entries(depthGroups)) {
    const avg = Math.round(issueCounts.reduce((a, b) => a + b, 0) / issueCounts.length);
    const total = issueCounts.reduce((a, b) => a + b, 0);
    issuesByDepth[depth] = { average: avg, total, pageCount: issueCounts.length };
  }

  // Most common issues (grouped by rule ID across all pages)
  const ruleMap = {};
  for (const issue of allIssues) {
    if (!ruleMap[issue.id]) {
      ruleMap[issue.id] = {
        id: issue.id,
        description: issue.plainDescription,
        howToFix: issue.howToFix,
        impact: issue.impact,
        wcagLevel: issue.wcagLevel,
        totalInstances: 0,
        pagesAffected: 0,
        category: issue.category,
      };
    }
    ruleMap[issue.id].totalInstances += issue.instanceCount;
    ruleMap[issue.id].pagesAffected += 1;
  }

  const commonIssues = Object.values(ruleMap)
    .sort((a, b) => b.pagesAffected - a.pagesAffected || b.totalInstances - a.totalInstances)
    .slice(0, 10);

  // Overall accessibility score (0–100)
  // Based on UNIQUE violations (by rule ID), not raw instance count.
  // This prevents a single issue repeated on 50 pages from tanking the score unfairly.
  // The full issue list still records EVERY instance on EVERY page — this is just the health summary.
  const uniqueRules = Object.values(ruleMap);
  const totalUniqueViolations = uniqueRules.length;

  // Weight each unique violation by severity + how widespread it is
  let scoreDeductions = 0;
  for (const rule of uniqueRules) {
    const severityWeight = rule.impact === 'critical' ? 12 : rule.impact === 'serious' ? 7 : rule.impact === 'moderate' ? 3 : 1;
    // Spread factor: affects 1 page = 1x, affects all pages = 2x (logarithmic scale)
    const spreadRatio = successfulPages.length > 1 ? rule.pagesAffected / successfulPages.length : 1;
    const spreadMultiplier = 1 + (spreadRatio * 0.5); // 1.0 to 1.5x
    scoreDeductions += severityWeight * spreadMultiplier;
  }

  // Normalize: scale to 0-100 where a "terrible" site (200+ deduction points) still shows ~10-15%
  // A perfect site = 100, mild issues = 70-90, moderate = 40-70, severe = 15-40, catastrophic = 0-15
  const maxDeductions = 150;
  const accessibilityScore = Math.max(0, Math.round(100 - (scoreDeductions / maxDeductions) * 100));

  // AEO: use seed page (depth 0) AEO as primary
  const seedPage = successfulPages.find(p => p.depth === 0);
  const aeo = seedPage ? seedPage.aeo : null;
  const platform = seedPage ? seedPage.platform : null;
  const siteLastUpdated = seedPage ? seedPage.siteLastUpdated : null;
  const pageTitle = seedPage ? seedPage.pageTitle : '';

  // Human risks and technical risks from seed page
  const humanRisks = allIssues.slice(0, 2).map(i => i.plainDescription);
  const technicalRisks = allIssues.slice(0, 2).map(i => i.technicalDescription);

  return {
    success: true,
    scanType: 'full',
    url: seedUrl,
    pageTitle,
    platform,
    siteLastUpdated,
    timestamp: new Date().toISOString(),

    // Crawl metadata
    crawl: {
      pagesScanned: successfulPages.length,
      pagesFailed: failedPages.length,
      maxDepthReached: Math.max(...successfulPages.map(p => p.depth), 0),
      config,
    },

    // Site-wide summary
    summary: {
      totalIssues,
      critical: siteCounts.critical,
      serious: siteCounts.serious,
      moderate: siteCounts.moderate,
      minor: siteCounts.minor,
      humanRisks,
      technicalRisks,
      accessibilityScore,
    },

    // Overview data (for the Overview tab)
    overview: {
      accessibilityScore,
      wcagCompliance,
      disabilityCategories: disabilityTotals,
      issuesByDepth,
      commonIssues,
    },

    // AEO (from seed page)
    aeo,

    // All issues (flattened, for the Issues tab)
    issues: allIssues,

    // Per-page breakdown (for drill-down)
    pages: pageResults.map(p => ({
      url: p.url,
      depth: p.depth,
      pageTitle: p.pageTitle,
      error: p.error || null,
      summary: p.summary,
      wcagLevels: p.wcagLevels || null,
      disabilityCounts: p.disabilityCounts || null,
      issueCount: p.issues ? p.issues.length : 0,
      aeoScore: p.aeo ? p.aeo.score : null,
    })),
  };
}

// ─── Platform Detection ──────────────────────────────────────────────────────

async function detectPlatform(page) {
  return await page.evaluate(() => {
    const doc = document;
    const html = doc.documentElement.outerHTML.substring(0, 50000);
    const meta = (name) => {
      const el = doc.querySelector('meta[name="' + name + '"]');
      return el ? el.content : '';
    };
    const generator = meta('generator').toLowerCase();

    if (generator.includes('wordpress') || doc.querySelector('link[href*="wp-content"]') || doc.querySelector('script[src*="wp-includes"]') || html.includes('wp-content/')) {
      return { name: 'WordPress', confidence: 'high', type: 'cms' };
    }
    if (html.includes('cdn.shopify.com') || html.includes('Shopify.theme') || doc.querySelector('link[href*="shopify"]')) {
      return { name: 'Shopify', confidence: 'high', type: 'ecommerce' };
    }
    if (html.includes('wix.com') || html.includes('wixstatic.com') || doc.querySelector('meta[name="generator"][content*="Wix"]')) {
      return { name: 'Wix', confidence: 'high', type: 'builder' };
    }
    if (html.includes('squarespace.com') || html.includes('static.squarespace') || generator.includes('squarespace')) {
      return { name: 'Squarespace', confidence: 'high', type: 'builder' };
    }
    if (html.includes('webflow.com') || doc.querySelector('html[data-wf-site]') || html.includes('assets.website-files.com')) {
      return { name: 'Webflow', confidence: 'high', type: 'builder' };
    }
    if (html.includes('godaddy.com') || html.includes('secureserver.net') || html.includes('wsimg.com')) {
      return { name: 'GoDaddy Builder', confidence: 'medium', type: 'builder' };
    }
    if (generator.includes('drupal') || doc.querySelector('link[href*="/sites/default/"]') || html.includes('Drupal.settings')) {
      return { name: 'Drupal', confidence: 'high', type: 'cms' };
    }
    if (generator.includes('joomla') || html.includes('/media/jui/') || doc.querySelector('script[src*="joomla"]')) {
      return { name: 'Joomla', confidence: 'high', type: 'cms' };
    }
    if (doc.getElementById('__next') || html.includes('_next/static')) {
      return { name: 'Next.js', confidence: 'medium', type: 'framework' };
    }
    if (doc.getElementById('___gatsby') || html.includes('gatsby')) {
      return { name: 'Gatsby', confidence: 'medium', type: 'framework' };
    }
    if (html.includes('hubspot') || html.includes('hs-scripts.com')) {
      return { name: 'HubSpot', confidence: 'medium', type: 'cms' };
    }
    if (html.includes('woocommerce') || html.includes('wc-blocks')) {
      return { name: 'WooCommerce (WordPress)', confidence: 'high', type: 'ecommerce' };
    }

    return { name: 'Unknown / Custom', confidence: 'low', type: 'unknown' };
  });
}

// ─── Last Modified Detection ─────────────────────────────────────────────────

async function detectLastModified(page, url) {
  const lastModified = await page.evaluate(() => {
    var meta = document.querySelector('meta[name="last-modified"]');
    if (meta && meta.content) return { source: 'meta', date: meta.content };

    var ogModified = document.querySelector('meta[property="article:modified_time"]');
    if (ogModified && ogModified.content) return { source: 'og:modified', date: ogModified.content };

    var ogPublished = document.querySelector('meta[property="article:published_time"]');
    if (ogPublished && ogPublished.content) return { source: 'og:published', date: ogPublished.content };

    var footerText = '';
    var footer = document.querySelector('footer');
    if (footer) footerText = footer.textContent;
    var yearMatch = footerText.match(/©\s*(\d{4})/);
    if (yearMatch) return { source: 'copyright', date: yearMatch[1] };

    return null;
  });

  let httpLastModified = null;
  try {
    const headResponse = await page.evaluate(async (targetUrl) => {
      try {
        const r = await fetch(targetUrl, { method: 'HEAD' });
        return r.headers.get('last-modified');
      } catch (e) { return null; }
    }, url);
    if (headResponse) httpLastModified = { source: 'http-header', date: headResponse };
  } catch (e) {
    // Non-blocking
  }

  return httpLastModified || lastModified || null;
}

// ─── Age Gate Bypass ─────────────────────────────────────────────────────────

/**
 * Attempt to bypass common age gate / age verification patterns.
 * Handles: yes/no buttons, DOB forms, year dropdowns, checkboxes, date inputs.
 * Best-effort — not all age gates can be bypassed programmatically.
 *
 * @param {object} page - Puppeteer page instance
 * @returns {Promise<boolean>} - Whether an age gate was detected and handled
 */
async function attemptAgeGateBypass(page) {
  try {
    const bypassed = await page.evaluate(() => {
      let handled = false;

      // ─── Pattern 1: "Yes" / "Enter" / "I am 21+" buttons ────
      const buttonTexts = [
        'yes', 'enter', 'i am', 'i\'m over', 'i\'m of legal',
        'i am of legal', 'i am 21', 'i am 18', 'i\'m 21', 'i\'m 18',
        'verify', 'confirm age', 'enter site', 'continue',
      ];
      const allButtons = document.querySelectorAll('button, a[role="button"], input[type="submit"], input[type="button"], [role="button"]');
      for (const btn of allButtons) {
        const text = (btn.textContent || btn.value || '').toLowerCase().trim();
        if (buttonTexts.some(t => text.includes(t))) {
          btn.click();
          handled = true;
          break;
        }
      }

      // ─── Pattern 2: Checkbox "I am of legal age" + submit ───
      if (!handled) {
        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
        for (const cb of checkboxes) {
          const label = cb.closest('label') || document.querySelector('label[for="' + cb.id + '"]');
          const labelText = (label ? label.textContent : '').toLowerCase();
          if (labelText.includes('age') || labelText.includes('21') || labelText.includes('18') || labelText.includes('legal')) {
            cb.checked = true;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
            handled = true;
            // Now find a submit button nearby
            const form = cb.closest('form');
            if (form) {
              const submit = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
              if (submit) submit.click();
            }
            break;
          }
        }
      }

      // ─── Pattern 3: Date of birth form (dropdowns) ──────────
      if (!handled) {
        const selects = document.querySelectorAll('select');
        let monthSelect = null, daySelect = null, yearSelect = null;

        for (const sel of selects) {
          const name = (sel.name || sel.id || '').toLowerCase();
          const label = document.querySelector('label[for="' + sel.id + '"]');
          const labelText = (label ? label.textContent : '').toLowerCase();
          const combined = name + ' ' + labelText;

          if (combined.includes('month') || combined.includes('mm')) monthSelect = sel;
          else if (combined.includes('day') || combined.includes('dd')) daySelect = sel;
          else if (combined.includes('year') || combined.includes('yyyy') || combined.includes('yy')) yearSelect = sel;
        }

        // Also detect by option values (if options are 1-12 = month, 1-31 = day, 1900-2010 = year)
        if (!monthSelect || !daySelect || !yearSelect) {
          for (const sel of selects) {
            const opts = Array.from(sel.options).map(o => parseInt(o.value)).filter(v => !isNaN(v));
            if (opts.length >= 10 && opts.length <= 12 && Math.max(...opts) <= 12) monthSelect = monthSelect || sel;
            else if (opts.length >= 28 && opts.length <= 31 && Math.max(...opts) <= 31) daySelect = daySelect || sel;
            else if (opts.some(v => v > 1900 && v < 2010)) yearSelect = yearSelect || sel;
          }
        }

        if (yearSelect) {
          // Set to a year that makes the user 25+ (born 2001 for 2026)
          const targetYear = new Date().getFullYear() - 25;
          const yearOpts = Array.from(yearSelect.options);
          const match = yearOpts.find(o => parseInt(o.value) === targetYear) ||
                        yearOpts.find(o => parseInt(o.value) <= targetYear && parseInt(o.value) > 1950);
          if (match) {
            yearSelect.value = match.value;
            yearSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }
          handled = true;
        }
        if (monthSelect) {
          monthSelect.value = monthSelect.options[1] ? monthSelect.options[1].value : '1';
          monthSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (daySelect) {
          daySelect.value = daySelect.options[1] ? daySelect.options[1].value : '1';
          daySelect.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Submit the DOB form
        if (handled) {
          const form = (yearSelect || monthSelect || daySelect).closest('form');
          if (form) {
            const submit = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
            if (submit) submit.click();
            else form.submit();
          }
        }
      }

      // ─── Pattern 4: Single date input (type="date" or text with date pattern) ──
      if (!handled) {
        const dateInputs = document.querySelectorAll('input[type="date"], input[placeholder*="MM"], input[placeholder*="mm/dd"], input[placeholder*="YYYY"]');
        for (const input of dateInputs) {
          const targetYear = new Date().getFullYear() - 25;
          if (input.type === 'date') {
            input.value = targetYear + '-01-15';
          } else {
            input.value = '01/15/' + targetYear;
          }
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          handled = true;

          const form = input.closest('form');
          if (form) {
            const submit = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
            if (submit) submit.click();
            else form.submit();
          }
          break;
        }
      }

      // ─── Pattern 5: Year-only input field ───────────────────
      if (!handled) {
        const inputs = document.querySelectorAll('input[type="number"], input[type="text"]');
        for (const input of inputs) {
          const name = (input.name || input.id || input.placeholder || '').toLowerCase();
          if (name.includes('year') || name.includes('birth')) {
            const targetYear = new Date().getFullYear() - 25;
            input.value = targetYear.toString();
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            handled = true;

            const form = input.closest('form');
            if (form) {
              const submit = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
              if (submit) submit.click();
            }
            break;
          }
        }
      }

      return handled;
    });

    if (bypassed) {
      // Wait for the page to transition after age gate bypass
      try {
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 });
      } catch (e) {
        // May not navigate — some gates just hide an overlay
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    return bypassed;
  } catch (e) {
    // Non-blocking — if bypass fails, continue scanning the page as-is
    return false;
  }
}

// ─── URL Utilities ───────────────────────────────────────────────────────────

/**
 * Normalize a URL: resolve relative paths, strip fragments, consistent trailing slash.
 * Also normalizes www vs non-www to prevent duplicate crawling.
 */
function normalizeUrl(url, origin) {
  try {
    const resolved = new URL(url, origin);
    // Strip hash/fragment
    resolved.hash = '';
    // Normalize www: strip www. but preserve any port (use host, not hostname)
    const host = resolved.host.replace(/^www\./, '');
    // Remove trailing slash for consistency (except root)
    let pathname = resolved.pathname;
    if (pathname !== '/' && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    return resolved.protocol + '//' + host + pathname + resolved.search;
  } catch (e) {
    return url;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED HELPERS — Violation processing (unchanged from before)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Process axe violations into human-impact and technical risk summaries.
 */
function processViolations(violations) {
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const humanIssues = [];
  const technicalIssues = [];

  const sorted = [...violations].sort((a, b) => {
    const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
    return (order[a.impact] || 3) - (order[b.impact] || 3);
  });

  for (const v of sorted) {
    counts[v.impact] = (counts[v.impact] || 0) + 1;

    const nodeCount = v.nodes ? v.nodes.length : 0;
    const humanDesc = mapToHumanRisk(v);
    const techDesc = mapToTechnicalRisk(v, nodeCount);

    if (humanDesc && humanIssues.length < 2) {
      humanIssues.push(humanDesc);
    }
    if (techDesc && technicalIssues.length < 2) {
      technicalIssues.push(techDesc);
    }
  }

  if (humanIssues.length === 0) {
    humanIssues.push('No critical barriers detected for human visitors in this scan.');
  }
  if (technicalIssues.length === 0) {
    technicalIssues.push('No major code-level accessibility issues found.');
  }

  return {
    counts,
    humanRisks: humanIssues.slice(0, 2),
    technicalRisks: technicalIssues.slice(0, 2),
  };
}

function mapToHumanRisk(violation) {
  const id = violation.id;
  const impact = violation.impact;

  const humanMap = {
    'color-contrast': 'Some text on this site is difficult to read for people with low vision due to insufficient color contrast.',
    'image-alt': 'Images on this page lack descriptions, making content invisible to screen reader users and people who can\'t load images.',
    'link-name': 'Some links don\'t have accessible names — screen reader users won\'t know where those links go.',
    'button-name': 'Some buttons aren\'t labeled, making key interactions impossible for people using assistive technology.',
    'label': 'Form fields are missing labels, so people using screen readers can\'t tell what information to enter.',
    'heading-order': 'The page\'s heading structure is inconsistent, making it hard for screen reader users to navigate and understand the content hierarchy.',
    'document-title': 'This page has no title, making it impossible for screen reader users to identify the page when switching tabs.',
    'html-has-lang': 'The page doesn\'t declare its language, so screen readers may mispronounce all content.',
    'bypass': 'There\'s no way to skip repetitive navigation, forcing keyboard-only users to tab through every menu item on every page.',
    'landmark-one-main': 'The page has no main content landmark, making it difficult for assistive technology to identify the primary content area.',
  };

  if (humanMap[id]) return humanMap[id];

  if (impact === 'critical' || impact === 'serious') {
    return `A ${impact} barrier exists that may prevent some visitors from using parts of this page (${violation.help}).`;
  }

  return null;
}

function mapToTechnicalRisk(violation, nodeCount) {
  const id = violation.id;

  const techMap = {
    'color-contrast': `${nodeCount} element${nodeCount !== 1 ? 's' : ''} fail${nodeCount === 1 ? 's' : ''} WCAG contrast ratio requirements.`,
    'image-alt': `${nodeCount} <img> tag${nodeCount !== 1 ? 's' : ''} missing alt attributes.`,
    'link-name': `${nodeCount} <a> element${nodeCount !== 1 ? 's' : ''} without discernible text or aria-label.`,
    'button-name': `${nodeCount} <button> element${nodeCount !== 1 ? 's' : ''} lacking accessible names.`,
    'label': `${nodeCount} form input${nodeCount !== 1 ? 's' : ''} without associated <label> elements.`,
    'heading-order': 'Heading levels skip one or more ranks (e.g., h2 → h4), breaking document outline.',
    'document-title': 'Missing <title> element in <head>.',
    'html-has-lang': 'Missing lang attribute on the <html> element.',
    'bypass': 'No skip-navigation link or landmark structure for keyboard bypass.',
    'landmark-one-main': 'Page lacks a <main> landmark element.',
    'region': `${nodeCount} content block${nodeCount !== 1 ? 's' : ''} outside any landmark region.`,
    'aria-hidden-focus': `${nodeCount} focusable element${nodeCount !== 1 ? 's' : ''} hidden from assistive tech but still reachable by keyboard.`,
  };

  if (techMap[id]) return techMap[id];

  return `${violation.id}: ${nodeCount} instance${nodeCount !== 1 ? 's' : ''} — ${violation.help}`;
}

/**
 * Process violations into detailed issue objects with categorization.
 */
function processFullViolations(violations, pageTitle, pageUrl) {
  const contentRules = [
    'color-contrast', 'color-contrast-enhanced', 'image-alt',
    'link-name', 'document-title', 'html-has-lang', 'html-lang-valid',
    'meta-viewport', 'video-caption', 'audio-caption',
    'image-redundant-alt', 'link-in-text-block',
  ];

  const sorted = [...violations].sort((a, b) => {
    const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
    return (order[a.impact] || 3) - (order[b.impact] || 3);
  });

  return sorted.map(violation => {
    const isContent = contentRules.includes(violation.id);
    const category = isContent ? 'content' : 'technical';
    const nodeCount = violation.nodes ? violation.nodes.length : 0;

    const nodes = (violation.nodes || []).slice(0, 5).map(node => ({
      html: node.html || '',
      target: node.target ? node.target.join(' > ') : '',
      failureSummary: node.failureSummary || '',
    }));

    return {
      id: violation.id,
      impact: violation.impact,
      category,
      instanceCount: nodeCount,
      pageTitle,
      pageUrl,
      plainDescription: mapToPlainEnglish(violation),
      technicalDescription: violation.help,
      howToFix: mapToFixRecommendation(violation),
      wcagTags: violation.tags.filter(t => t.startsWith('wcag')),
      wcagLevel: extractWcagLevel(violation.tags),
      helpUrl: violation.helpUrl || '',
      disabilityCategories: getDisabilityCategories(violation),
      nodes,
      cssSelector: nodes.length > 0 ? nodes[0].target : '',
      htmlSnippet: nodes.length > 0 ? nodes[0].html : '',
    };
  });
}

function mapToPlainEnglish(violation) {
  const id = violation.id;
  const count = violation.nodes ? violation.nodes.length : 0;

  const plainMap = {
    'color-contrast': `${count} text element${count !== 1 ? 's' : ''} ${count !== 1 ? 'are' : 'is'} hard to read because the text color is too similar to the background color.`,
    'color-contrast-enhanced': `${count} text element${count !== 1 ? 's' : ''} fail${count === 1 ? 's' : ''} the stricter AAA contrast requirements for enhanced readability.`,
    'image-alt': `${count} image${count !== 1 ? 's' : ''} ${count !== 1 ? 'are' : 'is'} missing a description. Screen readers can't tell users what the image shows.`,
    'image-redundant-alt': `${count} image${count !== 1 ? 's' : ''} ${count !== 1 ? 'have' : 'has'} alt text that repeats nearby visible text. This creates a frustrating echo for screen reader users.`,
    'link-name': `${count} link${count !== 1 ? 's' : ''} ${count !== 1 ? 'don\'t' : 'doesn\'t'} have readable text. People using screen readers won't know where the link goes.`,
    'link-in-text-block': `${count} link${count !== 1 ? 's' : ''} inside text ${count !== 1 ? 'are' : 'is'} only distinguished by color. Colorblind users can't tell what's clickable.`,
    'button-name': `${count} button${count !== 1 ? 's' : ''} ${count !== 1 ? 'have' : 'has'} no label. People using assistive technology can't tell what the button does.`,
    'label': `${count} form field${count !== 1 ? 's' : ''} ${count !== 1 ? 'are' : 'is'} missing a label. Screen reader users can't tell what information to type in.`,
    'select-name': `${count} dropdown menu${count !== 1 ? 's' : ''} ${count !== 1 ? 'are' : 'is'} missing a label. Screen readers can't announce what the dropdown is for.`,
    'heading-order': 'The heading levels on this page skip ranks (for example, jumping from H2 to H4). This makes the page confusing to navigate.',
    'empty-heading': `${count} heading${count !== 1 ? 's' : ''} ${count !== 1 ? 'are' : 'is'} empty. This creates dead-end navigation for screen reader users who jump between headings.`,
    'document-title': 'The page has no title. Screen readers and browser tabs show nothing to identify this page.',
    'html-has-lang': 'The page doesn\'t specify what language it\'s in. Screen readers may mispronounce the entire page.',
    'html-lang-valid': 'The language code on this page is invalid. Screen readers may not pronounce content correctly.',
    'bypass': 'There\'s no "skip to content" link. Keyboard users must tab through the entire navigation on every page.',
    'landmark-one-main': 'The page has no main content area marked. Assistive technology can\'t find the primary content.',
    'region': `${count} section${count !== 1 ? 's' : ''} of content ${count !== 1 ? 'are' : 'is'} not inside any landmark region. Screen readers can't categorize this content.`,
    'aria-hidden-focus': `${count} element${count !== 1 ? 's' : ''} ${count !== 1 ? 'are' : 'is'} hidden from screen readers but still reachable by keyboard, creating confusion.`,
    'aria-allowed-role': `${count} element${count !== 1 ? 's' : ''} ${count !== 1 ? 'have' : 'has'} a role that doesn't match the element type. This confuses assistive technology about what the element actually is.`,
    'aria-prohibited-attr': `${count} element${count !== 1 ? 's' : ''} ${count !== 1 ? 'use' : 'uses'} ARIA attributes that are not allowed on that type of element, which confuses assistive technology.`,
    'frame-title': `${count} embedded frame${count !== 1 ? 's' : ''} ${count !== 1 ? 'are' : 'is'} missing a title. Screen readers can't describe what the embedded content is for.`,
    'video-caption': 'Videos on this page don\'t have captions. Deaf or hard-of-hearing users can\'t access the audio content.',
    'meta-viewport': 'The page prevents users from zooming in. People with low vision need to enlarge text to read it.',
    'nested-interactive': `${count} interactive element${count !== 1 ? 's' : ''} ${count !== 1 ? 'are' : 'is'} nested inside other interactive elements. This makes them impossible to activate for some assistive technology users.`,
    'list': `${count} list${count !== 1 ? 's' : ''} ${count !== 1 ? 'are' : 'is'} not structured correctly. Screen readers can't announce how many items are in the list.`,
    'listitem': `${count} list item${count !== 1 ? 's' : ''} ${count !== 1 ? 'are' : 'is'} not inside a proper list container. Screen readers can't navigate them as a group.`,
    'td-headers-attr': `${count} table cell${count !== 1 ? 's' : ''} ${count !== 1 ? 'have' : 'has'} incorrect header associations. Screen readers can't properly announce which column a cell belongs to.`,
  };

  if (plainMap[id]) return plainMap[id];
  return `${count} element${count !== 1 ? 's' : ''} on this page ${count !== 1 ? 'have' : 'has'} an accessibility issue that may create barriers for visitors using assistive technology.`;
}

function mapToFixRecommendation(violation) {
  const id = violation.id;

  const fixMap = {
    'color-contrast': 'Increase the contrast ratio between text color and background color. Use a contrast checker to ensure a minimum ratio of 4.5:1 for normal text and 3:1 for large text.',
    'color-contrast-enhanced': 'For AAA compliance, text needs a 7:1 contrast ratio (4.5:1 for large text). Darken text or lighten backgrounds until the ratio passes.',
    'image-alt': 'Add a descriptive alt attribute to each image. For decorative images, use alt="" (empty). For informative images, describe what the image shows or conveys.',
    'image-redundant-alt': 'Remove or rewrite the alt text so it doesn\'t repeat the same text already visible near the image. If the image is purely decorative alongside text, use alt="" instead.',
    'link-name': 'Add visible text inside the <a> tag, or add an aria-label attribute that describes the link destination. Avoid generic text like "click here."',
    'link-in-text-block': 'Add visible underlines or high-contrast borders to inline body links so colorblind users can identify them without relying on color alone.',
    'button-name': 'Add visible text inside the <button> tag, or add an aria-label attribute describing what the button does.',
    'label': 'Associate a <label> element with each form input using the "for" attribute matching the input\'s "id". Every field needs a visible label.',
    'select-name': 'Add a <label for="select-id"> or aria-label="Select Vintage" so screen readers announce the dropdown purpose.',
    'heading-order': 'Restructure headings to follow a logical order: H1 → H2 → H3. Don\'t skip levels. Each page should have exactly one H1.',
    'empty-heading': 'Remove empty heading tags (<h2></h2>) or populate them with text. Use CSS margins for visual spacing instead.',
    'document-title': 'Add a <title> element inside the <head> tag with a descriptive page title (e.g., "About Us — Your Company Name").',
    'html-has-lang': 'Add lang="en" (or appropriate language code) to the opening <html> tag.',
    'html-lang-valid': 'Fix the lang attribute on the <html> tag to use a valid language code (e.g., "en", "es", "fr").',
    'bypass': 'Add a "Skip to main content" link as the very first focusable element on the page, linking to the main content area with an id.',
    'landmark-one-main': 'Wrap the primary page content in a <main> element. Each page should have exactly one <main> landmark.',
    'region': 'Wrap all page content inside appropriate landmark elements: <header>, <nav>, <main>, <aside>, <footer>.',
    'aria-hidden-focus': 'Either remove aria-hidden="true" from the container, or add tabindex="-1" to the focusable elements inside it to remove them from tab order.',
    'aria-allowed-role': 'Ensure the role attribute matches the HTML element native semantics (e.g., do not put role="button" on an <a> link).',
    'aria-prohibited-attr': 'Remove invalid ARIA attributes from structural tags. Only use ARIA attributes on supported interactive elements.',
    'frame-title': 'Add a descriptive title attribute to the <iframe> tag (e.g., <iframe title="Store Locator Map">) so screen readers announce its purpose.',
    'video-caption': 'Add captions (subtitles) to all video content. Use <track kind="captions"> or a third-party captioning service.',
    'meta-viewport': 'Remove "maximum-scale=1" and "user-scalable=no" from the viewport meta tag to allow pinch-to-zoom.',
    'nested-interactive': 'Restructure the HTML so interactive elements (buttons, links) are not nested inside each other. Each should be independent.',
    'list': 'Ensure lists use proper <ul> or <ol> containers with <li> children only.',
    'listitem': 'Wrap <li> elements inside a proper <ul> or <ol> parent container.',
    'td-headers-attr': 'Use proper <th> elements with scope attributes for table headers, and ensure td headers-attr values reference valid th ids.',
  };

  if (fixMap[id]) return fixMap[id];
  return violation.help + '. Refer to the WCAG documentation for specific remediation steps.';
}

function extractWcagLevel(tags) {
  if (tags.includes('wcag2aaa') || tags.includes('wcag2aa')) {
    if (tags.some(t => /^wcag2aaa/.test(t))) return 'AAA';
    if (tags.some(t => /^wcag2aa/.test(t))) return 'AA';
  }
  if (tags.includes('wcag2a') || tags.some(t => /^wcag2a/.test(t))) return 'A';
  if (tags.includes('best-practice')) return 'Best Practice';
  return 'A';
}

module.exports = { runLightScan, runFullScan };
