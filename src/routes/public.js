'use strict';

const express = require('express');
const path = require('path');
const passport = require('passport');
const { sanitizeUrl, checkReachability } = require('../utils/sanitizer');
const { runLightScan } = require('../scanner/engine');
const { sendScanNotification, sendLeadNotification, sendLeadSnapshotEmail } = require('../utils/notifier');
const { saveScan, saveLead, saveLeadWithToken, getScanById, getLeadByToken, markReportViewed, unsubscribeLead } = require('../db/database');
const { renderWithFreshness, ISO_DATE } = require('../utils/freshness');

const router = express.Router();

const VIEWS_DIR = path.join(__dirname, '../../views');

/**
 * Serve a public HTML page with automated freshness dates injected.
 * Falls back to plain static serving if rendering fails, so a page is
 * never unavailable due to the freshness step.
 */
function servePage(res, fileName) {
  const filePath = path.join(VIEWS_DIR, fileName);
  const html = renderWithFreshness(filePath);
  if (html === null) {
    return res.sendFile(filePath);
  }
  res.type('html').send(html);
}

// ─── Homepage ─────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  servePage(res, 'index.html');
});

// ─── Health Check (used by Railway) ──────────────────────────────────────────
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Sitemap (auto-generated; lastmod tracks deploy date) ────────────────────
router.get('/sitemap.xml', (req, res) => {
  const base = 'https://www.simplyblackandwhite.com';
  const lastmod = ISO_DATE; // deploy date, from freshness helper
  const pages = [
    { loc: '/', priority: '1.0', changefreq: 'weekly' },
    { loc: '/faq', priority: '0.8', changefreq: 'monthly' },
    { loc: '/ai', priority: '0.6', changefreq: 'monthly' },
    { loc: '/accessibility', priority: '0.5', changefreq: 'yearly' },
    { loc: '/terms', priority: '0.3', changefreq: 'yearly' },
    { loc: '/privacy', priority: '0.3', changefreq: 'yearly' },
  ];
  const urls = pages.map(p =>
    `  <url>\n    <loc>${base}${p.loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
  ).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  res.type('application/xml').send(xml);
});

// ─── Google OAuth2 — Initiate Login ──────────────────────────────────────────
router.get('/auth/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account',
  })
);

// ─── Google OAuth2 — Callback ─────────────────────────────────────────────────
router.get('/auth/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login?error=unauthorized',
    failureMessage: true,
  }),
  (req, res) => {
    // Redirect to originally requested page or scanner dashboard
    const returnTo = req.session.returnTo || '/scanner';
    delete req.session.returnTo;
    res.redirect(returnTo);
  }
);

// ─── Email Recipe API ─────────────────────────────────────────────────────────
router.post('/api/email-recipe', (req, res) => {
  try {
    const { email, drink } = req.body;

    if (!email || !drink || !drink.name) {
      return res.status(400).json({ success: false, error: 'Email and drink are required.' });
    }

    const cleanEmail = email.trim().replace(/\s/g, '');
    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email.' });
    }

    // Send via Resend
    const { Resend } = require('resend');
    const resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

    if (!resendClient) {
      return res.status(200).json({ success: true }); // Silently succeed in dev
    }

    const html = `
      <div style="font-family: Inter, system-ui, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px;">
        <h2 style="font-family: 'Libre Baskerville', Georgia, serif; font-size: 22px; color: #1A1A1A; text-align: center; margin-bottom: 4px;">
          Your Custom Drink
        </h2>
        <p style="text-align: center; font-size: 13px; color: #888; margin-bottom: 24px;">A gift from Simply Black and White</p>

        <div style="background: #1A1A1A; border-radius: 12px; padding: 32px; text-align: center; color: #F7F7F5;">
          <p style="font-size: 32px; margin-bottom: 8px;">${drink.emoji || '☕'}</p>
          <h3 style="font-family: 'Libre Baskerville', Georgia, serif; font-size: 20px; margin-bottom: 12px; color: #fff;">${drink.name}</h3>
          <p style="font-size: 14px; color: #CBB9A6; margin-bottom: 16px;">${drink.recipe}</p>
          <hr style="border: none; border-top: 1px solid #333; margin: 16px 0;" />
          <p style="font-size: 13px; font-style: italic; color: #999;">"${drink.pun}"</p>
        </div>

        <p style="text-align: center; margin-top: 24px; font-size: 12px; color: #888;">
          Take this to your next coffee run. No one's made this mix before — it's yours.
        </p>
        <p style="text-align: center; margin-top: 16px; font-size: 11px; color: #aaa;">
          simplyblackandwhite.com — Web Accessibility & AEO Consultancy
        </p>
      </div>
    `;

    resendClient.emails.send({
      from: process.env.NOTIFY_EMAIL_FROM || 'onboarding@resend.dev',
      to: process.env.NODE_ENV === 'production' ? cleanEmail : (process.env.NOTIFY_EMAIL_TO || 'frictionlessaccess@gmail.com'),
      subject: `Your custom drink: ${drink.name}`,
      html,
    }).then(() => {
      console.log('[Recipe] Email sent to:', cleanEmail);
    }).catch(err => {
      console.error('[Recipe] Email failed:', err.message);
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Recipe] Error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to send recipe.' });
  }
});

// ─── Legal Pages ──────────────────────────────────────────────────────────────
router.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, '../../views/terms.html'));
});

router.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, '../../views/privacy.html'));
});

router.get('/accessibility', (req, res) => {
  res.sendFile(path.join(__dirname, '../../views/accessibility.html'));
});

router.get('/faq', (req, res) => {
  servePage(res, 'faq.html');
});

// AI crawler-friendly page — minimal semantic HTML
router.get('/ai', (req, res) => {
  servePage(res, 'ai.html');
});

// ─── Login Page ───────────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  // If already authenticated, go straight to scanner
  if (req.isAuthenticated()) {
    return res.redirect('/scanner');
  }
  res.sendFile(path.join(__dirname, '../../views/login.html'));
});

// ─── Logout ───────────────────────────────────────────────────────────────────
router.post('/auth/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.clearCookie('sbw.sid');
      res.redirect('/');
    });
  });
});

// ─── Light Scan API ──────────────────────────────────────────────────────────
router.post('/api/scan/light', async (req, res) => {
  try {
    // 1. Validate & sanitize URL
    const { url } = sanitizeUrl(req.body.url);

    // 2. Check reachability
    await checkReachability(url);

    // 3. Run the light scan (Puppeteer + axe-core)
    const results = await runLightScan(url);

    // 4. Persist scan to database
    try {
      const saved = saveScan(results);
      results.scanId = saved.id;
    } catch (dbErr) {
      console.error('[Route] DB save error (non-blocking):', dbErr.message);
    }

    // 5. Fire notification (async, non-blocking — don't wait for it)
    sendScanNotification(url, results.summary).catch(err => {
      console.error('[Route] Notification error (non-blocking):', err.message);
    });

    // 6. Return results to the client
    res.status(200).json(results);
  } catch (err) {
    const status = err.message.includes('Please') || err.message.includes('doesn\'t') ? 400 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// ─── Public Snapshot Report (token-based, no auth) ───────────────────────────
router.get('/report/snapshot/:token', (req, res) => {
  res.sendFile(path.join(__dirname, '../../views/snapshot-report.html'));
});

// ─── Snapshot Report Data API (public) ───────────────────────────────────────
router.get('/api/report/snapshot/:token', (req, res) => {
  try {
    const lead = getLeadByToken(req.params.token);
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Report not found or expired.' });
    }

    // Mark as viewed
    markReportViewed(req.params.token);

    // Get associated scan data
    let scanData = null;
    if (lead.scan_id) {
      const scan = getScanById(lead.scan_id);
      if (scan) {
        scanData = {
          url: scan.url,
          totalIssues: scan.total_issues,
          critical: scan.critical,
          serious: scan.serious,
          moderate: scan.moderate,
          minor: scan.minor,
          aeoGrade: scan.aeo_grade,
          aeoScore: scan.aeo_score,
          scanDate: scan.created_at,
        };

        // Parse raw_results for human risks (gated — don't include fix instructions)
        try {
          const raw = JSON.parse(scan.raw_results || '{}');
          scanData.humanRisks = raw.summary ? raw.summary.humanRisks : [];
          scanData.aeoFindings = raw.aeo ? raw.aeo.findings.slice(0, 3) : [];
        } catch (e) {
          scanData.humanRisks = [];
          scanData.aeoFindings = [];
        }
      }
    }

    res.status(200).json({ success: true, scan: scanData });
  } catch (err) {
    console.error('[Route] Snapshot report error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to load report.' });
  }
});

// ─── Unsubscribe (public) ────────────────────────────────────────────────────
router.get('/unsubscribe/:token', (req, res) => {
  try {
    unsubscribeLead(req.params.token);
    res.send(`
      <!DOCTYPE html>
      <html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Unsubscribed — Simply Black and White</title>
      <style>body{font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#F7F7F5;color:#1A1A1A;}
      .box{text-align:center;max-width:400px;padding:40px;}.box h1{font-family:'Libre Baskerville',Georgia,serif;font-size:24px;margin-bottom:12px;}.box p{color:#4A4A4A;font-size:15px;line-height:1.6;}</style>
      </head><body><div class="box"><h1>You've been unsubscribed</h1><p>You won't receive any more emails from us about this scan. If you change your mind, just run another scan anytime.</p><p style="margin-top:20px;"><a href="/" style="color:#1A1A1A;">← Back to Simply Black and White</a></p></div></body></html>
    `);
  } catch (err) {
    res.status(500).send('Something went wrong.');
  }
});

// ─── Email Capture (Post-Scan) ───────────────────────────────────────────────
router.post('/api/scan/capture-email', async (req, res) => {
  try {
    const { email, scanId, url } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.includes('@') || !cleanEmail.includes('.') || cleanEmail.length < 5) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }

    // Save lead with token for public report access
    const lead = saveLeadWithToken({
      email: cleanEmail,
      website: url || null,
      source: 'scan',
      scanId: scanId ? parseInt(scanId) : null,
    });

    // Get scan data for the email
    let scanData = null;
    if (scanId) {
      const scan = getScanById(parseInt(scanId));
      if (scan) {
        scanData = {
          url: scan.url,
          totalIssues: scan.total_issues,
          critical: scan.critical,
          serious: scan.serious,
          moderate: scan.moderate,
          minor: scan.minor,
          aeoGrade: scan.aeo_grade,
          aeoScore: scan.aeo_score,
        };
      }
    }

    // Send snapshot email to prospect (async, non-blocking)
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const reportLink = appUrl + '/report/snapshot/' + lead.token;
    const unsubLink = appUrl + '/unsubscribe/' + lead.token;

    sendLeadSnapshotEmail(cleanEmail, scanData, reportLink, unsubLink).catch(err => {
      console.error('[Route] Snapshot email error (non-blocking):', err.message);
    });

    // Also notify Pranish (non-blocking)
    sendScanNotification(url || 'unknown', scanData || { totalIssues: 0, critical: 0, serious: 0, humanRisks: [], technicalRisks: [] }).catch(() => {});

    res.status(200).json({ success: true, message: 'Report sent!' });
  } catch (err) {
    console.error('[Route] Email capture error:', err.message);
    res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
});

// ─── Contact Form / Lead Capture ─────────────────────────────────────────────
router.post('/api/contact', (req, res) => {
  try {
    const { name, email, website, service, message, company } = req.body;

    // Honeypot check — if 'company' field is filled, it's a bot
    if (company) {
      // Silently accept but don't process — bots think it worked
      return res.status(200).json({ success: true, message: 'Thanks! We\'ll be in touch within one business day.' });
    }

    if (!name || !email) {
      return res.status(400).json({ success: false, error: 'Email is required.' });
    }

    // Email validation — no spaces, must have @ and .
    const cleanEmail = email.trim().replace(/\s/g, '');
    if (!cleanEmail.includes('@') || !cleanEmail.includes('.') || cleanEmail.length < 5) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }

    const lead = saveLead({
      name: name.trim(),
      email: cleanEmail,
      website: website ? website.trim().replace(/\s/g, '') : null,
      serviceInterest: service || null,
      message: message ? message.trim() : null,
      source: 'contact_form',
    });

    // Notify via Resend (non-blocking) — include message in notification
    sendLeadNotification(name.trim(), cleanEmail, website, service, message).catch(err => {
      console.error('[Route] Lead notification error (non-blocking):', err.message);
    });

    res.status(200).json({ success: true, message: 'Thanks! We\'ll be in touch within one business day.' });
  } catch (err) {
    console.error('[Route] Contact form error:', err.message);
    res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
