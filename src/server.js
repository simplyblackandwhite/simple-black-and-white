'use strict';

require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const SqliteStore = require('connect-sqlite3')(session);

// Initialize passport strategy
require('./auth/passport');

// Initialize database
const { getDb } = require('./db/database');
getDb();

const publicRoutes = require('./routes/public');
const scannerRoutes = require('./routes/scanner');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/sbw.db');

// Trust the reverse proxy (Railway/production) so secure cookies work behind HTTPS termination.
// Without this, Express sees HTTP internally and refuses to set the secure session cookie,
// causing OAuth login to bounce back to the login screen.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// ─── Security Middleware ───────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    } : false, // Disable CSP in development for local network testing
    crossOriginEmbedderPolicy: false,
  })
);

// ─── Rate Limiting ─────────────────────────────────────────────────────────────
const scanLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many scan requests. Please wait a few minutes and try again.' },
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter);

// ─── Body Parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Static Files ──────────────────────────────────────────────────────────────
app.use(
  express.static(path.join(__dirname, '../public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
    etag: true,
  })
);

// ─── Session Store ─────────────────────────────────────────────────────────────
const sessionStore = new SqliteStore({
  db: 'sbw.db',
  dir: path.dirname(DB_PATH),
  table: 'sessions',
});

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
    name: 'sbw.sid',
  })
);

// ─── Passport Auth ─────────────────────────────────────────────────────────────
app.use(passport.initialize());
app.use(passport.session());

// ─── View Engine (simple HTML file serving) ────────────────────────────────────
app.set('views', path.join(__dirname, '../views'));

// ─── Routes ────────────────────────────────────────────────────────────────────

// Apply scan-specific rate limiting to scan API endpoints
app.use('/api/scan', scanLimiter);
app.use('/scanner/api/scan', scanLimiter);

// Public routes (homepage, light scan, auth callbacks)
app.use('/', publicRoutes);

// Protected scanner dashboard routes
app.use('/scanner', scannerRoutes);

// ─── 404 Handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '../views/404.html'), (err) => {
    if (err) {
      res.status(404).send('<h1>404 — Page Not Found</h1>');
    }
  });
});

// ─── Global Error Handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  const status = err.status || 500;
  res.status(status).json({
    error: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred.'
      : err.message,
  });
});

// ─── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✓ Simply Black and White server running`);
  console.log(`  → Local:   http://localhost:${PORT}`);
  console.log(`  → Env:     ${process.env.NODE_ENV || 'development'}`);
  console.log(`  → DB:      ${DB_PATH}\n`);
});

module.exports = app;
