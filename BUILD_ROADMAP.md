# Simply Black and White — Build Roadmap

**Project:** simplyblackandwhite.com  
**Stack:** Node.js · Express · SQLite · Vanilla JS · Puppeteer · axe-core  
**Deployment Target:** Railway (persistent volume)  
**Last Updated:** Phase 9 complete, Phase 7 rebuilt — Multi-page crawl engine + Client profile workspace

---

## Project Structure

```
simply-black-and-white/
├── public/
│   ├── css/
│   │   ├── main.css                 # Global styles, design tokens, typography
│   │   └── scanner.css              # Dashboard-specific styles
│   ├── js/
│   │   ├── drink-generator.js       # Compliant Caffeine Calculator logic
│   │   └── light-scan.js            # Homepage scan input handler
│   └── images/                      # Logo assets, OG image
├── views/
│   ├── partials/
│   │   ├── head.html                # <head> with meta, fonts, schema
│   │   ├── header.html              # Skip link + site nav
│   │   └── footer.html              # Footer + legal
│   ├── index.html                   # Homepage
│   ├── scanner.html                 # Internal dashboard
│   └── login.html                   # Google OAuth landing
├── src/
│   ├── server.js                    # Express app entry point
│   ├── auth/
│   │   └── passport.js              # Google OAuth2 strategy config
│   ├── routes/
│   │   ├── public.js                # Homepage + light scan endpoint
│   │   └── scanner.js               # Protected dashboard routes
│   ├── scanner/
│   │   ├── engine.js                # Puppeteer + axe-core orchestrator
│   │   ├── aeo-analyzer.js          # Semantic tag + schema + AEO scoring
│   │   └── quote-generator.js       # Scoring → tier → price range logic
│   ├── db/
│   │   ├── database.js              # SQLite connection + schema bootstrap
│   │   └── schema.sql               # Table definitions
│   └── utils/
│       ├── notifier.js              # Nodemailer Gmail SMTP notification
│       ├── sanitizer.js             # URL validation + sanitization
│       └── pricing-config.js        # Editable tier price ranges
├── .env.example
├── .gitignore
├── package.json
├── railway.toml
└── README.md
```

---

## AEO Content & Visibility Strategy

*Captured from AEO meeting notes — Aug 2026. These decisions influence copy, pages, and scanner logic across multiple phases.*

### 1. Conversational Query Matching (FAQ Content)
AI search engines answer natural-language questions by citing pages that directly answer them. We build a FAQ section targeting the exact questions our clients ask:
- "Does my small business website need to be ADA compliant?"
- "What happens if my website fails an accessibility audit?"
- "What is AEO and why does it matter for my business?"
- "Should I hire a consultant or use an accessibility overlay tool?"
- "What's the difference between an accessibility audit and ongoing monitoring?"

**Implementation:** FAQ section on homepage + dedicated `/faq` page with JSON-LD FAQPage schema.

### 2. Third-Party Entity Corroboration
Since Simply Black and White is a new brand, there are no third-party citations yet. The strategy is to seed the ecosystem post-launch:
- Get listed on: Google Business Profile, Yelp, Clutch, Bark.com, Thumbtack, LinkedIn Company Page
- Pursue one or two guest posts or quotes on accessibility/digital marketing blogs
- Goal: "entity corroboration" — multiple independent sources describing the business consistently

**Implementation:** No code change needed. Tracked here as a launch-week action item. The website itself must use consistent entity language (same name, services, location) across homepage, about page, and schema markup.

### 3. Comparison & "Which is Better" Content
AI models answer opinion and comparison queries by citing pages that address the comparison directly. We position SBW's approach against the *alternatives people consider* — without naming competitors:
- "Overlay tools vs. real accessibility consulting"
- "One-time audit vs. ongoing monitoring"
- "Automated scanning vs. manual remediation"

**Implementation:** Addressed in FAQ content and a `/why-us` or `/resources` section. No competitor naming — framed as approach comparison only (legally safe).

### 4. AI Bot Crawlable Versions
Two concrete deliverables to maximize AI crawler accessibility:
- **`/llms.txt`** — emerging standard for AI crawlers (similar to `robots.txt`). Plain text file describing who SBW is, core services, and priority pages. Already being read by major AI companies.
- **`/ai`** — a minimal no-CSS, pure semantic HTML page distilling core entity statements, services, FAQ answers, and schema into one clean crawlable document.

**Implementation:** Added to Phase 10. Both are lightweight — `/llms.txt` is ~30 lines, `/ai` is a stripped HTML page.

### 5. Legal Content Validity
Key guardrails for all copy on the site:
- **Never use:** "fully compliant," "100% accessible," "guarantee compliance" — these are legally indefensible
- **Always use:** risk mitigation framing — "reduce risk," "improve accessibility," "help you toward compliance"
- **AEO claims:** "improve AI search visibility" is fine; specific ranking/citation outcome guarantees are not
- **Testimonials (future):** must include "results vary" disclaimer
- The active present-tense rule already in place ("We provide," "We analyze," "We help") naturally steers away from guarantee language — maintain this discipline in all copy

**Implementation:** Copy review checklist added to Phase 10 pre-launch tasks.

---

## Build Phases

### Phase 1 — Foundation ✅ COMPLETE
- [x] `package.json` with all dependencies (pinned, audited)
- [x] `src/server.js` — Express app, middleware, rate limiting, route wiring
- [x] `.env.example` — all required environment variables documented
- [x] `.gitignore`
- [x] `public/css/main.css` — full design system: tokens, reset, typography, layout, buttons, forms, utilities
- [x] Google Fonts integration (Libre Baskerville + Inter via CSS @import)
- [x] `railway.toml` — deployment config with persistent volume notes
- [x] All placeholder stubs created for Phases 2–9
- [x] Server verified: boots cleanly, health check 200, auth guard active

**Key versions:** express 4.22.2 · better-sqlite3 11.10.0 · puppeteer 24.15.0 · nodemailer 9.0.4

**Check-in point ✓**

---

### Phase 2 — Homepage (Public Website) ✅ COMPLETE
- [x] `views/partials/head.html` — full meta, OG, Twitter card, JSON-LD ProfessionalService schema
- [x] `views/partials/header.html` — skip link, sticky header, ARIA mobile toggle, Escape key handler
- [x] `views/partials/footer.html` — 4-column grid, legal disclaimer, dynamic copyright year
- [x] `views/index.html` — 7 complete sections, 36.5KB, 17/17 structural checks passed:
  - Hero — headline, subhead, dual CTA, trust indicators, SBW monogram visual
  - Why Accessibility — 3 cards (human impact, legal, AEO)
  - Services — 3 tier cards with featured state, full feature lists
  - Free Scan — URL input, results panel (Phase 4 wires backend), "How it works" steps
  - Compliant Caffeine Calculator — 3-category picker, result card (Phase 3 wires JS)
  - About — brand story, 4 core values grid, SBW monogram
  - Contact / CTA — form with live status region, contact aside with trust blocks
- [x] All WCAG AAA: semantic landmarks, aria-labelledby on every section, aria-live regions, focus rings
- [x] `public/css/main.css` — full section CSS added: hero, why-cards, service-cards, scan-box, drink generator, about, contact
- [x] GET `/` verified: 200 OK, all routes tested
- [ ] **Polish pass** (post-features): visual fine-tuning, copy review, FAQ section addition (see AEO Strategy above)

**Check-in point ✓**

---

### Phase 3 — The Compliant Caffeine Calculator ⬅ NEXT
- [ ] `public/js/drink-generator.js` — full randomizer logic:
  - Three categories: Coffee/Espresso, Tea/Matcha, Fresh Juice/Refreshers
  - Dynamic stitching: base + milk + sweetness + toppings
  - Brand compliance puns paired with each result
- [ ] Homepage integration (UI component within `index.html`)
- [ ] Fully keyboard-accessible and screen-reader-friendly interaction

**Check-in point ✓**

---

### Phase 4 — Light Scan UI + API + Notifications
- [ ] `public/js/light-scan.js` — frontend scan form handler, results display
- [ ] `src/utils/sanitizer.js` — URL validation, sanitization, reachability check
- [ ] `src/scanner/engine.js` — Puppeteer + axe-core headless scan orchestrator
- [ ] Light scan output logic: 2 non-technical risks + 2 technical risks + AEO snapshot
- [ ] Results displayed on homepage (gated deep remediation behind CTA)
- [ ] `src/utils/notifier.js` — Nodemailer Gmail SMTP; fires on every scan submission
- [ ] Scan endpoint: POST `/api/scan/light`

**Check-in point ✓**

---

### Phase 5 — Database Layer ✅ COMPLETE
- [x] `src/db/schema.sql` — tables: `scans`, `leads`, `quotes` with indexes
- [x] `src/db/database.js` — SQLite connection, auto-migration on startup, full CRUD operations
- [x] Persist scan results, timestamps, target URLs, lead data
- [x] Session store wired to SQLite (express-session + connect-sqlite3)
- [x] Contact form wired to DB + email notification

**Check-in point ✓**

---

### Phase 6 — Authentication (Google OAuth2) ✅ COMPLETE
- [x] Google Cloud project setup instructions (documented below)
- [x] `src/auth/passport.js` — Passport.js Google OAuth2 strategy with email whitelist
- [x] Login/logout routes, session persistence, returnTo redirect
- [x] `views/login.html` — branded login page with Google button, error handling, SBW monogram
- [x] Auth middleware protecting all `/scanner/*` routes (302 redirect to login)
- [x] Whitelist: only frictionlessaccess@gmail.com can authenticate
- [x] Scan history API wired (`GET /scanner/api/scans`, `GET /scanner/api/scans/:id`)
- [x] Current user endpoint (`GET /scanner/api/me`)

**Check-in point ✓**

---

### Phase 7 — Scanner Dashboard (Internal App) ✅ COMPLETE
- [x] `views/scanner.html` — full mobile-responsive dashboard with client profile workspace:
  - URL input + scan trigger with configurable crawl options (max pages, max depth, robots.txt, age gate)
  - **Multi-page crawl engine** — discovers internal links, crawls up to 50 pages at configurable depth
  - **Client profiles** — auto-created per domain with favicon, notes, editable display name
  - **Tabbed results view**: Overview, Issues, AEO Health, Quote, Pages
  - **Accessibility Overview tab**: compliance gauge, WCAG level cards, most common issues donut chart, average issues by depth bar chart, disability category breakdown (visual/auditory/motor/cognitive), score-over-time and levels-over-time charts
  - Issues tab with severity filtering (all/technical/content)
  - AEO Health tab with findings list
  - Quote tab with copy/export
  - Pages tab with per-page breakdown by depth
  - Scan history per client with View/Report/Delete
  - Delete client/scan with confirmation dialogs
  - Score delta comparison between scans
- [x] `public/css/scanner.css` — dashboard layout, tabs, charts, profile cards, all component styles
- [x] `public/js/scanner-app.js` — full client-side app (Chart.js for visualization)
- [x] `src/routes/scanner.js` — all protected dashboard API routes including client CRUD
- [x] `src/db/schema.sql` — clients table, pages_scanned/accessibility_score columns
- [x] POST `/scanner/api/scan/full` — multi-page crawl scan endpoint
- [x] GET/PUT/DELETE `/scanner/api/clients` — client profile management
- [x] DELETE `/scanner/api/scans/:id` — scan deletion
- [x] **Age gate bypass** — handles yes/no buttons, DOB forms, year dropdowns, checkboxes, date inputs
- [x] **Disability category mapping** — maps axe-core rules to visual/auditory/motor/cognitive impact
- [x] Mobile-optimized for on-the-go use during client meetings

**Check-in point ✓**

---

### Phase 8 — Quote Generator Engine ✅ COMPLETE
- [x] `src/utils/pricing-config.js` — editable tier price ranges:
  - Tier 1 "Clear View" Audit: $500–$800 flat rate
  - Tier 2 "Clean Slate" Orchestration: $1,500–$4,000 project-based
  - Tier 3 "Always Open" Guardian: $400–$800/mo retainer
- [x] `src/scanner/quote-generator.js` — scoring algorithm:
  - Inputs: error count, severity breakdown (critical/serious/moderate/minor), detected platform, AEO score
  - Platform multipliers: Wix 1.3x, GoDaddy 1.35x, Shopify 1.15x, Next.js 0.95x, etc.
  - Output: recommended tier + dynamic price range + scope summary + rationale
- [x] Platform/CMS detection (WordPress, Shopify, Wix, Squarespace, Webflow, GoDaddy, Drupal, Joomla, Next.js, Gatsby, HubSpot, WooCommerce)
- [x] Quote persistence to database (quotes table)
- [x] Quote export — branded printable proposal page (`/scanner/quote/:scanId`)
- [x] Copy-to-clipboard plain text quote in dashboard

**Check-in point ✓**

---

### Phase 9 — AEO Analyzer ✅ COMPLETE
- [x] `src/scanner/aeo-analyzer.js` — full AEO scoring module:
  - Semantic tag density (`<article>`, `<section>`, `<nav>`, `<main>`, `<header>`, `<footer>`)
  - JSON-LD Schema presence + basic structural validity
  - Heading hierarchy check (h1→h6 logical order)
  - Active present-tense phrasing detection (heuristic)
  - AI-readability score (div-soup vs semantic ratio)
  - **Conversational query readiness** — checks for FAQ schema, question-format headings
  - **Comparison content detection** — flags absence of approach/alternative framing
  - Output: AEO health score (150pt raw → normalized to 100) + actionable findings with categories
- [x] Integrated into both light scan (snapshot: 5 checks, 3 shown, rest gated) and full scanner (deep: all 8 checks, 9 findings)

**Check-in point ✓**

---

### Phase 10 — Deployment & Launch Prep
- [x] `railway.toml` finalized with volume mount path — build/deploy/healthcheck configured, env var notes updated for Resend + dual-email setup
- [x] `.env.example` fully documented
- [x] `README.md` — complete setup, deployment, and configuration guide
- [ ] GoDaddy DNS → Railway custom domain setup (documented in README)
- [x] Final accessibility audit — dogfooded with Nightwolf: homepage + all legal/faq pages scored 100%, 0 issues. Also surfaced & fixed a port-stripping crawler bug in the process.
- [x] Legal pages: Terms of Service, Privacy Policy, Accessibility Statement — all complete, linked in all footers, privacy updated for Phase 11 email flows
- [x] **`/llms.txt`** — AI crawler descriptor file (name, services, priority pages, contact) — served at /llms.txt, updated with faq/ai/accessibility pages
- [x] **`/ai` page** — minimal semantic HTML page for AI bot crawling with ProfessionalService + entity statements, services, 6 FAQ answers, JSON-LD schema
- [x] **FAQ page** — `/faq` route with JSON-LD FAQPage schema (6 conversational-query questions), linked in footers
- [ ] **Copy legal review checklist** — verify no guarantee language, all claims use risk-mitigation framing, AEO claims are defensible
- [ ] **Launch-week actions** (not code): Google Business Profile, Clutch, Bark.com, Thumbtack, LinkedIn Company Page listings for third-party entity corroboration

**Check-in point ✓**

---

### Phase 11 — Lead Capture & Email Automation (Resend)

*Strategy: give value first, capture email second. Never gate the initial scan.*

#### 11A — Light Scan Email Capture
- [ ] After light scan results display, show soft email prompt: "Get the full accessibility breakdown — where should we send it?"
- [ ] Save email + scan ID to `leads` table (source: 'scan')
- [ ] Immediately send branded "Here's your accessibility snapshot" email via Resend:
  - Accessibility score, top 3 issues in plain English, AEO grade
  - CTA: "See your full report" → links to `/report/light/:token`
  - No specific fix instructions (those are paid)
- [ ] **Public light report page** (`/report/light/:token`) — token-based, no auth required
  - Shows: score gauge, severity summary, top issues (plain English), AEO grade
  - Gated: full issue list, how-to-fix, code locations, workbook
  - CTA: "Ready to fix these? Book a free consultation"

#### 11B — Automated Follow-up Sequence
- [ ] 48-hour follow-up email (triggered if no action taken):
  - Subject: something on-brand and light — not salesy
  - Body: reminds them of their score, highlights the #1 risk in human terms
  - CTA: "Pick up where you left off" → links back to their saved report
- [ ] Track email status in `leads` table (sent, opened — if Resend supports webhooks)
- [ ] Respect unsubscribe — include one-click opt-out link in every email

#### 11C — Dashboard Outreach (Prospect Emails)
- [ ] Add `contact_email` field to `clients` table (manually entered by Pranish)
- [ ] "Send Snapshot" button on client profile in dashboard
- [ ] Sends a personalized outreach email via Resend:
  - NOT the full report — just a branded **accessibility snapshot**:
    - Score, severity count, top 2-3 risks in plain English, AEO grade
    - "We noticed a few things about your site. Here's what we found."
  - Links to public mini-report page (same token-based page from 11A)
  - Soft CTA: "Happy to walk you through this — no obligation"
- [ ] Track outreach status per client (draft → sent → opened → replied)
- [ ] Rate limiting: no more than 1 outreach email per client per 30 days

#### 11D — Email Templates & Branding
- [ ] All emails use SBW brand: Libre Baskerville headings, Inter body, charcoal/ivory palette
- [ ] Plain text fallback for all HTML emails
- [ ] Footer: "Simply Black and White · simplyblackandwhite.com · Unsubscribe"
- [ ] Risk-mitigation language only (no "fully compliant" / "guarantee" per legal guardrails)

**Key decisions:**
| Topic | Decision |
|---|---|
| Email provider | Resend (free tier: 100/day, 3,000/month) |
| Capture timing | Post-results, never pre-scan |
| Follow-up delay | 48 hours |
| Outreach frequency | Max 1 per client per 30 days |
| Report gating | Snapshot = free, fixes/workbook = paid |
| Token expiry | 30 days (re-scannable after expiry) |

**Check-in point ✓**

---

### Phase 12 — Accessibility Fixer (AI-Powered Code Remediation Tool)

*A personal internal tool for Pranish. Paste non-compliant HTML, get back fixed compliant code + an explanation of what changed and why. Speeds up remediation work during client engagements.*

#### 12A — Standalone Fixer Page
- [ ] New protected route: `/scanner/fixer`
- [ ] UI: paste/input area for HTML code + optional violation context (e.g., "missing alt text", "low contrast", "no skip link")
- [ ] Output panel: fixed code (syntax highlighted, copyable) + plain-English explanation of changes
- [ ] Copy-to-clipboard button for the fixed code
- [ ] History of recent fixes (session-only, no DB persistence needed)

#### 12B — Rules Engine (Top 20 Issues — Instant, No API Cost)
- [ ] Deterministic fix logic for the most common axe-core violations:
  - `image-alt` — add descriptive alt attribute (placeholder prompt if image context unknown)
  - `color-contrast` — suggest compliant color alternatives
  - `link-name` — add aria-label or visible text
  - `button-name` — add aria-label or visible text
  - `label` — associate label with input via `for`/`id`
  - `html-has-lang` — add `lang="en"` to `<html>`
  - `document-title` — add `<title>` element
  - `heading-order` — restructure heading hierarchy
  - `bypass` — insert skip-to-content link
  - `landmark-one-main` — wrap content in `<main>`
  - `region` — wrap content in appropriate landmarks
  - `aria-hidden-focus` — remove from tab order or un-hide
  - `meta-viewport` — remove `user-scalable=no` / `maximum-scale=1`
  - `frame-title` — add title attribute to iframes
  - `list` / `listitem` — fix list structure
  - `empty-heading` — remove or populate
  - `select-name` — add label
  - `video-caption` — add `<track>` element
  - `nested-interactive` — restructure nesting
  - `aria-allowed-role` / `aria-prohibited-attr` — fix role/attribute misuse
- [ ] Instant response, no external API call, works offline

#### 12C — LLM Integration (Complex Fixes — AI Fallback)
- [ ] When rules engine can't confidently fix the issue (unknown pattern, ambiguous context), escalate to LLM
- [ ] API integration (Anthropic Claude or OpenAI — TBD based on pricing)
- [ ] Prompt engineering: pass the HTML snippet + violation type + WCAG criterion → get fixed code + explanation
- [ ] Token-efficient: only send the relevant snippet, not full page
- [ ] API key stored in `.env` (never client-side)
- [ ] Graceful fallback if API unavailable: show rules-based suggestion + "manual review recommended"

#### 12D — Scan Results Integration ("Fix This" Button)
- [ ] Each issue card in the Issues tab gets a "Fix this" button (appears when HTML snippet is available)
- [ ] Click → opens fixer panel pre-loaded with:
  - The broken HTML snippet from the scan
  - The violation type (axe-core rule ID)
  - The WCAG level and criterion
- [ ] Returns fixed code + explanation inline
- [ ] "Copy fix" button for quick paste into client's codebase

**Key decisions:**
| Topic | Decision |
|---|---|
| Location | Internal dashboard only (auth-protected) |
| Primary engine | Rules-based for top 20 violations (instant, free) |
| Fallback | LLM API for complex/ambiguous cases |
| LLM provider | TBD — Anthropic Claude or OpenAI (evaluate cost + quality) |
| Output | Fixed code + plain-English explanation |
| Naming | TBD — "Accessibility Fixer" as working name |

**Check-in point ✓**

---

### Phase 13 — Scan Comparison & Trend Reporting

*Compare two or more scans of the same domain to visualize improvements, regressions, and changes over time. Produces a downloadable comparison report that spoon-feeds exactly what changed and where.*

#### 13A — Comparison UI in Client Profile
- [ ] Scan history rows get checkboxes to select 2+ scans for comparison
- [ ] "Compare Selected" button triggers comparison view
- [ ] Side-by-side summary: score delta, issue count delta, new issues, resolved issues
- [ ] Visual indicators: ↑ improvements (green), ↓ regressions (red), = unchanged (grey)

#### 13B — Detailed Change Analysis
- [ ] **Resolved issues** — issues present in scan A but not scan B (with page + rule detail)
- [ ] **New issues** — issues in scan B that didn't exist in scan A (new pages? new content? regression?)
- [ ] **Persistent issues** — same rules still failing across both scans (with instance count change)
- [ ] **Score breakdown** — what drove the score change (which rules were fixed, which got worse)
- [ ] **Page-level diff** — which specific pages improved vs degraded

#### 13C — Downloadable Comparison Report
- [ ] Branded PDF-ready page (`/scanner/comparison/:scanId1/:scanId2`)
- [ ] Executive summary: "Score improved from X% to Y%. Z issues resolved, W new issues."
- [ ] What was fixed (grouped by rule, with affected pages)
- [ ] What's still broken (priority list)
- [ ] What got worse (if anything — new regressions flagged)
- [ ] Recommendation: next steps based on remaining issues

#### 13D — Score Over Time Enhancement
- [ ] Client profile shows score trend graph populated from actual scan history
- [ ] Annotate graph with scan dates and key changes
- [ ] Show issue count trend alongside score trend

**Check-in point ✓**

---

### Phase 15 — Quick Ask (AI Domain Assistant)

*An internal, AI-powered assistant inside Nightwolf for on-the-fly accessibility, AEO, and WCAG questions — especially during client calls. Focused on the accessibility/AEO domain, context-aware of the scan currently open, and grounded in real scan data (never invents numbers).*

#### 15A — Core Assistant
- [ ] Ask box inside the Nightwolf dashboard (internal only, auth-protected)
- [ ] LLM integration (Anthropic Claude or OpenAI — TBD, same provider choice as Fixer fallback)
- [ ] System prompt scopes it to accessibility, AEO, WCAG, and remediation expertise
- [ ] Conversation memory within a session (natural follow-ups like "what about the second one?")

#### 15B — Context Awareness
- [ ] **This-client mode** — when a scan/client is open, the assistant can answer about that specific scan ("what should they fix first?", "explain this issue for the owner")
- [ ] **General mode** — pure domain expertise ("what WCAG criterion covers keyboard traps?")
- [ ] Auto-detect or toggle between modes
- [ ] **Data grounding (critical):** any numbers, scores, or counts are injected from the real scan in the database — the LLM explains and phrases, it never fabricates figures

#### 15C — Client-Call UX
- [ ] Suggested/quick-tap questions ("Explain this for a non-technical owner", "What's the legal risk?", "Prioritize the fixes")
- [ ] **Client-friendly toggle** — flip answers between technical (for Pranish) and plain-English (to read aloud to clients)
- [ ] Copy-to-clipboard on any answer (drop into emails/proposals)

#### 15D — Data Visualization (Vision v1)
- [ ] When an answer involves the client's data, render a chart alongside it (severity breakdown, issues by category, disability impact, score trend)
- [ ] Charts use the same Chart.js + brand styling as the Overview dashboard
- [ ] Export charts/data as image for proposals, emails, and client decks

**Key decisions:**
| Topic | Decision |
|---|---|
| Location | Internal Nightwolf dashboard only (auth-protected) |
| Scope | Accessibility / AEO / WCAG domain only — focused expert, not general-purpose |
| Context | Context-aware of the currently open scan; also supports general questions |
| Data integrity | LLM explains; real scan data provides all figures. No hallucinated numbers. |
| LLM provider | TBD — Anthropic Claude or OpenAI |
| Naming | TBD — "Quick Ask" as working name |

**Check-in point ✓**

---

### Phase 16 — Screen Reader Simulator ("Hear Your Site")

*A simulation of how a blind visitor experiences a website via a screen reader. Extracts the browser accessibility tree (what JAWS/NVDA/VoiceOver actually consume), renders it as a linear announcement transcript, scores the experience, and can read it aloud. A visceral demo tool and a genuine diagnostic.*

*Honest framing: this SIMULATES the screen reader experience based on the accessibility tree. It is directional and educational — not a replacement for testing with real assistive technology. Copy must reflect this (consistent with the Accessibility Statement).*

#### 16A — Accessibility Tree Extraction
- [ ] Use Puppeteer's `page.accessibility.snapshot()` to capture the real accessibility tree
- [ ] Walk the tree in reading order, capturing role, accessible name, state, and level for each node
- [ ] Flag nodes that are unnamed, mislabeled, or have confusing/empty announcements

#### 16B — Announcement Transcript
- [ ] Render the tree as a linear "what a blind user hears, in order" transcript
- [ ] Example: "banner · navigation · link: Home · main · heading level 1: ... · button: (unlabeled) ⚠"
- [ ] Inline warnings where the experience breaks down (unlabeled controls, illogical order, skipped headings, missing landmarks)

#### 16C — Experience Score & Report
- [ ] Score based on: reading-order logic, ratio of named vs unnamed interactive elements, heading flow, landmark clarity, and linear comprehensibility
- [ ] Report highlighting the worst "dead spots" — where a screen reader user would get lost or stuck
- [ ] Integrate into the scan results as a tab or standalone tool

#### 16D — Audio Playback (the demo moment)
- [ ] Use the browser Speech Synthesis API to read the accessibility tree aloud
- [ ] Play/pause controls so Pranish can demo it live on a client call — let them HEAR how their site sounds to a blind visitor
- [ ] Visual highlight syncing with the spoken element (optional enhancement)

**Key decisions:**
| Topic | Decision |
|---|---|
| Data source | Browser accessibility tree via Puppeteer (`page.accessibility.snapshot()`) — the same data real screen readers consume |
| Framing | A SIMULATION — directional and educational, not a real screen reader or a substitute for assistive-tech testing |
| Audio | Browser Speech Synthesis API (no external TTS cost) |
| Location | Nightwolf dashboard; strong candidate for a client-facing demo mode later |
| Naming | TBD — "Hear Your Site" / "Screen Reader Simulator" as working names |

**Check-in point ✓**

---

## Key Decisions & Defaults

| Topic | Decision |
|---|---|
| Auth | Passport.js + Google OAuth2 + express-session |
| Session Store | better-sqlite3 (same DB file) |
| Notifications | Nodemailer + Gmail SMTP App Password |
| Email Automation | Resend (free tier: 100/day, 3k/month) |
| Deployment | Railway with persistent disk volume |
| Fonts | Google Fonts CDN (Libre Baskerville + Inter) |
| Logo | Text wordmark in Libre Baskerville |
| Pricing (editable) | T1: $500–800 · T2: $1.5k–4k · T3: $400–800/mo |
| Schema detection | Presence + basic structural validity |
| AEO phrasing | Heuristic present-tense detection |
| Allowed auth email | frictionlessaccess@gmail.com only |
| Scanner crawl | Multi-page, max 50 pages, depth 3, same-domain only |
| Charts | Chart.js 4.4.4 (CDN) |
| Favicons | Google Favicons API (s2/favicons?domain=) |

---

## Brand Design Tokens

```css
--color-black:      #000000;
--color-charcoal:   #1A1A1A;
--color-stone:      #E5E5E5;
--color-ivory:      #F7F7F5;
--color-taupe:      #CBB9A6;
--font-heading:     'Libre Baskerville', Georgia, serif;
--font-body:        'Inter', system-ui, sans-serif;
```

---

*This document is the single source of truth for the build. Updated at each phase check-in.*
