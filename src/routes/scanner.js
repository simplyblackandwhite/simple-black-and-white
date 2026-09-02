'use strict';

const express = require('express');
const path = require('path');
const { getScans, getScanById, getScansForDomain, saveScan, saveQuote, deleteScan, getOrCreateClient, getClientsWithStats, getClientById, getClientByDomain, updateClientNotes, updateClientName, updateClientEmail, markOutreachSent, getScansForClient, deleteClient, saveLeadWithToken, getLeadsForFollowup, markFollowupSent, getLeads } = require('../db/database');
const { sanitizeUrl, checkReachability } = require('../utils/sanitizer');
const { runFullScan } = require('../scanner/engine');
const { generateQuote } = require('../scanner/quote-generator');
const { sendOutreachEmail, sendFollowUpEmail } = require('../utils/notifier');
const { compareScans } = require('../scanner/comparison-engine');

const router = express.Router();

// ─── Score Calculation Helper ─────────────────────────────────────────────────
// Calculates accessibility score from unique rules (same logic as engine.js)
function calculateFallbackScore(components) {
  if (!components || components.length === 0) return 0;
  let deductions = 0;
  for (const c of components) {
    const weight = c.severity === 'critical' ? 12 : c.severity === 'serious' ? 7 : c.severity === 'moderate' ? 3 : 1;
    deductions += weight * 1.25; // average spread multiplier
  }
  return Math.max(0, Math.round(100 - (deductions / 150) * 100));
}

// ─── Auth Guard Middleware ────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
}

// Apply auth guard to all /scanner routes
router.use(requireAuth);

// ─── Scanner Dashboard ────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../views/scanner.html'));
});

// ─── Accessibility Fixer Tool ────────────────────────────────────────────────
router.get('/fixer', (req, res) => {
  res.sendFile(path.join(__dirname, '../../views/fixer.html'));
});

// ─── Fixer API ───────────────────────────────────────────────────────────────
router.post('/api/fixer', async (req, res) => {
  try {
    const { html, ruleId } = req.body;

    if (!html || !html.trim()) {
      return res.status(400).json({ success: false, error: 'Please provide HTML code to fix.' });
    }

    if (html.length > 50000) {
      return res.status(400).json({ success: false, error: 'Input too large. Paste a smaller snippet (max 50KB).' });
    }

    const { fixWithRules } = require('../scanner/fixer-engine');

    // Map variant rule IDs to their base fixer
    const ruleAliases = {
      'color-contrast-enhanced': 'color-contrast',
      'link-in-text-block': 'color-contrast',
      'image-redundant-alt': 'image-alt',
      'html-lang-valid': 'html-has-lang',
      'listitem': 'list',
      'video-caption': 'frame-title',
    };
    const resolvedRule = ruleId ? (ruleAliases[ruleId] || ruleId) : '';

    // Try rules engine first
    const rulesResult = fixWithRules(html, resolvedRule);

    if (rulesResult) {
      return res.status(200).json({
        success: true,
        ...rulesResult,
      });
    }

    // Rules engine couldn't fix it — try LLM if configured
    if (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) {
      // LLM fallback (future implementation)
      return res.status(200).json({
        success: true,
        fixed: html,
        changes: ['Rules engine could not detect a specific fixable pattern. LLM analysis not yet configured.'],
        explanation: 'The provided code may have issues that require manual review or more context to fix. Try selecting a specific issue type from the dropdown.',
        method: 'manual-review-needed',
      });
    }

    // No LLM configured — return guidance
    return res.status(200).json({
      success: true,
      fixed: html,
      changes: ['Could not auto-detect the issue. Try selecting a specific issue type from the dropdown for targeted fixes.'],
      explanation: 'The rules engine works best when you select the specific violation type. For complex patterns, manual review is recommended.',
      method: 'no-fix-detected',
    });
  } catch (err) {
    console.error('[Fixer] Error:', err.message);
    res.status(500).json({ success: false, error: 'Fixer encountered an error: ' + err.message });
  }
});

// ─── Full Scan API (Multi-Page Crawl with SSE Progress) ──────────────────────
router.post('/api/scan/full', async (req, res) => {
  try {
    // 1. Validate URL
    const { url } = sanitizeUrl(req.body.url);

    // 2. Check reachability
    await checkReachability(url);

    // 3. Build crawl options from request body
    const crawlOptions = {};
    if (req.body.maxPages) crawlOptions.maxPages = Math.min(Math.max(parseInt(req.body.maxPages) || 50, 1), 100);
    if (req.body.maxDepth) crawlOptions.maxDepth = Math.min(Math.max(parseInt(req.body.maxDepth) || 3, 1), 10);
    if (typeof req.body.respectRobots === 'boolean') crawlOptions.respectRobots = req.body.respectRobots;
    if (typeof req.body.handleAgeGate === 'boolean') crawlOptions.handleAgeGate = req.body.handleAgeGate;

    // 4. Set up SSE for real-time progress
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Progress callback — streams events to the client
    const onProgress = (progress) => {
      res.write('data: ' + JSON.stringify({ type: 'progress', ...progress }) + '\n\n');
    };

    // 5. Run the full multi-page scan with progress streaming
    const results = await runFullScan(url, crawlOptions, onProgress);

    // 6. Persist to database
    try {
      const saved = saveScan(results);
      results.scanId = saved.id;

      try {
        const domain = new URL(url).hostname;
        const client = getOrCreateClient(domain);
        results.clientId = client.id;
      } catch (clientErr) {
        // Non-blocking
      }
    } catch (dbErr) {
      console.error('[Scanner] DB save error (non-blocking):', dbErr.message);
    }

    // 7. Auto-generate quote
    try {
      const quote = generateQuote(results);
      results.quote = quote;

      if (results.scanId) {
        const savedQuote = saveQuote({
          scanId: results.scanId,
          recommendedTier: quote.recommendedTier,
          tier1PriceLow: quote.tiers.tier1.calculatedMin,
          tier1PriceHigh: quote.tiers.tier1.calculatedMax,
          tier2PriceLow: quote.tiers.tier2.calculatedMin,
          tier2PriceHigh: quote.tiers.tier2.calculatedMax,
          tier3PriceLow: quote.tiers.tier3.calculatedMin,
          tier3PriceHigh: quote.tiers.tier3.calculatedMax,
          scopeSummary: quote.scopeSummary,
          status: 'draft',
        });
        results.quote.quoteId = savedQuote.id;
      }
    } catch (quoteErr) {
      console.error('[Scanner] Quote generation error (non-blocking):', quoteErr.message);
    }

    // 8. Send final result as SSE event and close
    res.write('data: ' + JSON.stringify({ type: 'complete', results }) + '\n\n');
    res.end();
  } catch (err) {
    // If headers already sent (SSE mode), send error as event
    if (res.headersSent) {
      res.write('data: ' + JSON.stringify({ type: 'error', error: err.message }) + '\n\n');
      res.end();
    } else {
      const status = err.message.includes('Please') || err.message.includes('doesn\'t') ? 400 : 500;
      res.status(status).json({ success: false, error: err.message });
    }
  }
});

// ─── Quote Generator API ─────────────────────────────────────────────────────
router.get('/api/quote/:scanId', (req, res) => {
  try {
    const scan = getScanById(parseInt(req.params.scanId));
    if (!scan) {
      return res.status(404).json({ success: false, error: 'Scan not found.' });
    }

    // Reconstruct results from stored data
    const rawResults = JSON.parse(scan.raw_results || '{}');
    const quote = generateQuote(rawResults);
    res.status(200).json({ success: true, quote });
  } catch (err) {
    console.error('[Scanner] Quote error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to generate quote.' });
  }
});

// ─── CSV Export ──────────────────────────────────────────────────────────────
router.get('/api/scans/:id/csv', (req, res) => {
  try {
    const scan = getScanById(parseInt(req.params.id));
    if (!scan) {
      return res.status(404).json({ success: false, error: 'Scan not found.' });
    }

    const rawResults = JSON.parse(scan.raw_results || '{}');
    const issues = rawResults.issues || [];

    // CSV headers
    const headers = [
      'Priority', 'Risk Category', 'Page Grade', 'Page Score', 'Severity',
      'WCAG Level', 'Page Title', 'URL', 'Rule ID', 'Description',
      'How to Fix', 'Instances', 'Category', 'CSS Selector', 'HTML Snippet',
      'Issue Details', 'WCAG Doc Link'
    ];

    const rows = issues.map((issue, idx) => [
      idx + 1,
      issue.category === 'content' ? 'Content' : 'Technical',
      rawResults.aeo ? rawResults.aeo.grade : '',
      rawResults.aeo ? rawResults.aeo.score : '',
      issue.impact,
      issue.wcagLevel,
      issue.pageTitle || '',
      issue.pageUrl || '',
      issue.id,
      issue.plainDescription,
      issue.howToFix,
      issue.instanceCount,
      issue.category,
      issue.cssSelector,
      issue.htmlSnippet ? issue.htmlSnippet.replace(/"/g, '""') : '',
      issue.technicalDescription,
      issue.helpUrl,
    ]);

    // Build CSV string
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const filename = `SimplyBlackandWhite-ScanReport-${scan.created_at.split(' ')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err) {
    console.error('[Scanner] CSV export error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to generate CSV.' });
  }
});

// ─── Workbook Export (Remediation Workbook — branded PDF page) ────────────────
router.get('/api/scans/:id/workbook', (req, res) => {
  // Redirect to the workbook HTML page which renders client-side
  res.redirect('/scanner/workbook/' + req.params.id);
});

router.get('/workbook/:scanId', (req, res) => {
  res.sendFile(path.join(__dirname, '../../views/workbook.html'));
});

// ─── Workbook Data API ───────────────────────────────────────────────────────
router.get('/api/scans/:id/workbook-data', (req, res) => {
  try {
    const scan = getScanById(parseInt(req.params.id));
    if (!scan) {
      return res.status(404).json({ success: false, error: 'Scan not found.' });
    }

    const rawResults = JSON.parse(scan.raw_results || '{}');
    const issues = rawResults.issues || [];
    const platform = rawResults.platform || { name: 'Unknown / Custom' };
    const aeo = rawResults.aeo || {};
    const quote = generateQuote(rawResults);

    const systemIssues = issues.filter(i => i.category === 'technical');
    const contentIssues = issues.filter(i => i.category === 'content');

    // Group by rule for component inventory
    const componentMap = {};
    issues.forEach(i => {
      if (!componentMap[i.id]) {
        componentMap[i.id] = { rule: i.id, description: i.plainDescription, totalInstances: 0, severity: i.impact, category: i.category, howToFix: i.howToFix };
      }
      componentMap[i.id].totalInstances += i.instanceCount || 1;
    });

    res.status(200).json({
      success: true,
      url: scan.url,
      pageTitle: rawResults.pageTitle || '',
      platform,
      siteLastUpdated: rawResults.siteLastUpdated || null,
      scanDate: scan.created_at,
      summary: {
        totalIssues: scan.total_issues,
        critical: scan.critical,
        serious: scan.serious,
        moderate: scan.moderate,
        minor: scan.minor,
        aeoScore: scan.aeo_score,
        aeoGrade: scan.aeo_grade,
        accessibilityScore: scan.accessibility_score || calculateFallbackScore(Object.values(componentMap)),
      },
      components: Object.values(componentMap),
      systemIssues,
      contentIssues,
      aeo,
      quote,
    });
  } catch (err) {
    console.error('[Scanner] Workbook data error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to load workbook data.' });
  }
});

// ─── Client Report Data ──────────────────────────────────────────────────────
router.get('/api/scans/:id/report', (req, res) => {
  try {
    const scan = getScanById(parseInt(req.params.id));
    if (!scan) {
      return res.status(404).json({ success: false, error: 'Scan not found.' });
    }

    const rawResults = JSON.parse(scan.raw_results || '{}');
    const issues = rawResults.issues || [];

    // Split issues into content and technical categories
    const contentIssues = issues.filter(i => i.category === 'content');
    const technicalIssues = issues.filter(i => i.category === 'technical');

    // Generate quote for the report
    let quote = null;
    try {
      quote = generateQuote(rawResults);
    } catch (e) {
      // Non-blocking
    }

    res.status(200).json({
      success: true,
      report: {
        url: scan.url,
        pageTitle: rawResults.pageTitle || '',
        scanDate: scan.created_at,
        siteLastUpdated: rawResults.siteLastUpdated || null,
        platform: rawResults.platform || null,
        summary: {
          totalIssues: scan.total_issues,
          critical: scan.critical,
          serious: scan.serious,
          moderate: scan.moderate,
          minor: scan.minor,
          aeoScore: scan.aeo_score,
          aeoGrade: scan.aeo_grade,
        },
        aeo: rawResults.aeo || null,
        contentIssues,
        technicalIssues,
        quote,
      },
    });
  } catch (err) {
    console.error('[Scanner] Report data error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to generate report data.' });
  }
});

// ─── Client Report Page ──────────────────────────────────────────────────────
router.get('/report/:scanId', (req, res) => {
  res.sendFile(path.join(__dirname, '../../views/client-report.html'));
});

// ─── Printable Quote/Proposal Page ───────────────────────────────────────────
router.get('/quote/:scanId', (req, res) => {
  res.sendFile(path.join(__dirname, '../../views/client-quote.html'));
});

// ─── Quote Data API ──────────────────────────────────────────────────────────
router.get('/api/scans/:id/quote-data', (req, res) => {
  try {
    const scan = getScanById(parseInt(req.params.id));
    if (!scan) {
      return res.status(404).json({ success: false, error: 'Scan not found.' });
    }
    const rawResults = JSON.parse(scan.raw_results || '{}');
    const quote = generateQuote(rawResults);
    res.status(200).json({
      success: true,
      url: scan.url,
      pageTitle: rawResults.pageTitle || '',
      scanDate: scan.created_at,
      platform: rawResults.platform || { name: 'Unknown / Custom' },
      summary: {
        totalIssues: scan.total_issues,
        critical: scan.critical,
        serious: scan.serious,
        moderate: scan.moderate,
        minor: scan.minor,
        aeoScore: scan.aeo_score,
        aeoGrade: scan.aeo_grade,
      },
      quote,
    });
  } catch (err) {
    console.error('[Scanner] Quote data error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to generate quote data.' });
  }
});

// ─── Verify Fix (Single Issue Re-scan) ───────────────────────────────────────
router.post('/api/verify-fix', async (req, res) => {
  try {
    const { url, ruleId } = req.body;
    if (!url || !ruleId) {
      return res.status(400).json({ success: false, error: 'URL and ruleId are required.' });
    }

    const { sanitizeUrl: sanitize, checkReachability: checkReach } = require('../utils/sanitizer');
    const { url: cleanUrl } = sanitize(url);
    await checkReach(cleanUrl);

    const puppeteer = require('puppeteer');
    const path = require('path');
    const AXE_SOURCE = path.resolve(__dirname, '../../node_modules/axe-core/axe.min.js');

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process'],
      timeout: 30000,
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      await page.goto(cleanUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      try { await page.waitForNetworkIdle({ idleTime: 1500, timeout: 8000 }); } catch (e) {}

      await page.addScriptTag({ path: AXE_SOURCE });

      const result = await page.evaluate(async (rule) => {
        /* global axe */
        const results = await axe.run(document, {
          runOnly: { type: 'rule', values: [rule] },
          resultTypes: ['violations', 'passes'],
          elementRef: false,
        });
        return {
          violations: results.violations || [],
          passes: results.passes || [],
        };
      }, ruleId);

      const passed = result.violations.length === 0;
      const instances = passed ? 0 : (result.violations[0].nodes || []).length;

      res.status(200).json({
        success: true,
        ruleId,
        url: cleanUrl,
        passed,
        instances,
        message: passed
          ? 'This issue has been resolved on this page.'
          : instances + ' instance' + (instances !== 1 ? 's' : '') + ' of this issue still found.',
      });
    } finally {
      await browser.close();
    }
  } catch (err) {
    res.status(500).json({ success: false, error: 'Verification failed: ' + err.message });
  }
});

// ─── Scan History API ────────────────────────────────────────────────────────
router.get('/api/scans', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const scans = getScans(limit);
    res.status(200).json({ success: true, scans });
  } catch (err) {
    console.error('[Scanner] Scan history error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to load scan history.' });
  }
});

// ─── Score History for Domain (Overview chart) ───────────────────────────────
router.get('/api/scans/history/:domain', (req, res) => {
  try {
    const domain = req.params.domain;
    const scans = getScansForDomain(domain, 20);
    res.status(200).json({ success: true, history: scans });
  } catch (err) {
    console.error('[Scanner] Score history error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to load score history.' });
  }
});

// ─── Single Scan Detail ──────────────────────────────────────────────────────
router.get('/api/scans/:id', (req, res) => {
  try {
    const scan = getScanById(parseInt(req.params.id));
    if (!scan) {
      return res.status(404).json({ success: false, error: 'Scan not found.' });
    }
    // Return with parsed raw_results for full detail view
    const parsed = JSON.parse(scan.raw_results || '{}');
    // Generate quote on the fly if not stored
    if (!parsed.quote) {
      try { parsed.quote = generateQuote(parsed); } catch (e) {}
    }
    parsed.scanId = scan.id;
    res.status(200).json({ success: true, scan, details: parsed });
  } catch (err) {
    console.error('[Scanner] Scan detail error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to load scan.' });
  }
});

// ─── Scan Comparison API ─────────────────────────────────────────────────────
router.get('/api/compare/:id1/:id2', (req, res) => {
  try {
    const scanA = getScanById(parseInt(req.params.id1));
    const scanB = getScanById(parseInt(req.params.id2));

    if (!scanA || !scanB) {
      return res.status(404).json({ success: false, error: 'One or both scans not found.' });
    }

    const comparison = compareScans(scanA, scanB);
    res.status(200).json({ success: true, comparison });
  } catch (err) {
    console.error('[Scanner] Comparison error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to compare scans.' });
  }
});

// ─── Comparison Report Page (printable) ──────────────────────────────────────
router.get('/comparison/:id1/:id2', (req, res) => {
  res.sendFile(path.join(__dirname, '../../views/comparison-report.html'));
});

// ─── Current User Info ───────────────────────────────────────────────────────
router.get('/api/me', (req, res) => {
  let version = '1.0.0';
  try {
    version = require('../../package.json').version || '1.0.0';
  } catch (e) {}

  res.status(200).json({
    success: true,
    version,
    user: {
      name: req.user.displayName,
      email: req.user.email,
      photo: req.user.photo,
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT PROFILE API
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Get All Clients (profile cards) ─────────────────────────────────────────
router.get('/api/clients', (req, res) => {
  try {
    const clients = getClientsWithStats();
    res.status(200).json({ success: true, clients });
  } catch (err) {
    console.error('[Scanner] Clients error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to load clients.' });
  }
});

// ─── Get Single Client Detail ────────────────────────────────────────────────
router.get('/api/clients/:id', (req, res) => {
  try {
    const client = getClientById(parseInt(req.params.id));
    if (!client) {
      return res.status(404).json({ success: false, error: 'Client not found.' });
    }

    // Get scans for this client
    const scans = getScansForClient(client.domain);

    // Get latest scan full details
    let latestDetails = null;
    if (scans.length > 0) {
      const fullScan = getScanById(scans[0].id);
      if (fullScan && fullScan.raw_results) {
        latestDetails = JSON.parse(fullScan.raw_results);
        latestDetails.scanId = fullScan.id;

        // Generate quote on the fly if not present
        if (!latestDetails.quote) {
          try {
            latestDetails.quote = generateQuote(latestDetails);
          } catch (e) {
            // Non-blocking
          }
        }
      }
    }

    res.status(200).json({
      success: true,
      client,
      scans,
      latestDetails,
    });
  } catch (err) {
    console.error('[Scanner] Client detail error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to load client.' });
  }
});

// ─── Update Client Notes ─────────────────────────────────────────────────────
router.put('/api/clients/:id/notes', (req, res) => {
  try {
    const { notes } = req.body;
    updateClientNotes(parseInt(req.params.id), notes || '');
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Scanner] Update notes error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to update notes.' });
  }
});

// ─── Update Client Display Name ──────────────────────────────────────────────
router.put('/api/clients/:id/name', (req, res) => {
  try {
    const { displayName } = req.body;
    updateClientName(parseInt(req.params.id), displayName || '');
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Scanner] Update name error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to update name.' });
  }
});

// ─── Delete Client ───────────────────────────────────────────────────────────
router.delete('/api/clients/:id', (req, res) => {
  try {
    const deleted = deleteClient(parseInt(req.params.id));
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Client not found.' });
    }
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Scanner] Delete client error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to delete client.' });
  }
});

// ─── Delete Scan ─────────────────────────────────────────────────────────────
router.delete('/api/scans/:id', (req, res) => {
  try {
    const deleted = deleteScan(parseInt(req.params.id));
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Scan not found.' });
    }
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Scanner] Delete scan error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to delete scan.' });
  }
});

// ─── Send Outreach Email ─────────────────────────────────────────────────────
router.post('/api/clients/:id/outreach', async (req, res) => {
  try {
    const clientId = parseInt(req.params.id);
    const { email } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Valid email required.' });
    }

    const client = getClientById(clientId);
    if (!client) {
      return res.status(404).json({ success: false, error: 'Client not found.' });
    }

    // Check rate limit (1 outreach per client per 30 days)
    if (client.outreach_sent_at) {
      const lastSent = new Date(client.outreach_sent_at);
      const daysSince = (Date.now() - lastSent.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 30) {
        return res.status(429).json({ success: false, error: 'Outreach already sent ' + Math.round(daysSince) + ' days ago. Wait 30 days between outreach emails.' });
      }
    }

    // Save contact email
    updateClientEmail(clientId, email.trim());

    // Get latest scan for this client
    const scans = getScansForClient(client.domain, 1);
    let scanData = null;
    if (scans.length > 0) {
      scanData = {
        url: scans[0].url,
        totalIssues: scans[0].total_issues,
        critical: scans[0].critical,
        serious: scans[0].serious,
        moderate: scans[0].moderate,
        minor: scans[0].minor,
        aeoGrade: scans[0].aeo_grade,
        accessibilityScore: scans[0].accessibility_score || calculateScoreFromCounts(scans[0]),
      };
    }

    // Helper: calculate score from severity counts if DB value is 0
    function calculateScoreFromCounts(scan) {
      var deductions = (scan.critical || 0) * 12 + (scan.serious || 0) * 7 + (scan.moderate || 0) * 3 + (scan.minor || 0) * 1;
      return Math.max(0, Math.round(100 - (deductions / 150) * 100));
    }

    // Create a lead + token for the public report link
    const lead = saveLeadWithToken({
      email: email.trim(),
      website: client.domain,
      source: 'outreach',
      scanId: scans.length > 0 ? scans[0].id : null,
    });

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const reportLink = appUrl + '/report/snapshot/' + lead.token;
    const unsubLink = appUrl + '/unsubscribe/' + lead.token;

    // Send the outreach email
    const result = await sendOutreachEmail(email.trim(), scanData, reportLink, unsubLink);

    if (result.sent) {
      markOutreachSent(clientId);
      res.status(200).json({ success: true, message: 'Outreach sent.' });
    } else {
      res.status(500).json({ success: false, error: 'Email send failed: ' + (result.reason || 'unknown') });
    }
  } catch (err) {
    console.error('[Scanner] Outreach error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to send outreach.' });
  }
});

// ─── Leads List (for dashboard management) ──────────────────────────────────
router.get('/api/leads', (req, res) => {
  try {
    const leads = getLeads(100);
    res.status(200).json({ success: true, leads });
  } catch (err) {
    console.error('[Scanner] Leads error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to load leads.' });
  }
});

// ─── Send Follow-ups (manual trigger) ────────────────────────────────────────
// Sends follow-up emails to all eligible leads (scan source, 48hr+ old, no follow-up yet)
router.post('/api/leads/send-followups', async (req, res) => {
  try {
    const eligible = getLeadsForFollowup();

    if (eligible.length === 0) {
      return res.status(200).json({ success: true, sent: 0, message: 'No leads eligible for follow-up.' });
    }

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    let sentCount = 0;

    for (const lead of eligible) {
      const reportLink = appUrl + '/report/snapshot/' + lead.token;
      const unsubLink = appUrl + '/unsubscribe/' + lead.token;

      const scanData = {
        url: lead.scan_url || lead.website || '',
        totalIssues: lead.total_issues || 0,
        critical: lead.critical || 0,
      };

      const result = await sendFollowUpEmail(lead.email, scanData, reportLink, unsubLink);
      if (result.sent) {
        markFollowupSent(lead.id);
        sentCount++;
      }
    }

    res.status(200).json({ success: true, sent: sentCount, total: eligible.length });
  } catch (err) {
    console.error('[Scanner] Follow-up error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to send follow-ups.' });
  }
});

module.exports = router;
