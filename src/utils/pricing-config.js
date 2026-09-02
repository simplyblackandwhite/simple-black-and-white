'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Simply Black and White — Pricing Configuration
//
// Edit these values to adjust your quoted price ranges without touching
// any other code. All values are in USD.
// ─────────────────────────────────────────────────────────────────────────────

const PRICING = {
  tier1: {
    name:        'The "Clear View" Audit',
    type:        'flat-rate',
    min:         500,
    max:         800,
    description: 'Comprehensive light scan report, human barrier breakdown, AEO citation check, and prioritized developer checklist.',
    deliverable: 'PDF Report + Developer Checklist',
    timeline:    '3–5 business days',
  },

  tier2: {
    name:        'The "Clean Slate" Orchestration',
    type:        'project-based',
    min:         1500,
    max:         4000,
    description: 'Full architectural orchestration with developer-ready workbooks and remediation roadmaps for your agency or internal team.',
    deliverable: 'Developer Workbook + Remediation Roadmap',
    timeline:    '2–4 weeks',
  },

  tier3: {
    name:        'The "Always Open" Guardian',
    type:        'monthly-retainer',
    min:         400,
    max:         800,
    description: 'Continuous monitoring, recurring re-scans, AEO citation tracking, and quarterly compliance tune-ups.',
    deliverable: 'Monthly Reports + Quarterly Tune-Up',
    timeline:    'Ongoing (month-to-month)',
  },
};

// ─── Scoring Thresholds ───────────────────────────────────────────────────────
// These determine which tier is recommended based on scan severity scores.
// Adjust as your business needs evolve.

const SCORING_THRESHOLDS = {
  // A weighted score below this → recommend Tier 1
  tier1MaxScore: 30,
  // A weighted score between tier1MaxScore and this → recommend Tier 2
  tier2MaxScore: 70,
  // Anything above tier2MaxScore → recommend Tier 3 or escalated Tier 2

  // Severity weights for axe-core violation impact levels
  weights: {
    critical:  10,
    serious:    6,
    moderate:   3,
    minor:      1,
  },
};

module.exports = { PRICING, SCORING_THRESHOLDS };
