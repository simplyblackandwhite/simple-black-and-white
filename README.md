# Simply Black and White

**Web Accessibility & AEO Consultancy Platform**

A full-stack Node.js application powering simplyblackandwhite.com — a public marketing site plus **Nightwolf**, an internal accessibility scanning and remediation dashboard.

---

## What It Does

**Public site:**
- Marketing homepage with a free light accessibility scan (Puppeteer + axe-core)
- Compliant Caffeine Calculator (brand engagement tool)
- Post-scan email capture with branded snapshot reports (Resend)
- FAQ, Accessibility Statement, Terms, Privacy — with AEO-optimized content (`/faq`, `/ai`, `/llms.txt`)

**Nightwolf dashboard (internal, Google OAuth protected):**
- Multi-page crawl scanner (up to 100 pages, configurable depth, robots.txt + age-gate handling)
- Client profiles grouped by domain with favicons, notes, and outreach
- Tabbed results: Overview (charts), Issues (grouped by rule), AEO Health, Quote, Pages
- Quote generator (tier recommendation + platform-adjusted pricing)
- AI Accessibility Fixer (rules engine for 20+ WCAG violations)
- Scan comparison with trend reporting and downloadable progress reports
- Lead capture, follow-up emails, and prospect outreach

---

## Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js (>=18) |
| Server | Express 4 |
| Database | better-sqlite3 (SQLite) |
| Scanning | Puppeteer + axe-core |
| Auth | Passport.js + Google OAuth2 |
| Email | Resend |
| Charts | Chart.js (CDN) |
| Frontend | Vanilla JS, no build step |
| Fonts | Libre Baskerville + Inter (Google Fonts) |
| Deployment | Railway (persistent volume) |

---

## Local Setup

### 1. Prerequisites
- Node.js 18 or higher
- npm

### 2. Install
```bash
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
```
Then fill in `.env` (see **Environment Variables** below).

### 4. Run
```bash
npm run dev     # development (nodemon, auto-restart)
npm start       # production
```

The app runs at `http://localhost:3000`. The SQLite database auto-creates at `./data/sbw.db` on first run.

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development` or `production` |
| `PORT` | Server port (default 3000) |
| `SESSION_SECRET` | Random string for session signing. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `DB_PATH` | SQLite file path. Local: `./data/sbw.db`. Railway: `/data/sbw.db` |
| `GOOGLE_CLIENT_ID` | Google OAuth2 client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth2 client secret |
| `GOOGLE_CALLBACK_URL` | OAuth callback (`http://localhost:3000/auth/google/callback` locally) |
| `ALLOWED_GOOGLE_EMAIL` | Comma-separated whitelist of emails allowed into the dashboard |
| `RESEND_API_KEY` | Resend API key for sending email |
| `NOTIFY_EMAIL_FROM` | Sender address (verified domain, e.g. `Simply Black and White <hello@simplyblackandwhite.com>`) |
| `NOTIFY_EMAIL_TO` | Where internal scan/lead notifications are sent |
| `APP_URL` | Base URL for building absolute links in emails |

---

## Project Structure

```
simply-black-and-white/
├── public/
│   ├── css/          main, scanner, fixer, report, quote styles
│   ├── js/           light-scan, scanner-app, fixer, drink-generator, report renderers
│   └── llms.txt      AI crawler descriptor
├── views/
│   ├── partials/     head, header, footer
│   ├── index.html    homepage
│   ├── scanner.html  Nightwolf dashboard
│   ├── fixer.html    accessibility fixer tool
│   ├── faq.html · ai.html · accessibility.html · terms.html · privacy.html
│   └── snapshot-report.html · comparison-report.html · client-report.html · client-quote.html · workbook.html
├── src/
│   ├── server.js         Express entry point
│   ├── auth/passport.js  Google OAuth2 strategy
│   ├── routes/           public.js, scanner.js
│   ├── scanner/          engine, aeo-analyzer, quote-generator, fixer-engine, comparison-engine
│   ├── db/               database.js, schema.sql
│   └── utils/            notifier, sanitizer, pricing-config
├── data/                 SQLite database (git-ignored)
├── .env.example
├── railway.toml
└── BUILD_ROADMAP.md      single source of truth for the build
```

---

## Deployment (Railway)

1. Push the repo to GitHub.
2. Create a new Railway project from the repo.
3. Add a **persistent volume** mounted at `/data`.
4. Set all environment variables in Railway (use `DB_PATH=/data/sbw.db`).
5. Update `GOOGLE_CALLBACK_URL` and `APP_URL` to the production domain.
6. Add the production callback URL to the Google Cloud OAuth consent screen.
7. Point the custom domain (GoDaddy DNS → Railway) once deployed.

Railway auto-deploys on every push to the connected branch. Post-launch development is continuous — push changes and they go live.

---

## Key Commands

```bash
npm run dev     # dev server with auto-restart
npm start       # production server
npm run lint    # ESLint on src/
```

---

## Notes

- The database migrates automatically on startup (schema + incremental `ALTER TABLE` migrations).
- Light scans (homepage) are anonymous and single-page. Full scans (dashboard) crawl multiple pages and create client profiles.
- All copy uses risk-mitigation language — no "100% compliant" or "guarantee" claims.
- See `BUILD_ROADMAP.md` for the full phase-by-phase build history and remaining work.
