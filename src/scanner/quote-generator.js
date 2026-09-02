'use strict';

const { PRICING, SCORING_THRESHOLDS } = require('../utils/pricing-config');

/**
 * Platform complexity multipliers.
 * Some platforms are harder to remediate than others due to limited
 * template access, proprietary code, or plugin dependencies.
 */
const PLATFORM_MULTIPLIERS = {
  'WordPress':              { multiplier: 1.0, note: 'Full template access, well-documented, large plugin ecosystem.' },
  'WooCommerce (WordPress)': { multiplier: 1.1, note: 'WordPress + ecommerce complexity. Cart/checkout often has extra issues.' },
  'Shopify':                { multiplier: 1.15, note: 'Liquid templates are restrictive. Some fixes require app modifications.' },
  'Wix':                    { multiplier: 1.3, note: 'Limited code access. Many fixes require workarounds or platform support.' },
  'Squarespace':            { multiplier: 1.25, note: 'Template-locked. Custom code injection available but limited.' },
  'Webflow':                { multiplier: 1.05, note: 'Good code access via custom code. Most issues are fixable.' },
  'GoDaddy Builder':        { multiplier: 1.35, note: 'Very limited template control. Migration may be more cost-effective.' },
  'Drupal':                 { multiplier: 1.1, note: 'Powerful but complex. Requires experienced Drupal developer.' },
  'Joomla':                 { multiplier: 1.15, note: 'Aging ecosystem. Extension conflicts are common.' },
  'Next.js':                { multiplier: 0.95, note: 'Modern framework with full code control. Developer-friendly fixes.' },
  'Gatsby':                 { multiplier: 0.95, note: 'Static site generator. Full control, straightforward remediation.' },
  'HubSpot':                { multiplier: 1.2, note: 'CMS modules can be restrictive. Custom module work may be needed.' },
  'Unknown / Custom':       { multiplier: 1.0, note: 'Custom build — remediation depends on code architecture.' },
};

/**
 * Generate a price quote based on scan results.
 * Factors in: severity breakdown, AEO score, platform complexity,
 * and total issue volume.
 *
 * @param {object} scanResults - Full scan results from engine
 * @returns {object} - Quote with recommended tier, pricing, and rationale
 */
function generateQuote(scanResults) {
  const summary = scanResults.summary || {};
  const aeo = scanResults.aeo || {};
  const platform = scanResults.platform || { name: 'Unknown / Custom', confidence: 'low', type: 'unknown' };

  // Calculate weighted severity score
  const weights = SCORING_THRESHOLDS.weights;
  const weightedScore =
    (summary.critical || 0) * weights.critical +
    (summary.serious || 0) * weights.serious +
    (summary.moderate || 0) * weights.moderate +
    (summary.minor || 0) * weights.minor;

  // Get platform multiplier
  const platformInfo = PLATFORM_MULTIPLIERS[platform.name] || PLATFORM_MULTIPLIERS['Unknown / Custom'];
  const platformMultiplier = platformInfo.multiplier;

  // Determine recommended tier
  let recommendedTier = 'tier1';
  if (weightedScore > SCORING_THRESHOLDS.tier2MaxScore) {
    recommendedTier = 'tier3';
  } else if (weightedScore > SCORING_THRESHOLDS.tier1MaxScore) {
    recommendedTier = 'tier2';
  }

  // If AEO is very low (D or F), bump recommendation up
  if (aeo.grade === 'F' && recommendedTier === 'tier1') {
    recommendedTier = 'tier2';
  }

  // Calculate dynamic prices with platform multiplier applied
  const tier1Price = calculateTierPrice(PRICING.tier1, weightedScore, 0, 100, platformMultiplier);
  const tier2Price = calculateTierPrice(PRICING.tier2, weightedScore, 0, 100, platformMultiplier);
  const tier3Price = calculateTierPrice(PRICING.tier3, weightedScore, 0, 100, platformMultiplier);

  // Build scope summary
  const scopeParts = [];
  if (summary.totalIssues) scopeParts.push(`${summary.totalIssues} accessibility issues found`);
  if (summary.critical > 0) scopeParts.push(`${summary.critical} critical`);
  if (summary.serious > 0) scopeParts.push(`${summary.serious} serious`);
  if (aeo.grade) scopeParts.push(`AEO grade: ${aeo.grade}`);
  if (platform.name !== 'Unknown / Custom') scopeParts.push(`Platform: ${platform.name}`);
  if (weightedScore > 50) scopeParts.push('significant remediation effort required');

  const scopeSummary = scopeParts.join(', ');

  // Determine rationale
  let rationale = '';
  if (recommendedTier === 'tier1') {
    rationale = 'The issue count and severity suggest a straightforward audit will give the client clear direction. Most issues appear manageable with a prioritized checklist.';
  } else if (recommendedTier === 'tier2') {
    rationale = 'The volume and severity of issues indicate the client will need a structured remediation plan with developer-ready specifications. A simple checklist won\'t be enough.';
  } else {
    rationale = 'The high severity score suggests deep structural issues that will require ongoing attention. A one-time fix isn\'t sustainable — the client needs continuous monitoring.';
  }

  // Add platform context to rationale
  if (platformMultiplier > 1.1) {
    rationale += ` Note: ${platform.name} adds complexity — ${platformInfo.note}`;
  }

  return {
    recommendedTier,
    weightedScore,
    rationale,
    scopeSummary,
    platform: {
      name: platform.name,
      confidence: platform.confidence,
      type: platform.type,
      multiplier: platformMultiplier,
      note: platformInfo.note,
    },
    tiers: {
      tier1: {
        ...PRICING.tier1,
        calculatedMin: tier1Price.min,
        calculatedMax: tier1Price.max,
      },
      tier2: {
        ...PRICING.tier2,
        calculatedMin: tier2Price.min,
        calculatedMax: tier2Price.max,
      },
      tier3: {
        ...PRICING.tier3,
        calculatedMin: tier3Price.min,
        calculatedMax: tier3Price.max,
      },
    },
  };
}

/**
 * Calculate a dynamic price within a tier's min/max range.
 * Higher severity scores push toward the max. Platform multiplier adjusts.
 */
function calculateTierPrice(tier, score, minScore, maxScore, platformMultiplier) {
  const range = maxScore - minScore;
  const position = Math.min(Math.max((score - minScore) / range, 0), 1);

  const priceRange = tier.max - tier.min;
  let calculatedMin = Math.round((tier.min + (priceRange * position * 0.5)) * platformMultiplier);
  let calculatedMax = Math.round((tier.min + (priceRange * (0.5 + position * 0.5))) * platformMultiplier);

  // Keep within absolute bounds (min floor, max ceiling with some platform overflow allowed)
  calculatedMin = Math.max(calculatedMin, tier.min);
  calculatedMax = Math.min(calculatedMax, Math.round(tier.max * 1.25)); // Allow 25% over max for difficult platforms

  return { min: calculatedMin, max: calculatedMax };
}

module.exports = { generateQuote };
