-- Simply Black and White — Database Schema
-- SQLite (better-sqlite3)
-- Auto-applied on server startup via database.js

-- ─── Scans Table ────────────────────────────────────────────────────────────
-- Stores every light scan and full scan result
CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  scan_type TEXT NOT NULL DEFAULT 'light', -- 'light' or 'full'
  total_issues INTEGER DEFAULT 0,
  critical INTEGER DEFAULT 0,
  serious INTEGER DEFAULT 0,
  moderate INTEGER DEFAULT 0,
  minor INTEGER DEFAULT 0,
  pages_scanned INTEGER DEFAULT 1, -- Number of pages crawled in multi-page scan
  accessibility_score INTEGER DEFAULT 0, -- Weighted 0-100 score
  human_risks TEXT, -- JSON array
  technical_risks TEXT, -- JSON array
  aeo_score INTEGER DEFAULT 0,
  aeo_grade TEXT,
  aeo_findings TEXT, -- JSON array
  raw_results TEXT, -- Full JSON blob for detailed retrieval
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Leads Table ────────────────────────────────────────────────────────────
-- Contact form submissions and scan-triggered leads
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT,
  website TEXT,
  service_interest TEXT,
  message TEXT,
  source TEXT NOT NULL DEFAULT 'contact_form', -- 'contact_form', 'scan', 'manual', 'outreach'
  scan_id INTEGER, -- Links to a scan if lead came from scan
  token TEXT UNIQUE, -- Unique token for public report access
  status TEXT NOT NULL DEFAULT 'new', -- 'new', 'contacted', 'qualified', 'closed'
  report_viewed_at TEXT, -- When prospect clicked the report link
  followup_sent_at TEXT, -- When the 48hr follow-up was sent
  unsubscribed INTEGER DEFAULT 0, -- 1 = opted out of emails
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (scan_id) REFERENCES scans(id)
);

-- ─── Quotes Table ───────────────────────────────────────────────────────────
-- Generated quotes from the internal quote engine
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id INTEGER, -- Links to the scan that generated this quote
  lead_id INTEGER, -- Links to a lead if associated
  recommended_tier TEXT NOT NULL, -- 'tier1', 'tier2', 'tier3'
  tier1_price_low INTEGER,
  tier1_price_high INTEGER,
  tier2_price_low INTEGER,
  tier2_price_high INTEGER,
  tier3_price_low INTEGER,
  tier3_price_high INTEGER,
  scope_summary TEXT, -- Generated scope description
  notes TEXT, -- Manual notes added by Pranish
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'sent', 'accepted', 'declined'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (scan_id) REFERENCES scans(id),
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);

-- ─── Clients Table ───────────────────────────────────────────────────────────
-- Groups scans by domain into client profiles
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL UNIQUE, -- e.g. "example.com"
  display_name TEXT, -- Optional friendly name (e.g. "Acme Corp")
  favicon_url TEXT, -- Cached favicon URL
  contact_email TEXT, -- Contact email for outreach
  notes TEXT, -- Free-form notes about the client
  outreach_sent_at TEXT, -- Last outreach email sent timestamp
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_scans_url ON scans(url);
CREATE INDEX IF NOT EXISTS idx_scans_created ON scans(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_quotes_scan ON quotes(scan_id);
CREATE INDEX IF NOT EXISTS idx_clients_domain ON clients(domain);
