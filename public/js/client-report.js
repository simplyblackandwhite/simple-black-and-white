/**
 * Client Report — Rendering Logic
 * Simply Black and White
 *
 * Generates a branded report with collapsible severity groups,
 * deduplicated issues, and accurate compliance scoring.
 */
(function () {
  'use strict';

  var pathParts = window.location.pathname.split('/');
  var scanId = pathParts[pathParts.length - 1];

  if (!scanId || isNaN(parseInt(scanId))) {
    document.getElementById('report-loading').textContent = 'Invalid report ID.';
    return;
  }

  fetch('/scanner/api/scans/' + scanId + '/report')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.success) {
        document.getElementById('report-loading').textContent = 'Failed to load report.';
        return;
      }
      renderReport(data.report);
    })
    .catch(function () {
      document.getElementById('report-loading').textContent = 'Error loading report data.';
    });

  function renderReport(report) {
    var container = document.getElementById('report-container');
    var allIssues = (report.contentIssues || []).concat(report.technicalIssues || []);
    var complianceScore = calculateComplianceScore(allIssues);
    var commonOccurrences = getCommonOccurrences(allIssues);
    var dateStr = formatDate(report.scanDate);
    var html = '';

    // Actions
    html += '<div class="report-actions">';
    html += '<button class="report-actions__btn" id="btn-print-report">Print / Save as PDF</button>';
    html += '<button class="report-actions__btn" id="btn-close-report">Back to Dashboard</button>';
    html += '</div>';

    // Header
    html += '<header class="report-header">';
    html += '<div class="report-header__logo">Simply Black and White</div>';
    html += '<div class="report-header__tagline">Accessibility · AEO Consultancy</div>';
    html += '<h1 class="report-header__title">Website Accessibility & AEO Report</h1>';
    html += '<p class="report-header__meta">' + esc(report.url) + ' · ' + dateStr + '</p>';
    if (report.platform && report.platform.name !== 'Unknown / Custom') {
      html += '<p class="report-header__platform">Platform: ' + esc(report.platform.name) + '</p>';
    }
    html += '</header>';

    // Compliance Score
    html += '<div class="compliance-score">';
    html += '<div class="compliance-score__value">' + complianceScore.score + '%</div>';
    html += '<div class="compliance-score__label">Overall Compliance Score</div>';
    html += '<p class="compliance-score__method">Based on ' + complianceScore.uniqueRules + ' unique accessibility violations found, weighted by severity and spread across pages.</p>';
    html += '</div>';

    // Severity Summary
    html += '<div class="element-counts">';
    html += '<div class="element-count element-count--fail"><span class="element-count__number">' + report.summary.critical + '</span><span class="element-count__label">Critical</span></div>';
    html += '<div class="element-count element-count--warn"><span class="element-count__number">' + report.summary.serious + '</span><span class="element-count__label">Serious</span></div>';
    html += '<div class="element-count element-count--pass"><span class="element-count__number">' + (report.summary.moderate + report.summary.minor) + '</span><span class="element-count__label">Moderate + Minor</span></div>';
    html += '</div>';

    container.innerHTML = html;
    html = '';

    // Executive Summary
    html += '<section class="report-section">';
    html += '<h2 class="report-section__heading">Executive Summary</h2>';
    html += '<p class="exec-summary__text">' + buildExecSummary(report, complianceScore) + '</p>';
    html += '</section>';

    // Common Occurrences
    if (commonOccurrences.length > 0) {
      html += '<section class="report-section">';
      html += '<h2 class="report-section__heading">Most Common Issues</h2>';
      html += '<ul class="common-list">';
      commonOccurrences.forEach(function (item) {
        html += '<li class="common-item"><span class="common-item__badge common-item__badge--' + item.impact + '">' + item.impact + '</span><span class="common-item__name">' + esc(item.name) + '</span><span class="common-item__count">' + item.pages + ' page' + (item.pages !== 1 ? 's' : '') + '</span></li>';
      });
      html += '</ul></section>';
    }

    // AEO Health
    if (report.aeo) {
      html += '<section class="report-section">';
      html += '<h2 class="report-section__heading">AEO Health (AI Search Visibility)</h2>';
      html += '<p class="report-section__subheading">How well AI search engines can read, understand, and recommend your business.</p>';
      html += '<div class="aeo-score-bar"><div class="aeo-score-bar__grade">' + report.aeo.grade + '</div>';
      html += '<div><span class="aeo-score-bar__value">' + report.aeo.score + '/' + report.aeo.maxScore + '</span> AEO Health Score</div></div>';
      report.aeo.findings.forEach(function (f) {
        var icon = f.status === 'pass' ? '✓' : f.status === 'warn' ? '⚠' : '✗';
        html += '<div class="aeo-finding"><span class="aeo-icon--' + f.status + '">' + icon + '</span><span>' + esc(f.text) + '</span></div>';
      });
      html += '</section>';
    }

    container.innerHTML += html;
    html = '';

    // ─── CONTENT LIFT (grouped by severity, collapsible) ───
    var contentIssues = report.contentIssues || [];
    if (contentIssues.length > 0) {
      html += '<section class="report-section">';
      html += '<h2 class="report-section__heading">Content Lift (CMS / Editorial)</h2>';
      html += '<p class="report-section__subheading">Issues fixable by content or brand teams via CMS without code changes.</p>';
      html += renderGroupedIssues(contentIssues, 'Content Lift');
      html += '</section>';
    }

    // ─── TECHNICAL LIFT (grouped by severity, collapsible) ───
    var technicalIssues = report.technicalIssues || [];
    if (technicalIssues.length > 0) {
      html += '<section class="report-section">';
      html += '<h2 class="report-section__heading">Technical Lift (Developer Work)</h2>';
      html += '<p class="report-section__subheading">Issues requiring developer intervention at the template or code level.</p>';
      html += renderGroupedIssues(technicalIssues, 'Technical Lift');
      html += '</section>';
    }

    container.innerHTML += html;
    html = '';

    // Accessibility Terminology (collapsed by default)
    html += '<details class="report-section report-section--collapsible">';
    html += '<summary class="report-section__heading report-section__heading--toggle">Accessibility Terminology</summary>';
    html += '<ul class="terminology-list">';
    html += '<li class="terminology-item"><strong>WCAG:</strong> <span>Web Content Accessibility Guidelines — the international standard for web accessibility (Level A, AA, AAA).</span></li>';
    html += '<li class="terminology-item"><strong>ARIA:</strong> <span>Attributes that describe roles and states to screen readers (e.g., aria-label, role="button").</span></li>';
    html += '<li class="terminology-item"><strong>Screen Reader:</strong> <span>Software that reads web content aloud to users who are blind or have low vision.</span></li>';
    html += '<li class="terminology-item"><strong>Color / Contrast:</strong> <span>Visual readability — ensuring text is distinguishable from its background (4.5:1 minimum ratio).</span></li>';
    html += '<li class="terminology-item"><strong>AEO:</strong> <span>Answer Engine Optimization — structuring content so AI search engines can parse and recommend your business.</span></li>';
    html += '<li class="terminology-item"><strong>Content Lift:</strong> <span>Issues fixable by content/brand teams via CMS without code changes.</span></li>';
    html += '<li class="terminology-item"><strong>Technical Lift:</strong> <span>Issues requiring developer intervention at the template/code level.</span></li>';
    html += '</ul>';
    html += '</details>';

    // CTA
    html += '<div class="report-cta">';
    html += '<h2 class="report-cta__heading">Ready to fix these issues?</h2>';
    html += '<p class="report-cta__text">We provide clear remediation roadmaps, developer-ready workbooks, and ongoing monitoring to keep your site accessible and AI-visible.</p>';
    html += '<a href="https://simplyblackandwhite.com/#contact" class="report-cta__btn">Book a Free Consultation</a>';
    html += '</div>';

    // Footer
    html += '<footer class="report-footer">';
    html += '<p class="report-footer__brand">Simply Black and White</p>';
    html += '<p>simplyblackandwhite.com</p>';
    html += '<p style="margin-top:8px;">This report is provided for informational purposes. It does not constitute a guarantee of compliance. Website accessibility requires ongoing attention as content and code change over time.</p>';
    html += '</footer>';

    container.innerHTML += html;

    // Bind buttons
    var printBtn = document.getElementById('btn-print-report');
    var closeBtn = document.getElementById('btn-close-report');
    if (printBtn) printBtn.addEventListener('click', function () { window.print(); });
    if (closeBtn) closeBtn.addEventListener('click', function () { window.location.href = '/scanner'; });
  }

  // ─── Grouped Issues (collapsible by severity, deduplicated by rule) ────────

  function renderGroupedIssues(issues, liftLabel) {
    // Group by severity, deduplicate by rule ID
    var groups = { critical: {}, serious: {}, moderate: {}, minor: {} };

    issues.forEach(function (issue) {
      var severity = issue.impact || 'minor';
      if (!groups[severity]) groups[severity] = {};
      if (!groups[severity][issue.id]) {
        groups[severity][issue.id] = {
          issue: issue,
          pages: [],
        };
      }
      if (issue.pageUrl) groups[severity][issue.id].pages.push(issue.pageUrl);
    });

    var html = '';
    var severityLabels = { critical: 'Critical', serious: 'Serious', moderate: 'Moderate', minor: 'Minor' };
    var severityColors = { critical: '#c0392b', serious: '#e67e22', moderate: '#f39c12', minor: '#95a5a6' };

    ['critical', 'serious', 'moderate', 'minor'].forEach(function (severity) {
      var rules = Object.values(groups[severity]);
      if (rules.length === 0) return;

      var isOpen = (severity === 'critical' || severity === 'serious') ? ' open' : '';
      html += '<details' + isOpen + ' style="margin-bottom:16px;border-left:3px solid ' + severityColors[severity] + ';padding-left:12px;">';
      html += '<summary style="cursor:pointer;font-weight:600;font-size:14px;padding:8px 0;color:#1A1A1A;">';
      html += severityLabels[severity] + ' (' + rules.length + ' issue' + (rules.length !== 1 ? 's' : '') + ')';
      html += '</summary>';

      rules.forEach(function (entry) {
        var issue = entry.issue;
        html += '<div class="report-issue report-issue--' + issue.impact + '" style="margin-bottom:16px;page-break-inside:avoid;">';
        html += '<h3 class="report-issue__title">' + esc(issue.plainDescription) + '</h3>';
        html += '<p class="report-issue__rule">Rule: ' + esc(issue.id) + ' · WCAG ' + esc(issue.wcagLevel || 'A') + '</p>';

        // Why it matters
        html += '<div class="report-issue__row"><strong>Impact:</strong> ' + getWhyExplanation(issue) + '</div>';

        // How to fix
        html += '<div class="report-issue__row report-issue__row--fix"><strong>Fix:</strong> ' + esc(issue.howToFix) + '</div>';

        // Pages affected
        if (entry.pages.length > 0) {
          html += '<div class="report-issue__row"><strong>Affects ' + entry.pages.length + ' page' + (entry.pages.length !== 1 ? 's' : '') + '</strong>';
          if (entry.pages.length <= 5) {
            html += '<br><span style="font-size:11px;color:#666;">' + entry.pages.map(function (p) { try { return new URL(p).pathname; } catch(e) { return p; } }).join(', ') + '</span>';
          }
          html += '</div>';
        }

        html += '</div>';
      });

      html += '</details>';
    });

    return html;
  }

  // ─── Scoring (matches dashboard logic — unique rules, not raw instances) ───

  function calculateComplianceScore(allIssues) {
    // Deduplicate by rule ID
    var ruleMap = {};
    allIssues.forEach(function (issue) {
      if (!ruleMap[issue.id]) {
        ruleMap[issue.id] = { impact: issue.impact, pages: [] };
      }
      if (issue.pageUrl) ruleMap[issue.id].pages.push(issue.pageUrl);
    });

    var uniqueRules = Object.values(ruleMap);
    var scoreDeductions = 0;
    var totalPages = Math.max(new Set(allIssues.map(function (i) { return i.pageUrl; })).size, 1);

    uniqueRules.forEach(function (rule) {
      var severityWeight = rule.impact === 'critical' ? 12 : rule.impact === 'serious' ? 7 : rule.impact === 'moderate' ? 3 : 1;
      var spreadRatio = totalPages > 1 ? rule.pages.length / totalPages : 1;
      var spreadMultiplier = 1 + (spreadRatio * 0.5);
      scoreDeductions += severityWeight * spreadMultiplier;
    });

    var score = Math.max(0, Math.round(100 - (scoreDeductions / 150) * 100));
    return { score: score, uniqueRules: uniqueRules.length, deductions: scoreDeductions };
  }

  function getCommonOccurrences(issues) {
    // Group by rule, count pages affected
    var ruleMap = {};
    issues.forEach(function (i) {
      if (!ruleMap[i.id]) ruleMap[i.id] = { name: i.plainDescription, impact: i.impact, pages: new Set() };
      if (i.pageUrl) ruleMap[i.id].pages.add(i.pageUrl);
    });
    return Object.values(ruleMap)
      .map(function (r) { return { name: r.name.substring(0, 80), impact: r.impact, pages: r.pages.size }; })
      .sort(function (a, b) { return b.pages - a.pages; })
      .slice(0, 6);
  }

  function getWhyExplanation(issue) {
    var whyMap = {
      'color-contrast': 'Low contrast text is unreadable for users with low vision or in bright environments.',
      'color-contrast-enhanced': 'Stricter contrast ensures readability for users with moderate vision loss.',
      'image-alt': 'Missing descriptions make images invisible to screen reader users.',
      'link-name': 'Unnamed links leave screen reader users unable to navigate.',
      'button-name': 'Unlabeled buttons make interactions impossible for assistive tech users.',
      'label': 'Missing labels mean screen readers cannot announce form field purpose.',
      'heading-order': 'Skipped headings break navigation for users who rely on heading shortcuts.',
      'document-title': 'No page title means screen reader users cannot identify the page.',
      'html-has-lang': 'Without a language declaration, screen readers mispronounce content.',
      'bypass': 'No skip link forces keyboard users through repetitive navigation on every page.',
      'landmark-one-main': 'No main landmark makes it impossible for assistive tech to find primary content.',
      'aria-hidden-focus': 'Hidden but focusable elements cause confusion and disorientation.',
      'region': 'Content outside landmarks cannot be categorized by assistive technology.',
      'frame-title': 'Screen readers cannot describe an embedded frame without a title.',
      'link-in-text-block': 'Colorblind users cannot distinguish links from surrounding text.',
      'empty-heading': 'Empty headings create dead-end navigation for screen reader users.',
    };
    return esc(whyMap[issue.id] || 'This issue creates barriers for users relying on assistive technology.');
  }

  function buildExecSummary(report, complianceScore) {
    var s = report.summary;
    var text = 'Our scan of <strong>' + esc(report.url) + '</strong> achieved a compliance score of <strong>' + complianceScore.score + '%</strong>, identifying <strong>' + complianceScore.uniqueRules + ' unique accessibility issue' + (complianceScore.uniqueRules !== 1 ? 's' : '') + '</strong> across ' + s.totalIssues + ' total occurrences';
    if (s.critical > 0) {
      text += ', including <strong>' + s.critical + ' critical</strong> barrier' + (s.critical !== 1 ? 's' : '') + ' that may prevent visitors from accessing content.';
    } else {
      text += '. No critical barriers were detected, though improvements are recommended.';
    }
    if (s.aeoGrade) {
      text += ' AI search visibility scored <strong>' + s.aeoGrade + ' (' + s.aeoScore + '/100)</strong>.';
    }
    return text;
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
