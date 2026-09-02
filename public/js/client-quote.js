/**
 * Client Quote/Proposal — Rendering Logic
 * Simply Black and White
 *
 * Generates a branded, printable project proposal/quote
 * that can be sent to a client as a PDF.
 */
(function () {
  'use strict';

  var pathParts = window.location.pathname.split('/');
  var scanId = pathParts[pathParts.length - 1];

  if (!scanId || isNaN(parseInt(scanId))) {
    document.getElementById('quote-loading').textContent = 'Invalid quote ID.';
    return;
  }

  fetch('/scanner/api/scans/' + scanId + '/quote-data')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.success) {
        document.getElementById('quote-loading').textContent = 'Failed to load quote.';
        return;
      }
      renderQuote(data);
    })
    .catch(function () {
      document.getElementById('quote-loading').textContent = 'Error loading quote data.';
    });

  function renderQuote(data) {
    var container = document.getElementById('quote-container');
    var quote = data.quote;
    var s = data.summary;
    var dateStr = formatDate(data.scanDate);
    var html = '';

    // Actions
    html += '<div class="quote-actions">';
    html += '<button class="quote-actions__btn" id="btn-print-quote">Print / Save as PDF</button>';
    html += '<button class="quote-actions__btn" id="btn-back-quote">Back to Dashboard</button>';
    html += '</div>';

    // Header
    html += '<header class="quote-header">';
    html += '<div class="quote-header__logo">Simply Black and White</div>';
    html += '<div class="quote-header__tagline">Accessibility · AEO Consultancy</div>';
    html += '<h1 class="quote-header__title">Project Proposal</h1>';
    html += '<p class="quote-header__subtitle">Prepared for the owner of ' + esc(data.url) + '</p>';
    html += '</header>';

    // Client info
    html += '<div class="quote-client">';
    html += '<div class="quote-client__row"><span class="quote-client__label">Website</span><span class="quote-client__value">' + esc(data.url) + '</span></div>';
    html += '<div class="quote-client__row"><span class="quote-client__label">Scan Date</span><span class="quote-client__value">' + dateStr + '</span></div>';
    html += '<div class="quote-client__row"><span class="quote-client__label">Platform</span><span class="quote-client__value">' + esc(data.platform.name) + '</span></div>';
    html += '<div class="quote-client__row"><span class="quote-client__label">Quote Reference</span><span class="quote-client__value">SBW-' + scanId + '-' + new Date().getFullYear() + '</span></div>';
    html += '</div>';

    // Scope
    html += '<div class="quote-scope">';
    html += '<h2 class="quote-scope__heading">Project Scope</h2>';
    html += '<p class="quote-scope__text">' + esc(quote.rationale) + '</p>';
    html += '<div class="quote-scope__stats">';
    html += '<div class="quote-scope__stat"><span class="quote-scope__stat-number">' + s.totalIssues + '</span><span class="quote-scope__stat-label">Issues Found</span></div>';
    html += '<div class="quote-scope__stat"><span class="quote-scope__stat-number">' + (s.critical + s.serious) + '</span><span class="quote-scope__stat-label">High Priority</span></div>';
    html += '<div class="quote-scope__stat"><span class="quote-scope__stat-number">' + (s.aeoGrade || '—') + '</span><span class="quote-scope__stat-label">AEO Grade</span></div>';
    html += '</div>';
    html += '<p class="quote-scope__text"><strong>Summary:</strong> ' + esc(quote.scopeSummary) + '</p>';
    html += '</div>';

    // Service Tiers
    html += '<div class="quote-tiers">';
    html += '<h2 class="quote-tiers__heading">Recommended Service Options</h2>';
    html += '<div class="quote-tiers__grid">';
    html += renderTierCard(quote.tiers.tier1, 'tier1', quote.recommendedTier);
    html += renderTierCard(quote.tiers.tier2, 'tier2', quote.recommendedTier);
    html += renderTierCard(quote.tiers.tier3, 'tier3', quote.recommendedTier);
    html += '</div></div>';

    // Platform note
    if (data.platform.name !== 'Unknown / Custom') {
      html += '<div class="quote-platform">';
      html += '<div class="quote-platform__heading">Platform Consideration</div>';
      html += '<p class="quote-platform__text"><strong>' + esc(data.platform.name) + ':</strong> ' + esc(quote.platform.note) + '</p>';
      html += '</div>';
    }

    // Terms
    html += '<div class="quote-terms">';
    html += '<h2 class="quote-terms__heading">Terms & Conditions</h2>';
    html += '<ul class="quote-terms__list">';
    html += '<li>This quote is valid for 30 days from the scan date.</li>';
    html += '<li>Pricing is based on the current state of the website at time of scan. Significant changes to the site may affect scope.</li>';
    html += '<li>We provide expert risk mitigation, code restructuring, and architectural guidance. We do not guarantee permanent 100% compliance.</li>';
    html += '<li>Website accessibility requires ongoing attention as content, plugins, and templates change over time.</li>';
    html += '<li>50% deposit required to begin work. Remaining balance due upon deliverable handoff.</li>';
    html += '<li>Monthly retainer (Tier 3) is billed at the start of each month. Cancel with 30 days notice.</li>';
    html += '</ul></div>';

    // CTA
    html += '<div class="quote-cta">';
    html += '<h2 class="quote-cta__heading">Ready to move forward?</h2>';
    html += '<p class="quote-cta__text">Reply to this proposal or book a call to discuss next steps.</p>';
    html += '<a href="https://simplyblackandwhite.com/#contact" class="quote-cta__btn">Book a Consultation</a>';
    html += '</div>';

    // Footer
    html += '<footer class="quote-footer">';
    html += '<p class="quote-footer__brand">Simply Black and White</p>';
    html += '<p>simplyblackandwhite.com · hello@simplyblackandwhite.com</p>';
    html += '</footer>';

    container.innerHTML = html;

    // Bind buttons
    var printBtn = document.getElementById('btn-print-quote');
    var backBtn = document.getElementById('btn-back-quote');
    if (printBtn) printBtn.addEventListener('click', function () { window.print(); });
    if (backBtn) backBtn.addEventListener('click', function () { window.location.href = '/scanner'; });
  }

  function renderTierCard(tier, tierKey, recommendedTier) {
    var isRec = tierKey === recommendedTier;
    var cls = 'quote-tier' + (isRec ? ' quote-tier--recommended' : '');
    var priceStr = tier.type === 'monthly-retainer'
      ? '$' + tier.calculatedMin.toLocaleString() + ' – $' + tier.calculatedMax.toLocaleString() + ' /month'
      : '$' + tier.calculatedMin.toLocaleString() + ' – $' + tier.calculatedMax.toLocaleString();

    var html = '<div class="' + cls + '">';
    if (isRec) html += '<span class="quote-tier__badge">Recommended</span>';
    html += '<h3 class="quote-tier__name">' + esc(tier.name) + '</h3>';
    html += '<div class="quote-tier__price">' + priceStr + '</div>';
    html += '<div class="quote-tier__type">' + esc(tier.type.replace('-', ' ')) + '</div>';
    html += '<p class="quote-tier__desc">' + esc(tier.description) + '</p>';
    html += '<p class="quote-tier__details"><strong>Deliverable:</strong> ' + esc(tier.deliverable) + '</p>';
    html += '<p class="quote-tier__details"><strong>Timeline:</strong> ' + esc(tier.timeline) + '</p>';
    html += '</div>';
    return html;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
