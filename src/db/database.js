'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/sbw.db');

let db = null;

/**
 * Get or initialize the SQLite database connection.
 * Runs schema migration on first call.
 */
function getDb() {
  if (db) return db;

  // Ensure the data directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);

  // Performance pragmas for better write performance
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // Run schema migration
  migrate(db);

  return db;
}

/**
 * Apply schema.sql if tables don't exist yet.
 * Also runs safe ALTER TABLE migrations for new columns.
 */
function migrate(database) {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  database.exec(schema);

  // ─── Incremental Migrations (safe to re-run) ────────────────
  const scanCols = database.prepare("PRAGMA table_info(scans)").all().map(c => c.name);
  if (!scanCols.includes('pages_scanned')) {
    database.exec("ALTER TABLE scans ADD COLUMN pages_scanned INTEGER DEFAULT 1");
  }
  if (!scanCols.includes('accessibility_score')) {
    database.exec("ALTER TABLE scans ADD COLUMN accessibility_score INTEGER DEFAULT 0");
  }

  // Leads table migrations
  const leadCols = database.prepare("PRAGMA table_info(leads)").all().map(c => c.name);
  if (!leadCols.includes('token')) {
    database.exec("ALTER TABLE leads ADD COLUMN token TEXT");
    database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_token ON leads(token)");
  }
  if (!leadCols.includes('report_viewed_at')) {
    database.exec("ALTER TABLE leads ADD COLUMN report_viewed_at TEXT");
  }
  if (!leadCols.includes('followup_sent_at')) {
    database.exec("ALTER TABLE leads ADD COLUMN followup_sent_at TEXT");
  }
  if (!leadCols.includes('unsubscribed')) {
    database.exec("ALTER TABLE leads ADD COLUMN unsubscribed INTEGER DEFAULT 0");
  }

  // Clients table migrations
  const clientCols = database.prepare("PRAGMA table_info(clients)").all().map(c => c.name);
  if (!clientCols.includes('contact_email')) {
    database.exec("ALTER TABLE clients ADD COLUMN contact_email TEXT");
  }
  if (!clientCols.includes('outreach_sent_at')) {
    database.exec("ALTER TABLE clients ADD COLUMN outreach_sent_at TEXT");
  }

  console.log('[DB] Schema applied — tables ready.');
}

/**
 * Close the database connection gracefully.
 */
function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

// ─── Scan Operations ───────────────────────────────────────────────────────

/**
 * Save a scan result to the database.
 * @param {object} scanData - Processed scan results
 * @returns {object} - The inserted row with id
 */
function saveScan(scanData) {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO scans (url, scan_type, total_issues, critical, serious, moderate, minor,
                       pages_scanned, accessibility_score,
                       human_risks, technical_risks, aeo_score, aeo_grade, aeo_findings, raw_results)
    VALUES (@url, @scan_type, @total_issues, @critical, @serious, @moderate, @minor,
            @pages_scanned, @accessibility_score,
            @human_risks, @technical_risks, @aeo_score, @aeo_grade, @aeo_findings, @raw_results)
  `);

  const result = stmt.run({
    url: scanData.url,
    scan_type: scanData.scanType || 'light',
    total_issues: scanData.summary.totalIssues,
    critical: scanData.summary.critical,
    serious: scanData.summary.serious,
    moderate: scanData.summary.moderate,
    minor: scanData.summary.minor,
    pages_scanned: scanData.crawl ? scanData.crawl.pagesScanned : 1,
    accessibility_score: scanData.summary.accessibilityScore || 0,
    human_risks: JSON.stringify(scanData.summary.humanRisks),
    technical_risks: JSON.stringify(scanData.summary.technicalRisks),
    aeo_score: scanData.aeo ? scanData.aeo.score : 0,
    aeo_grade: scanData.aeo ? scanData.aeo.grade : null,
    aeo_findings: scanData.aeo ? JSON.stringify(scanData.aeo.findings) : '[]',
    raw_results: JSON.stringify(scanData),
  });

  return { id: result.lastInsertRowid, ...scanData };
}

/**
 * Get all scans, most recent first.
 * @param {number} limit - Max results to return
 * @returns {Array}
 */
function getScans(limit = 50) {
  const database = getDb();
  return database.prepare(
    'SELECT * FROM scans ORDER BY created_at DESC LIMIT ?'
  ).all(limit);
}

/**
 * Get scans for a specific domain (for score-over-time charts).
 * @param {string} domain - The domain to filter by (e.g., "example.com")
 * @param {number} limit
 * @returns {Array}
 */
function getScansForDomain(domain, limit = 20) {
  const database = getDb();
  return database.prepare(
    "SELECT id, url, accessibility_score, aeo_score, total_issues, critical, serious, moderate, minor, pages_scanned, created_at FROM scans WHERE url LIKE ? ORDER BY created_at ASC LIMIT ?"
  ).all(`%${domain}%`, limit);
}

/**
 * Get a single scan by ID.
 * @param {number} id
 * @returns {object|undefined}
 */
function getScanById(id) {
  const database = getDb();
  return database.prepare('SELECT * FROM scans WHERE id = ?').get(id);
}

// ─── Lead Operations ───────────────────────────────────────────────────────

/**
 * Save a new lead.
 * @param {object} leadData
 * @returns {object}
 */
function saveLead(leadData) {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO leads (name, email, website, service_interest, message, source, scan_id)
    VALUES (@name, @email, @website, @service_interest, @message, @source, @scan_id)
  `);

  const result = stmt.run({
    name: leadData.name || null,
    email: leadData.email || null,
    website: leadData.website || null,
    service_interest: leadData.serviceInterest || null,
    message: leadData.message || null,
    source: leadData.source || 'contact_form',
    scan_id: leadData.scanId || null,
  });

  return { id: result.lastInsertRowid };
}

/**
 * Get all leads, most recent first.
 * @param {number} limit
 * @returns {Array}
 */
function getLeads(limit = 50) {
  const database = getDb();
  return database.prepare(
    'SELECT * FROM leads ORDER BY created_at DESC LIMIT ?'
  ).all(limit);
}

/**
 * Update lead status.
 * @param {number} id
 * @param {string} status
 */
function updateLeadStatus(id, status) {
  const database = getDb();
  database.prepare(
    "UPDATE leads SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(status, id);
}

/**
 * Save a lead with a unique token for public report access.
 * @param {object} leadData
 * @returns {object} - Lead with id and token
 */
function saveLeadWithToken(leadData) {
  const database = getDb();
  const crypto = require('crypto');
  const token = crypto.randomBytes(24).toString('hex');

  const stmt = database.prepare(`
    INSERT INTO leads (name, email, website, service_interest, message, source, scan_id, token)
    VALUES (@name, @email, @website, @service_interest, @message, @source, @scan_id, @token)
  `);

  const result = stmt.run({
    name: leadData.name || null,
    email: leadData.email || null,
    website: leadData.website || null,
    service_interest: leadData.serviceInterest || null,
    message: leadData.message || null,
    source: leadData.source || 'scan',
    scan_id: leadData.scanId || null,
    token,
  });

  return { id: result.lastInsertRowid, token };
}

/**
 * Get a lead by its public token.
 * @param {string} token
 * @returns {object|undefined}
 */
function getLeadByToken(token) {
  const database = getDb();
  return database.prepare('SELECT * FROM leads WHERE token = ?').get(token);
}

/**
 * Mark a lead's report as viewed.
 * @param {string} token
 */
function markReportViewed(token) {
  const database = getDb();
  database.prepare(
    "UPDATE leads SET report_viewed_at = datetime('now'), updated_at = datetime('now') WHERE token = ?"
  ).run(token);
}

/**
 * Mark a follow-up as sent for a lead.
 * @param {number} id
 */
function markFollowupSent(id) {
  const database = getDb();
  database.prepare(
    "UPDATE leads SET followup_sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  ).run(id);
}

/**
 * Get leads eligible for follow-up (scan source, no follow-up sent, not unsubscribed, older than 48 hours).
 * @returns {Array}
 */
function getLeadsForFollowup() {
  const database = getDb();
  return database.prepare(`
    SELECT l.*, s.url as scan_url, s.total_issues, s.accessibility_score, s.aeo_grade
    FROM leads l
    LEFT JOIN scans s ON l.scan_id = s.id
    WHERE l.source = 'scan'
      AND l.followup_sent_at IS NULL
      AND l.unsubscribed = 0
      AND l.email IS NOT NULL
      AND l.created_at <= datetime('now', '-48 hours')
    ORDER BY l.created_at ASC
    LIMIT 20
  `).all();
}

/**
 * Unsubscribe a lead by token.
 * @param {string} token
 */
function unsubscribeLead(token) {
  const database = getDb();
  database.prepare(
    "UPDATE leads SET unsubscribed = 1, updated_at = datetime('now') WHERE token = ?"
  ).run(token);
}

/**
 * Update client contact email.
 * @param {number} id
 * @param {string} email
 */
function updateClientEmail(id, email) {
  const database = getDb();
  database.prepare(
    "UPDATE clients SET contact_email = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(email, id);
}

/**
 * Mark outreach sent for a client.
 * @param {number} id
 */
function markOutreachSent(id) {
  const database = getDb();
  database.prepare(
    "UPDATE clients SET outreach_sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  ).run(id);
}

// ─── Quote Operations ──────────────────────────────────────────────────────

/**
 * Save a generated quote.
 * @param {object} quoteData
 * @returns {object}
 */
function saveQuote(quoteData) {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO quotes (scan_id, lead_id, recommended_tier,
                        tier1_price_low, tier1_price_high,
                        tier2_price_low, tier2_price_high,
                        tier3_price_low, tier3_price_high,
                        scope_summary, notes, status)
    VALUES (@scan_id, @lead_id, @recommended_tier,
            @tier1_price_low, @tier1_price_high,
            @tier2_price_low, @tier2_price_high,
            @tier3_price_low, @tier3_price_high,
            @scope_summary, @notes, @status)
  `);

  const result = stmt.run({
    scan_id: quoteData.scanId || null,
    lead_id: quoteData.leadId || null,
    recommended_tier: quoteData.recommendedTier,
    tier1_price_low: quoteData.tier1PriceLow || null,
    tier1_price_high: quoteData.tier1PriceHigh || null,
    tier2_price_low: quoteData.tier2PriceLow || null,
    tier2_price_high: quoteData.tier2PriceHigh || null,
    tier3_price_low: quoteData.tier3PriceLow || null,
    tier3_price_high: quoteData.tier3PriceHigh || null,
    scope_summary: quoteData.scopeSummary || null,
    notes: quoteData.notes || null,
    status: quoteData.status || 'draft',
  });

  return { id: result.lastInsertRowid };
}

/**
 * Get all quotes, most recent first.
 * @param {number} limit
 * @returns {Array}
 */
function getQuotes(limit = 50) {
  const database = getDb();
  return database.prepare(
    'SELECT * FROM quotes ORDER BY created_at DESC LIMIT ?'
  ).all(limit);
}

// ─── Client Operations ─────────────────────────────────────────────────────

/**
 * Get or create a client profile for a domain.
 * @param {string} domain - e.g. "example.com"
 * @returns {object} - Client record
 */
function getOrCreateClient(domain) {
  const database = getDb();
  let client = database.prepare('SELECT * FROM clients WHERE domain = ?').get(domain);

  if (!client) {
    const stmt = database.prepare(`
      INSERT INTO clients (domain, favicon_url) VALUES (?, ?)
    `);
    const faviconUrl = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=64';
    const result = stmt.run(domain, faviconUrl);
    client = database.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);
  }

  return client;
}

/**
 * Get all clients with their latest scan stats.
 * @returns {Array}
 */
function getClientsWithStats() {
  const database = getDb();

  const clients = database.prepare('SELECT * FROM clients ORDER BY updated_at DESC').all();

  return clients.map(client => {
    // Get latest scan for this domain
    const latestScan = database.prepare(
      "SELECT id, total_issues, accessibility_score, aeo_grade, pages_scanned, created_at FROM scans WHERE url LIKE ? ORDER BY created_at DESC LIMIT 1"
    ).get(`%${client.domain}%`);

    // Get previous scan for delta comparison
    const previousScan = database.prepare(
      "SELECT total_issues, accessibility_score FROM scans WHERE url LIKE ? ORDER BY created_at DESC LIMIT 1 OFFSET 1"
    ).get(`%${client.domain}%`);

    // Count total scans
    const scanCount = database.prepare(
      "SELECT COUNT(*) as count FROM scans WHERE url LIKE ?"
    ).get(`%${client.domain}%`);

    return {
      ...client,
      latestScan: latestScan || null,
      previousScan: previousScan || null,
      totalScans: scanCount ? scanCount.count : 0,
      delta: latestScan && previousScan ? {
        issues: latestScan.total_issues - previousScan.total_issues,
        score: latestScan.accessibility_score - previousScan.accessibility_score,
      } : null,
    };
  });
}

/**
 * Get a single client by ID.
 * @param {number} id
 * @returns {object|undefined}
 */
function getClientById(id) {
  const database = getDb();
  return database.prepare('SELECT * FROM clients WHERE id = ?').get(id);
}

/**
 * Get a client by domain.
 * @param {string} domain
 * @returns {object|undefined}
 */
function getClientByDomain(domain) {
  const database = getDb();
  return database.prepare('SELECT * FROM clients WHERE domain = ?').get(domain);
}

/**
 * Update client notes.
 * @param {number} id
 * @param {string} notes
 */
function updateClientNotes(id, notes) {
  const database = getDb();
  database.prepare(
    "UPDATE clients SET notes = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(notes, id);
}

/**
 * Update client display name.
 * @param {number} id
 * @param {string} displayName
 */
function updateClientName(id, displayName) {
  const database = getDb();
  database.prepare(
    "UPDATE clients SET display_name = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(displayName, id);
}

/**
 * Get all scans for a specific domain.
 * @param {string} domain
 * @param {number} limit
 * @returns {Array}
 */
function getScansForClient(domain, limit = 50) {
  const database = getDb();
  return database.prepare(
    "SELECT id, url, scan_type, total_issues, critical, serious, moderate, minor, pages_scanned, accessibility_score, aeo_score, aeo_grade, created_at FROM scans WHERE url LIKE ? ORDER BY created_at DESC LIMIT ?"
  ).all(`%${domain}%`, limit);
}

/**
 * Delete a scan by ID.
 * @param {number} id
 * @returns {boolean} - Whether the row was deleted
 */
function deleteScan(id) {
  const database = getDb();
  // Detach leads referencing this scan (don't delete leads — they're still contacts)
  database.prepare('UPDATE leads SET scan_id = NULL WHERE scan_id = ?').run(id);
  // Delete associated quotes
  database.prepare('DELETE FROM quotes WHERE scan_id = ?').run(id);
  const result = database.prepare('DELETE FROM scans WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Delete a client and all associated scans.
 * @param {number} id
 * @returns {boolean}
 */
function deleteClient(id) {
  const database = getDb();
  const client = database.prepare('SELECT domain FROM clients WHERE id = ?').get(id);
  if (!client) return false;

  // Delete all scans for this domain (and associated quotes + leads)
  const scans = database.prepare("SELECT id FROM scans WHERE url LIKE ?").all(`%${client.domain}%`);
  for (const scan of scans) {
    database.prepare('DELETE FROM quotes WHERE scan_id = ?').run(scan.id);
    database.prepare('UPDATE leads SET scan_id = NULL WHERE scan_id = ?').run(scan.id);
  }
  database.prepare("DELETE FROM scans WHERE url LIKE ?").run(`%${client.domain}%`);
  database.prepare('DELETE FROM clients WHERE id = ?').run(id);
  return true;
}

module.exports = {
  DB_PATH,
  getDb,
  closeDb,
  saveScan,
  getScans,
  getScansForDomain,
  getScanById,
  deleteScan,
  saveLead,
  saveLeadWithToken,
  getLeadByToken,
  markReportViewed,
  markFollowupSent,
  getLeadsForFollowup,
  unsubscribeLead,
  getLeads,
  updateLeadStatus,
  saveQuote,
  getQuotes,
  getOrCreateClient,
  getClientsWithStats,
  getClientById,
  getClientByDomain,
  updateClientNotes,
  updateClientName,
  updateClientEmail,
  markOutreachSent,
  getScansForClient,
  deleteClient,
};
