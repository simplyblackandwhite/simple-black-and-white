/**
 * Remediation Workbook — PDF-ready branded document
 * Simply Black and White
 *
 * Sections: Summary, Component Inventory, Technical Remediation,
 * Content Remediation, AEO Insights
 */
(function () {
  'use strict';

  var pathParts = window.location.pathname.split('/');
  var scanId = pathParts[pathParts.length - 1];

  if (!scanId || isNaN(parseInt(scanId))) {
    document.getElementById('workbook-container').innerHTML = '<p class="report-loading">Invalid workbook ID.</p>';
    return;
  }

  fetch('/scanner/api/scans/' + scanId + '/workbook-data')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.success) {
        document.getElementById('workbook-container').innerHTML = '<p class="report-loading">Failed to load workbook.</p>';
        return;
      }
      renderWorkbook(data);
    })
    .catch(function () {
      document.getElementById('workbook-container').innerHTML = '<p class="report-loading">Error loading data.</p>';
    });

  function renderWorkbook(data) {
    var container = document.getElementById('workbook-container');
    var s = data.summary;
    var html = '';

    // Actions
    html += '<div class="report-actions">';
    html += '<button class="report-actions__btn" id="btn-print-wb">Print / Save as PDF</button>';
    html += '<button class="report-actions__btn" id="btn-back-wb">Back to Dashboard</button>';
    html += '</div>';

    // Header
    html += '<header class="report-header">';
    html += '<div class="report-header__logo">Simply Black and White</div>';
    html += '<div class="report-header__tagline">Accessibility · AEO Consultancy</div>';
    html += '<h1 class="report-header__title">Remediation Workbook</h1>';
    html += '<p class="report-header__meta">' + esc(data.url) + ' · ' + formatDate(data.scanDate) + '</p>';
    html += '</header>';

    // ─── SUMMARY ───
    html += '<section class="report-section">';
    html += '<h2 class="report-section__heading">Summary</h2>';
    html += '<table style="width:100%;border-collapse:collapse;margin-bottom:24px;">';
    html += row('Website URL', '<a href="' + esc(data.url) + '">' + esc(data.url) + '</a>');
    html += row('Platform', esc(data.platform.name));
    html += row('Accessibility Score', s.accessibilityScore + '%');
    html += row('AEO Score', s.aeoScore + '/100 (' + s.aeoGrade + ')');
    html += row('Total Issues', s.totalIssues);
    html += row('Critical', s.critical);
    html += row('Serious', s.serious);
    html += row('Moderate', s.moderate);
    html += row('Minor', s.minor);
    html += row('Scan Date', formatDate(data.scanDate));
    html += row('Recommended Approach', 'Remediate by component ownership, not page-by-page');
    html += '</table></section>';

    container.innerHTML = html;
    html = '';

    // ─── COMPONENT INVENTORY ───
    if (data.components && data.components.length > 0) {
      html += '<section class="report-section">';
      html += '<h2 class="report-section__heading">Component Inventory</h2>';
      html += '<p class="report-section__subheading">Issues grouped by type. Fix the component once to resolve all related instances across the site.</p>';
      html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
      html += '<thead><tr><th style="text-align:left;padding:8px;border-bottom:2px solid #E5E5E5;font-size:11px;text-transform:uppercase;color:#666;">Issue</th>';
      html += '<th style="padding:8px;border-bottom:2px solid #E5E5E5;font-size:11px;text-transform:uppercase;color:#666;">Severity</th>';
      html += '<th style="padding:8px;border-bottom:2px solid #E5E5E5;font-size:11px;text-transform:uppercase;color:#666;">Instances</th>';
      html += '<th style="padding:8px;border-bottom:2px solid #E5E5E5;font-size:11px;text-transform:uppercase;color:#666;">Lift Type</th></tr></thead><tbody>';
      data.components.forEach(function (c) {
        var lift = c.category === 'content' ? 'Content / CMS' : 'Technical / Dev';
        html += '<tr><td style="padding:8px;border-bottom:1px solid #f0f0f0;">' + esc(c.description).substring(0, 70) + '</td>';
        html += '<td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:center;"><span class="report-issue__badge report-issue__badge--' + c.severity + '">' + c.severity + '</span></td>';
        html += '<td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:center;">' + c.totalInstances + '</td>';
        html += '<td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:center;">' + lift + '</td></tr>';
      });
      html += '</tbody></table></section>';
    }

    // ─── TECHNICAL REMEDIATION ───
    if (data.systemIssues && data.systemIssues.length > 0) {
      html += '<section class="report-section">';
      html += '<h2 class="report-section__heading">Technical Remediation</h2>';
      html += '<p class="report-section__subheading">Issues requiring developer intervention. Grouped by priority — critical items are expanded by default.</p>';
      html += renderGroupedIssues(data.systemIssues, 'SYS', 'Technical Lift');
      html += '</section>';
    }

    container.innerHTML += html;
    html = '';

    // ─── CONTENT REMEDIATION ───
    if (data.contentIssues && data.contentIssues.length > 0) {
      html += '<section class="report-section">';
      html += '<h2 class="report-section__heading">Content Remediation</h2>';
      html += '<p class="report-section__subheading">Issues fixable through your CMS or content management tools. No code changes required — editorial fixes grouped by priority.</p>';
      html += renderGroupedIssues(data.contentIssues, 'CNT', 'Content Lift');
      html += '</section>';
    }

    // ─── AEO INSIGHTS ───
    if (data.aeo && data.aeo.findings) {
      html += '<section class="report-section">';
      html += '<h2 class="report-section__heading">AEO Insights (AI Search Visibility)</h2>';
      html += '<p class="report-section__subheading">How your site structure affects visibility in AI search engines like ChatGPT, Perplexity, and Google AI Overviews.</p>';
      html += '<div class="aeo-score-bar"><div class="aeo-score-bar__grade">' + data.aeo.grade + '</div>';
      html += '<div><span class="aeo-score-bar__value">' + data.aeo.score + '/' + data.aeo.maxScore + '</span> AEO Score</div></div>';
      data.aeo.findings.forEach(function (f) {
        var icon = f.status === 'pass' ? '✓' : f.status === 'warn' ? '⚠' : '✗';
        var cls = 'aeo-icon--' + f.status;
        html += '<div class="aeo-finding"><span class="' + cls + '">' + icon + '</span><span>' + esc(f.text) + '</span></div>';
      });
      html += '</section>';
    }

    // Footer
    html += '<footer class="report-footer">';
    html += '<p class="report-footer__brand">Simply Black and White</p>';
    html += '<p>simplyblackandwhite.com</p>';
    html += '<p style="margin-top:8px;">This workbook is intended for use by the development and content teams assigned to remediate the issues identified. It does not constitute legal advice.</p>';
    html += '</footer>';

    container.innerHTML += html;

    // Bind buttons
    document.getElementById('btn-print-wb').addEventListener('click', function () { window.print(); });
    document.getElementById('btn-back-wb').addEventListener('click', function () { window.location.href = '/scanner'; });
  }

  function renderGroupedIssues(issues, prefix, liftLabel) {
    var groups = { critical: [], serious: [], moderate: [], minor: [] };
    issues.forEach(function (issue) {
      var severity = issue.impact || 'minor';
      if (groups[severity]) groups[severity].push(issue);
    });

    // Deduplicate by rule ID within each group
    function dedup(arr) {
      var seen = {};
      var result = [];
      arr.forEach(function (issue) {
        if (!seen[issue.id]) {
          seen[issue.id] = { issue: issue, pages: [] };
          result.push(seen[issue.id]);
        }
        if (issue.pageUrl) seen[issue.id].pages.push(issue.pageUrl);
      });
      return result;
    }

    var html = '';
    var severityLabels = { critical: 'Critical', serious: 'Serious', moderate: 'Moderate', minor: 'Minor' };
    var severityColors = { critical: '#c0392b', serious: '#e67e22', moderate: '#f39c12', minor: '#95a5a6' };
    var counter = 0;

    ['critical', 'serious', 'moderate', 'minor'].forEach(function (severity) {
      var items = dedup(groups[severity]);
      if (items.length === 0) return;

      var isOpen = severity === 'critical' || severity === 'serious' ? ' open' : '';
      html += '<details class="workbook-group"' + isOpen + ' style="margin-bottom:16px;border-left:3px solid ' + severityColors[severity] + ';padding-left:12px;">';
      html += '<summary style="cursor:pointer;font-weight:600;font-size:14px;padding:8px 0;color:#1A1A1A;">';
      html += severityLabels[severity] + ' (' + items.length + ' unique issue' + (items.length !== 1 ? 's' : '') + ')';
      html += '</summary>';

      items.forEach(function (entry) {
        counter++;
        html += renderWorkbookIssue(entry.issue, prefix + '-' + pad(counter), liftLabel);
        // Show affected pages if multiple
        if (entry.pages.length > 1) {
          html += '<div style="margin:-12px 0 20px 0;padding:8px 12px;background:#F7F7F5;border-radius:4px;font-size:11px;color:#666;">';
          html += '<strong>Affects ' + entry.pages.length + ' pages:</strong> ';
          html += entry.pages.slice(0, 5).map(function (p) { try { return new URL(p).pathname; } catch(e) { return p; } }).join(', ');
          if (entry.pages.length > 5) html += ' + ' + (entry.pages.length - 5) + ' more';
          html += '</div>';
        }
      });

      html += '</details>';
    });

    return html;
  }

  function renderWorkbookIssue(issue, id, liftLabel) {
    var html = '<div class="report-issue report-issue--' + issue.impact + '" style="margin-bottom:20px;page-break-inside:avoid;">';
    html += '<div class="report-issue__badges">';
    html += '<span class="report-issue__badge report-issue__badge--' + issue.impact + '">' + issue.impact.toUpperCase() + '</span>';
    html += '<span class="report-issue__badge ' + (liftLabel === 'Content Lift' ? 'report-issue__badge--content' : 'report-issue__badge--technical') + '">' + liftLabel.toUpperCase() + '</span>';
    html += '<span class="report-issue__instances">' + id + ' · ' + issue.instanceCount + ' instance' + (issue.instanceCount !== 1 ? 's' : '') + '</span>';
    html += '</div>';

    // What's wrong
    html += '<h3 class="report-issue__title">' + esc(issue.plainDescription) + '</h3>';
    html += '<p style="font-size:11px;color:#999;margin-bottom:8px;font-family:monospace;">rule: ' + esc(issue.id) + '</p>';

    // Where it is
    if (issue.cssSelector) {
      html += '<p style="font-size:13px;margin-bottom:8px;"><strong>Where:</strong> <code style="background:#f5f5f5;padding:2px 6px;border-radius:3px;font-size:12px;">' + esc(issue.cssSelector) + '</code></p>';
    }

    // What to do
    html += '<div class="report-issue__fix"><p class="report-issue__fix-label">What to do</p><p>' + esc(issue.howToFix) + '</p></div>';

    // Code snippet
    if (issue.htmlSnippet) {
      html += '<div style="margin-top:12px;"><p style="font-size:11px;color:#888;margin-bottom:4px;">Current code:</p>';
      html += '<pre style="background:#1A1A1A;color:#e0e0e0;padding:12px;border-radius:6px;font-size:11px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;">' + esc(issue.htmlSnippet) + '</pre></div>';
    }

    // WCAG reference
    if (issue.helpUrl) {
      html += '<p style="font-size:12px;margin-top:8px;"><a href="' + esc(issue.helpUrl) + '" style="color:#1A1A1A;" target="_blank">WCAG Documentation →</a></p>';
    }

    html += '</div>';
    return html;
  }

  // Helpers
  function row(label, value) {
    return '<tr><td style="padding:8px 12px;background:#F7F7F5;font-weight:600;border:1px solid #E5E5E5;width:200px;">' + label + '</td><td style="padding:8px 12px;border:1px solid #E5E5E5;">' + value + '</td></tr>';
  }

  function pad(n) { return String(n).padStart(3, '0'); }

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
