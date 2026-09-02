'use strict';

const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');

// ─── Google OAuth2 Strategy ───────────────────────────────────────────────────
// Skip strategy registration in development if credentials are not yet set.
// Once you add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file,
// the strategy will register automatically on server start.
if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID === 'your_google_client_id_here') {
  console.warn('[Auth] Google OAuth2 credentials not configured. /scanner login will be unavailable until .env is set up.');
} else {
passport.use(
  new GoogleStrategy(
    {
      clientID:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:  process.env.GOOGLE_CALLBACK_URL,
    },
    (accessToken, refreshToken, profile, done) => {
      // Security: only allow the configured email addresses
      const allowedEmails = (process.env.ALLOWED_GOOGLE_EMAIL || '')
        .split(',')
        .map(e => e.trim().toLowerCase());
      const userEmail = profile.emails?.[0]?.value;

      if (!userEmail || !allowedEmails.includes(userEmail.toLowerCase())) {
        return done(null, false, {
          message: `Access denied. This dashboard is restricted to authorized users only.`,
        });
      }

      // Build a minimal user object — we don't store PII in the DB
      const user = {
        id:          profile.id,
        displayName: profile.displayName,
        email:       userEmail,
        photo:       profile.photos?.[0]?.value || null,
      };

      return done(null, user);
    }
  )
);
} // end credentials guard

// ─── Session Serialization ────────────────────────────────────────────────────
// Store only the minimal user object in the session
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

module.exports = passport;
