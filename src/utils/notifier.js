'use strict';

const { Resend } = require('resend');

/**
 * Sends a lead notification email via Resend when a light scan is triggered.
 * Silently skips if RESEND_API_KEY is not configured.
 */

let resend = null;

function getClient() {
  if (!resend && process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

/**
 * Send a scan notification email.
 * @param {string} targetUrl - The URL that was scanned
 * @param {object} summary - Scan summary data
 * @param {number} summary.totalIssues - Total issues found
 * @param {number} summary.critical - Critical issues
 * @param {number} summary.serious - Serious issues
 * @param {string[]} summary.humanRisks - Non-technical risk descriptions
 * @param {string[]} summary.technicalRisks - Technical risk descriptions
 */
async function sendScanNotification(targetUrl, summary) {
  const client = getClient();

  if (!client) {
    console.log('[Notifier] RESEND_API_KEY not configured — skipping notification.');
    return { sent: false, reason: 'not_configured' };
  }

  const from = process.env.NOTIFY_EMAIL_FROM || 'onboarding@resend.dev';
  const to = process.env.NOTIFY_EMAIL_TO || 'frictionlessaccess@gmail.com';

  const subject = `🔍 New Light Scan: ${targetUrl}`;

  const html = `
    <div style="font-family: Inter, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="font-family: 'Libre Baskerville', Georgia, serif; color: #1A1A1A; margin-bottom: 8px;">
        New Light Scan Submitted
      </h2>
      <p style="color: #1A1A1A; font-size: 14px; margin-bottom: 24px;">
        Someone just ran a free scan on your website. Here's the snapshot:
      </p>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <tr>
          <td style="padding: 8px 12px; background: #F7F7F5; font-weight: 600; border: 1px solid #E5E5E5;">Target URL</td>
          <td style="padding: 8px 12px; border: 1px solid #E5E5E5;">
            <a href="${targetUrl}" style="color: #1A1A1A;">${targetUrl}</a>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; background: #F7F7F5; font-weight: 600; border: 1px solid #E5E5E5;">Total Issues</td>
          <td style="padding: 8px 12px; border: 1px solid #E5E5E5;">${summary.totalIssues}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; background: #F7F7F5; font-weight: 600; border: 1px solid #E5E5E5;">Critical</td>
          <td style="padding: 8px 12px; border: 1px solid #E5E5E5; color: ${summary.critical > 0 ? '#c0392b' : '#1A1A1A'};">${summary.critical}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; background: #F7F7F5; font-weight: 600; border: 1px solid #E5E5E5;">Serious</td>
          <td style="padding: 8px 12px; border: 1px solid #E5E5E5;">${summary.serious}</td>
        </tr>
      </table>

      <h3 style="font-size: 14px; color: #1A1A1A; margin-bottom: 8px;">⚠️ Human Impact Risks</h3>
      <ul style="padding-left: 20px; margin-bottom: 16px;">
        ${summary.humanRisks.map(r => `<li style="margin-bottom: 4px; font-size: 14px;">${r}</li>`).join('')}
      </ul>

      <h3 style="font-size: 14px; color: #1A1A1A; margin-bottom: 8px;">⚙️ Technical Code Risks</h3>
      <ul style="padding-left: 20px; margin-bottom: 24px;">
        ${summary.technicalRisks.map(r => `<li style="margin-bottom: 4px; font-size: 14px;">${r}</li>`).join('')}
      </ul>

      <p style="font-size: 12px; color: #666; border-top: 1px solid #E5E5E5; padding-top: 16px;">
        This is an automated notification from Simply Black and White.
        Scan triggered at ${new Date().toISOString()}.
      </p>
    </div>
  `;

  try {
    const { data, error } = await client.emails.send({
      from,
      to,
      subject,
      html,
    });

    if (error) {
      console.error('[Notifier] Resend API error:', error);
      return { sent: false, reason: 'api_error', error };
    }

    console.log('[Notifier] Scan notification sent:', data.id);
    return { sent: true, id: data.id };
  } catch (err) {
    console.error('[Notifier] Failed to send notification:', err.message);
    return { sent: false, reason: 'exception', error: err.message };
  }
}

module.exports = { sendScanNotification, sendLeadNotification, sendLeadSnapshotEmail, sendFollowUpEmail, sendOutreachEmail };

/**
 * Send a lead notification when someone fills out the contact form.
 */
async function sendLeadNotification(name, email, website, service, message) {
  const client = getClient();
  if (!client) return { sent: false, reason: 'not_configured' };

  const from = process.env.NOTIFY_EMAIL_FROM || 'onboarding@resend.dev';
  const to = process.env.NOTIFY_EMAIL_TO || 'frictionlessaccess@gmail.com';

  const html = `
    <div style="font-family: Inter, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="font-family: 'Libre Baskerville', Georgia, serif; color: #1A1A1A;">
        New Contact Form Submission
      </h2>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px 12px; background: #F7F7F5; font-weight: 600; border: 1px solid #E5E5E5;">Name</td>
          <td style="padding: 8px 12px; border: 1px solid #E5E5E5;">${name}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; background: #F7F7F5; font-weight: 600; border: 1px solid #E5E5E5;">Email</td>
          <td style="padding: 8px 12px; border: 1px solid #E5E5E5;"><a href="mailto:${email}">${email}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; background: #F7F7F5; font-weight: 600; border: 1px solid #E5E5E5;">Website</td>
          <td style="padding: 8px 12px; border: 1px solid #E5E5E5;">${website || 'Not provided'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; background: #F7F7F5; font-weight: 600; border: 1px solid #E5E5E5;">Service Interest</td>
          <td style="padding: 8px 12px; border: 1px solid #E5E5E5;">${service || 'Not specified'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; background: #F7F7F5; font-weight: 600; border: 1px solid #E5E5E5;">Message</td>
          <td style="padding: 8px 12px; border: 1px solid #E5E5E5;">${message || 'No message'}</td>
        </tr>
      </table>
      <p style="font-size: 12px; color: #666; border-top: 1px solid #E5E5E5; padding-top: 16px;">
        Submitted at ${new Date().toISOString()}
      </p>
    </div>
  `;

  try {
    const { data, error } = await client.emails.send({
      from,
      to,
      subject: `📋 New Lead: ${name} — ${service || 'General Inquiry'}`,
      html,
    });

    if (error) {
      console.error('[Notifier] Lead notification error:', error);
      return { sent: false, reason: 'api_error' };
    }

    console.log('[Notifier] Lead notification sent:', data.id);
    return { sent: true, id: data.id };
  } catch (err) {
    console.error('[Notifier] Lead notification failed:', err.message);
    return { sent: false, reason: 'exception' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 11 — Lead Emails (sent TO prospects, not to Pranish)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Send a branded accessibility snapshot email to a prospect who entered their email.
 * Shows: score summary, top issues in plain English, AEO grade, link to full report.
 * Does NOT include fix instructions (those are paid).
 *
 * @param {string} toEmail - Prospect's email
 * @param {object} scanData - Scan summary data (totalIssues, critical, serious, aeoGrade, etc.)
 * @param {string} reportLink - Full URL to the token-based public report
 * @param {string} unsubLink - Unsubscribe link
 */
async function sendLeadSnapshotEmail(toEmail, scanData, reportLink, unsubLink) {
  const client = getClient();
  if (!client) return { sent: false, reason: 'not_configured' };

  const from = process.env.NOTIFY_EMAIL_FROM || 'onboarding@resend.dev';

  // Calculate a simple score for the email
  const score = scanData
    ? Math.max(0, 100 - (scanData.critical * 15 + scanData.serious * 8 + scanData.moderate * 3 + scanData.minor * 1))
    : null;

  const siteUrl = scanData ? scanData.url : 'your website';
  const subject = `Your accessibility snapshot for ${siteUrl}`;

  const issuesSummary = scanData
    ? `We found <strong>${scanData.totalIssues} accessibility issue${scanData.totalIssues !== 1 ? 's' : ''}</strong>` +
      (scanData.critical > 0 ? `, including <strong style="color:#c0392b;">${scanData.critical} critical</strong> barrier${scanData.critical !== 1 ? 's' : ''}` : '') +
      (scanData.serious > 0 ? ` and <strong style="color:#e67e22;">${scanData.serious} serious</strong> issue${scanData.serious !== 1 ? 's' : ''}` : '') +
      '.'
    : 'We ran a quick accessibility check on your site.';

  const aeoLine = scanData && scanData.aeoGrade
    ? `<tr><td style="padding: 8px 12px; background: #F7F7F5; font-weight: 600; border: 1px solid #E5E5E5;">AI Search Visibility</td><td style="padding: 8px 12px; border: 1px solid #E5E5E5;">Grade: <strong>${scanData.aeoGrade}</strong></td></tr>`
    : '';

  const html = `
    <div style="font-family: Inter, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 0;">
      <!-- Header -->
      <div style="background: #1A1A1A; padding: 24px 32px; text-align: center;">
        <h1 style="font-family: 'Libre Baskerville', Georgia, serif; color: #F7F7F5; font-size: 20px; margin: 0;">
          Simply Black and White
        </h1>
        <p style="color: #CBB9A6; font-size: 12px; margin: 4px 0 0;">Accessibility · AEO Consultancy</p>
      </div>

      <!-- Body -->
      <div style="padding: 32px; background: #ffffff;">
        <h2 style="font-family: 'Libre Baskerville', Georgia, serif; color: #1A1A1A; font-size: 22px; margin: 0 0 16px;">
          Your Accessibility Snapshot
        </h2>

        <p style="color: #1A1A1A; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
          ${issuesSummary}
        </p>

        ${score !== null ? `
        <div style="text-align: center; margin: 24px 0; padding: 20px; background: #F7F7F5; border-radius: 8px;">
          <div style="font-size: 42px; font-weight: 700; color: #1A1A1A;">${score}%</div>
          <div style="font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.05em;">Compliance Score</div>
        </div>
        ` : ''}

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <tr>
            <td style="padding: 8px 12px; background: #F7F7F5; font-weight: 600; border: 1px solid #E5E5E5;">Site Scanned</td>
            <td style="padding: 8px 12px; border: 1px solid #E5E5E5;">${siteUrl}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; background: #F7F7F5; font-weight: 600; border: 1px solid #E5E5E5;">Total Issues</td>
            <td style="padding: 8px 12px; border: 1px solid #E5E5E5;">${scanData ? scanData.totalIssues : '—'}</td>
          </tr>
          ${aeoLine}
        </table>

        <p style="color: #4A4A4A; font-size: 14px; line-height: 1.5; margin-bottom: 24px;">
          These issues may be creating barriers for visitors using screen readers, keyboard navigation, or other assistive technology — and could affect your visibility in AI search engines.
        </p>

        <!-- CTA -->
        <div style="text-align: center; margin: 32px 0;">
          <a href="${reportLink}" style="display: inline-block; background: #1A1A1A; color: #F7F7F5; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">
            View Your Full Snapshot
          </a>
        </div>

        <p style="color: #4A4A4A; font-size: 14px; line-height: 1.5;">
          This snapshot shows what we found — if you'd like a full remediation roadmap with code-level fixes, we can put one together for you. No pressure, just reply to this email or <a href="https://simplyblackandwhite.com/#contact" style="color: #1A1A1A;">book a free consultation</a>.
        </p>
      </div>

      <!-- Footer -->
      <div style="padding: 20px 32px; background: #F7F7F5; text-align: center; border-top: 1px solid #E5E5E5;">
        <p style="font-size: 12px; color: #666; margin: 0;">
          Simply Black and White · simplyblackandwhite.com
        </p>
        <p style="font-size: 11px; color: #999; margin: 8px 0 0;">
          <a href="${unsubLink}" style="color: #999;">Unsubscribe</a> — we only email you about your scan results.
        </p>
      </div>
    </div>
  `;

  try {
    const { data, error } = await client.emails.send({ from, to: toEmail, subject, html });
    if (error) {
      console.error('[Notifier] Snapshot email error:', error);
      return { sent: false, reason: 'api_error', error };
    }
    console.log('[Notifier] Snapshot email sent to', toEmail, ':', data.id);
    return { sent: true, id: data.id };
  } catch (err) {
    console.error('[Notifier] Snapshot email failed:', err.message);
    return { sent: false, reason: 'exception', error: err.message };
  }
}

/**
 * Send a 48-hour follow-up email to a prospect who scanned but didn't take action.
 *
 * @param {string} toEmail
 * @param {object} scanData - { url, totalIssues, critical, aeoGrade }
 * @param {string} reportLink
 * @param {string} unsubLink
 */
async function sendFollowUpEmail(toEmail, scanData, reportLink, unsubLink) {
  const client = getClient();
  if (!client) return { sent: false, reason: 'not_configured' };

  const from = process.env.NOTIFY_EMAIL_FROM || 'onboarding@resend.dev';
  const siteUrl = scanData ? scanData.url : 'your website';
  const subject = `Quick follow-up on your site scan`;

  const topRisk = scanData && scanData.critical > 0
    ? `Your site has ${scanData.critical} critical barrier${scanData.critical !== 1 ? 's' : ''} that may be preventing some visitors from using it at all.`
    : scanData && scanData.totalIssues > 0
      ? `We found ${scanData.totalIssues} accessibility issues that could be affecting your visitors and search visibility.`
      : 'We found a few things worth looking at on your site.';

  const html = `
    <div style="font-family: Inter, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 0;">
      <div style="background: #1A1A1A; padding: 24px 32px; text-align: center;">
        <h1 style="font-family: 'Libre Baskerville', Georgia, serif; color: #F7F7F5; font-size: 20px; margin: 0;">Simply Black and White</h1>
        <p style="color: #CBB9A6; font-size: 12px; margin: 4px 0 0;">Accessibility · AEO Consultancy</p>
      </div>

      <div style="padding: 32px; background: #ffffff;">
        <h2 style="font-family: 'Libre Baskerville', Georgia, serif; color: #1A1A1A; font-size: 20px; margin: 0 0 16px;">
          Your scan results are still waiting
        </h2>

        <p style="color: #1A1A1A; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
          A couple days ago you ran a scan on <strong>${siteUrl}</strong>. Just wanted to make sure you saw the results.
        </p>

        <p style="color: #4A4A4A; font-size: 14px; line-height: 1.5; margin-bottom: 24px;">
          ${topRisk}
        </p>

        <div style="text-align: center; margin: 28px 0;">
          <a href="${reportLink}" style="display: inline-block; background: #1A1A1A; color: #F7F7F5; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">
            View Your Results
          </a>
        </div>

        <p style="color: #4A4A4A; font-size: 14px; line-height: 1.5;">
          If you'd like help making sense of the findings or want a remediation plan, just reply — happy to walk you through it.
        </p>
      </div>

      <div style="padding: 20px 32px; background: #F7F7F5; text-align: center; border-top: 1px solid #E5E5E5;">
        <p style="font-size: 12px; color: #666; margin: 0;">Simply Black and White · simplyblackandwhite.com</p>
        <p style="font-size: 11px; color: #999; margin: 8px 0 0;"><a href="${unsubLink}" style="color: #999;">Unsubscribe</a></p>
      </div>
    </div>
  `;

  try {
    const { data, error } = await client.emails.send({ from, to: toEmail, subject, html });
    if (error) {
      console.error('[Notifier] Follow-up email error:', error);
      return { sent: false, reason: 'api_error', error };
    }
    console.log('[Notifier] Follow-up sent to', toEmail, ':', data.id);
    return { sent: true, id: data.id };
  } catch (err) {
    console.error('[Notifier] Follow-up email failed:', err.message);
    return { sent: false, reason: 'exception', error: err.message };
  }
}

/**
 * Send an outreach email from the dashboard to a prospect (client profile).
 * Personalized accessibility snapshot for a site you've already scanned.
 *
 * @param {string} toEmail - Client's contact email
 * @param {object} scanData - { url, totalIssues, critical, serious, aeoGrade, accessibilityScore }
 * @param {string} reportLink - Token-based report link
 * @param {string} unsubLink
 */
async function sendOutreachEmail(toEmail, scanData, reportLink, unsubLink) {
  const client = getClient();
  if (!client) return { sent: false, reason: 'not_configured' };

  const from = process.env.NOTIFY_EMAIL_FROM || 'onboarding@resend.dev';
  const siteUrl = scanData ? scanData.url : 'your website';
  const score = scanData ? scanData.accessibilityScore : null;
  const subject = `A few things we noticed about ${siteUrl}`;

  const html = `
    <div style="font-family: Inter, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 0;">
      <div style="background: #1A1A1A; padding: 24px 32px; text-align: center;">
        <h1 style="font-family: 'Libre Baskerville', Georgia, serif; color: #F7F7F5; font-size: 20px; margin: 0;">Simply Black and White</h1>
        <p style="color: #CBB9A6; font-size: 12px; margin: 4px 0 0;">Accessibility · AEO Consultancy</p>
      </div>

      <div style="padding: 32px; background: #ffffff;">
        <p style="color: #1A1A1A; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
          Hi there,
        </p>

        <p style="color: #1A1A1A; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
          We were looking at accessibility in your space and ran <strong>${siteUrl}</strong> through our scanner. We found a few things you might want to know about.
        </p>

        ${score !== null ? `
        <div style="text-align: center; margin: 24px 0; padding: 20px; background: #F7F7F5; border-radius: 8px;">
          <div style="font-size: 38px; font-weight: 700; color: #1A1A1A;">${score}%</div>
          <div style="font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.05em;">Accessibility Score</div>
        </div>
        ` : ''}

        <p style="color: #4A4A4A; font-size: 14px; line-height: 1.5; margin-bottom: 8px;">
          Quick findings:
        </p>
        <ul style="padding-left: 20px; color: #4A4A4A; font-size: 14px; line-height: 1.8; margin-bottom: 24px;">
          <li><strong>${scanData ? scanData.totalIssues : 0}</strong> accessibility issues detected</li>
          ${scanData && scanData.critical > 0 ? `<li><strong>${scanData.critical} critical</strong> barriers that may block visitors</li>` : ''}
          ${scanData && scanData.aeoGrade ? `<li>AI search visibility: <strong>Grade ${scanData.aeoGrade}</strong></li>` : ''}
        </ul>

        <div style="text-align: center; margin: 28px 0;">
          <a href="${reportLink}" style="display: inline-block; background: #1A1A1A; color: #F7F7F5; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">
            See Your Snapshot
          </a>
        </div>

        <p style="color: #4A4A4A; font-size: 14px; line-height: 1.5;">
          No pitch — just thought you'd want to know. Happy to chat if you have questions about what any of it means.
        </p>

        <p style="color: #1A1A1A; font-size: 14px; margin-top: 24px;">
          — Simply Black and White
        </p>
      </div>

      <div style="padding: 20px 32px; background: #F7F7F5; text-align: center; border-top: 1px solid #E5E5E5;">
        <p style="font-size: 12px; color: #666; margin: 0;">Simply Black and White · simplyblackandwhite.com</p>
        <p style="font-size: 11px; color: #999; margin: 8px 0 0;"><a href="${unsubLink}" style="color: #999;">Unsubscribe</a></p>
      </div>
    </div>
  `;

  try {
    const { data, error } = await client.emails.send({ from, to: toEmail, subject, html });
    if (error) {
      console.error('[Notifier] Outreach email error:', error);
      return { sent: false, reason: 'api_error', error };
    }
    console.log('[Notifier] Outreach sent to', toEmail, ':', data.id);
    return { sent: true, id: data.id };
  } catch (err) {
    console.error('[Notifier] Outreach email failed:', err.message);
    return { sent: false, reason: 'exception', error: err.message };
  }
}
