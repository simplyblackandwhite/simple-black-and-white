/**
 * Scanner Dashboard — Frontend Application
 * Simply Black and White — Client Profile Workspace
 *
 * Two views: Client grid (default) ↔ Client detail (tabbed scan results)
 * Handles: scan submission, client profiles, tabbed overview/issues/AEO/quote/pages,
 * notes, delete, score history charts.
 */
(function () {
  'use strict';

  // ─── DOM References ──────────────────────────────────────────
  var form = document.getElementById('dash-scan-form');
  var urlInput = document.getElementById('dash-url');
  var scanBtn = document.getElementById('dash-scan-btn');
  var btnText = scanBtn ? scanBtn.querySelector('.dash-scan-form__btn-text') : null;
  var btnLoading = scanBtn ? scanBtn.querySelector('.dash-scan-form__btn-loading') : null;
  var errorPanel = document.getElementById('dash-scan-error');
  var progressPanel = document.getElementById('dash-scan-progress');
  var progressFill = document.getElementById('dash-progress-fill');
  var progressStatus = document.getElementById('dash-progress-status');

  // Views
  var clientsSection = document.getElementById('dash-clients');
  var clientsGrid = document.getElementById('dash-clients-grid');
  var clientsEmpty = document.getElementById('clients-empty');
  var clientDetailSection = document.getElementById('dash-client-detail');
  var resultsSection = document.getElementById('dash-results');

  // Crawl options
  var optMaxPages = document.getElementById('opt-max-pages');
  var optMaxDepth = document.getElementById('opt-max-depth');
  var optRobots = document.getElementById('opt-robots');
  var optAgeGate = document.getElementById('opt-age-gate');

  // State
  var currentScanData = null;
  var currentClientId = null;
  var chartInstances = {};

  // ─── Initialize ──────────────────────────────────────────────
  loadUser();
  loadClients();
  initTabs();
  initBackButton();
  initNotesButton();
  initDeleteClientButton();
  initEditNameButton();
  initOutreachButton();
  initCompareButtons();

  // ─── User Display ────────────────────────────────────────────
  function loadUser() {
    fetch('/scanner/api/me')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.success && data.user) {
          var el = document.getElementById('dash-user');
          if (el) el.textContent = data.user.email;
        }
        if (data.version) {
          var vEl = document.getElementById('dash-version');
          if (vEl) vEl.textContent = 'v' + data.version;
        }
      })
      .catch(function () {});
  }

  // ═══════════════════════════════════════════════════════════════
  // VIEW SWITCHING: Clients Grid ↔ Client Detail
  // ═══════════════════════════════════════════════════════════════

  function showClientsView() {
    clientsSection.hidden = false;
    clientDetailSection.hidden = true;
    currentClientId = null;
    loadClients();
  }

  function showClientDetail(clientId) {
    clientsSection.hidden = true;
    clientDetailSection.hidden = false;
    currentClientId = clientId;
    loadClientDetail(clientId);
  }

  function initBackButton() {
    var btn = document.getElementById('btn-back-clients');
    if (btn) btn.addEventListener('click', showClientsView);
  }

  // ═══════════════════════════════════════════════════════════════
  // CLIENT PROFILES
  // ═══════════════════════════════════════════════════════════════

  function loadClients() {
    fetch('/scanner/api/clients')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.success && data.clients && data.clients.length > 0) {
          renderClientCards(data.clients);
        } else {
          clientsGrid.innerHTML = '';
          if (clientsEmpty) {
            clientsEmpty.style.display = 'block';
            clientsGrid.appendChild(clientsEmpty);
          }
        }
      })
      .catch(function () {});
  }

  function renderClientCards(clients) {
    clientsGrid.innerHTML = '';

    clients.forEach(function (client) {
      var card = document.createElement('div');
      card.className = 'client-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', 'View ' + (client.display_name || client.domain));

      var name = client.display_name || client.domain;
      var score = client.latestScan ? client.latestScan.accessibility_score : 0;
      var issues = client.latestScan ? client.latestScan.total_issues : 0;
      var pages = client.latestScan ? client.latestScan.pages_scanned : 0;
      var date = client.latestScan ? formatShortDate(client.latestScan.created_at) : '—';

      // Delta display
      var deltaHtml = '';
      if (client.delta) {
        var scoreDelta = client.delta.score;
        var cls = scoreDelta > 0 ? 'positive' : scoreDelta < 0 ? 'negative' : 'neutral';
        var arrow = scoreDelta > 0 ? '↑' : scoreDelta < 0 ? '↓' : '=';
        deltaHtml = '<span class="client-card__delta client-card__delta--' + cls + '">' + arrow + Math.abs(scoreDelta) + '</span>';
      }

      card.innerHTML =
        '<div class="client-card__header">' +
          '<img class="client-card__favicon" src="' + escHtml(client.favicon_url || '') + '" alt="" width="32" height="32" loading="lazy" />' +
          '<div>' +
            '<h3 class="client-card__name">' + escHtml(name) + '</h3>' +
            (client.display_name ? '<span class="client-card__domain">' + escHtml(client.domain) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="client-card__stats">' +
          '<div class="client-card__stat">' +
            '<span class="client-card__stat-value">' + (score ? score + '%' : '—') + '</span>' +
            '<span class="client-card__stat-label">Score ' + deltaHtml + '</span>' +
          '</div>' +
          '<div class="client-card__stat">' +
            '<span class="client-card__stat-value">' + issues + '</span>' +
            '<span class="client-card__stat-label">Issues</span>' +
          '</div>' +
          '<div class="client-card__stat">' +
            '<span class="client-card__stat-value">' + pages + '</span>' +
            '<span class="client-card__stat-label">Pages</span>' +
          '</div>' +
        '</div>' +
        '<div class="client-card__footer">' +
          '<span class="client-card__scans">' + client.totalScans + ' scan' + (client.totalScans !== 1 ? 's' : '') + '</span>' +
          '<span class="client-card__date">' + date + '</span>' +
        '</div>';

      card.addEventListener('click', function () { showClientDetail(client.id); });
      card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showClientDetail(client.id); } });

      clientsGrid.appendChild(card);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // CLIENT DETAIL
  // ═══════════════════════════════════════════════════════════════

  function loadClientDetail(clientId) {
    fetch('/scanner/api/clients/' + clientId)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.success) return;

        var client = data.client;
        var scans = data.scans || [];
        var latest = data.latestDetails;

        populateClientHeader(client, scans);

        // Render latest scan results
        if (latest) {
          currentScanData = latest;
          resultsSection.hidden = false;
          renderResults(latest);
        } else {
          resultsSection.hidden = true;
        }
      })
      .catch(function () {});
  }

  // Load client header + history, but use provided scan data instead of re-fetching
  function showClientDetailWithData(clientId, scanData) {
    clientsSection.hidden = true;
    clientDetailSection.hidden = false;
    currentClientId = clientId;

    fetch('/scanner/api/clients/' + clientId)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.success) return;
        populateClientHeader(data.client, data.scans || []);

        // Use the provided scan data directly (has quote included)
        currentScanData = scanData;
        resultsSection.hidden = false;
        renderResults(scanData);
      })
      .catch(function () {});
  }

  function populateClientHeader(client, scans) {
    var favicon = document.getElementById('client-favicon');
    var nameDisplay = document.getElementById('client-name-display');
    var domainDisplay = document.getElementById('client-domain-display');
    var notesInput = document.getElementById('client-notes');

    if (favicon) favicon.src = client.favicon_url || '';
    if (nameDisplay) nameDisplay.textContent = client.display_name || client.domain;
    if (domainDisplay) domainDisplay.textContent = client.domain;
    if (notesInput) notesInput.value = client.notes || '';

    var contactEmailInput = document.getElementById('client-contact-email');
    if (contactEmailInput) contactEmailInput.value = client.contact_email || '';

    renderClientHistory(scans);
  }

  function renderClientHistory(scans) {
    var tbody = document.getElementById('client-history-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    compareSelection = [];
    updateCompareBar();

    if (scans.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--color-text-muted);padding:var(--space-6);">No scans yet.</td></tr>';
      var hint = document.getElementById('compare-hint');
      if (hint) hint.hidden = true;
      return;
    }

    // Show/hide compare hint based on scan count
    var hintEl = document.getElementById('compare-hint');
    if (hintEl) hintEl.hidden = scans.length < 2;

    scans.forEach(function (scan) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><input type="checkbox" class="dash-history__check" data-scan-id="' + scan.id + '" aria-label="Select scan from ' + formatDate(scan.created_at) + ' to compare"></td>' +
        '<td>' + formatDate(scan.created_at) + '</td>' +
        '<td>' + (scan.pages_scanned || 1) + '</td>' +
        '<td>' + scan.total_issues + '</td>' +
        '<td>' + (scan.accessibility_score ? scan.accessibility_score + '%' : '—') + '</td>' +
        '<td>' + (scan.aeo_grade || '—') + '</td>' +
        '<td><div class="dash-history__actions">' +
          '<button class="dash-history__btn" data-scan-id="' + scan.id + '" data-action="view">View</button>' +
          '<button class="dash-history__btn" data-scan-id="' + scan.id + '" data-action="report">Report</button>' +
          '<button class="dash-history__btn" data-scan-id="' + scan.id + '" data-action="delete" style="color:#c0392b;">Delete</button>' +
        '</div></td>';

      tbody.appendChild(tr);
    });

    // Action button handlers
    tbody.querySelectorAll('.dash-history__btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var scanId = btn.getAttribute('data-scan-id');
        var action = btn.getAttribute('data-action');
        if (action === 'view') loadScanIntoDetail(scanId);
        else if (action === 'report') window.open('/scanner/report/' + scanId, '_blank');
        else if (action === 'delete') confirmDeleteScan(scanId);
      });
    });

    // Checkbox handlers for comparison selection
    tbody.querySelectorAll('.dash-history__check').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var scanId = parseInt(cb.getAttribute('data-scan-id'));
        if (cb.checked) {
          compareSelection.push(scanId);
          // Cap at 2 — uncheck the oldest selection if a third is picked
          if (compareSelection.length > 2) {
            var removed = compareSelection.shift();
            var removedCb = tbody.querySelector('.dash-history__check[data-scan-id="' + removed + '"]');
            if (removedCb) removedCb.checked = false;
          }
        } else {
          compareSelection = compareSelection.filter(function (id) { return id !== scanId; });
        }
        updateCompareBar();
      });
    });
  }

  // ─── Comparison Selection Bar ────────────────────────────────
  var compareSelection = [];

  function updateCompareBar() {
    var bar = document.getElementById('dash-compare-bar');
    var count = document.getElementById('compare-count');
    var btn = document.getElementById('btn-compare');
    if (!bar) return;

    if (compareSelection.length > 0) {
      bar.hidden = false;
      count.textContent = compareSelection.length + ' selected';
      btn.disabled = compareSelection.length !== 2;
    } else {
      bar.hidden = true;
    }
  }

  function initCompareButtons() {
    var btn = document.getElementById('btn-compare');
    var clearBtn = document.getElementById('btn-compare-clear');
    var closeBtn = document.getElementById('btn-comparison-close');
    var reportBtn = document.getElementById('btn-comparison-report');

    if (btn) btn.addEventListener('click', function () {
      if (compareSelection.length === 2) {
        runComparison(compareSelection[0], compareSelection[1]);
      }
    });

    if (clearBtn) clearBtn.addEventListener('click', function () {
      compareSelection = [];
      document.querySelectorAll('.dash-history__check').forEach(function (cb) { cb.checked = false; });
      updateCompareBar();
    });

    if (closeBtn) closeBtn.addEventListener('click', function () {
      document.getElementById('dash-comparison').hidden = true;
    });

    if (reportBtn) reportBtn.addEventListener('click', function () {
      if (comparisonPair) {
        window.open('/scanner/comparison/' + comparisonPair[0] + '/' + comparisonPair[1], '_blank');
      }
    });
  }

  var comparisonPair = null;

  function runComparison(id1, id2) {
    comparisonPair = [id1, id2];
    var section = document.getElementById('dash-comparison');
    var content = document.getElementById('comparison-content');
    content.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);padding:var(--space-6);">Comparing scans...</p>';
    section.hidden = false;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });

    fetch('/scanner/api/compare/' + id1 + '/' + id2)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.success) {
          renderComparison(data.comparison);
        } else {
          content.innerHTML = '<p style="color:#c0392b;padding:var(--space-4);">' + escHtml(data.error || 'Comparison failed.') + '</p>';
        }
      })
      .catch(function () {
        content.innerHTML = '<p style="color:#c0392b;padding:var(--space-4);">Network error.</p>';
      });
  }

  function renderComparison(c) {
    var content = document.getElementById('comparison-content');
    var scoreUp = c.deltas.score > 0;
    var scoreFlat = c.deltas.score === 0;
    var deltaClass = scoreUp ? 'positive' : scoreFlat ? 'neutral' : 'negative';
    var arrow = scoreUp ? '↑' : scoreFlat ? '→' : '↓';
    var sign = c.deltas.score > 0 ? '+' : '';

    var html = '';

    // Headline
    html += '<div class="cmp-headline cmp-headline--' + deltaClass + '">';
    html += '<div class="cmp-headline__momentum">' + escHtml(c.momentum.label) + '</div>';
    html += '<div class="cmp-headline__scores">';
    html += '<span class="cmp-headline__score-from">' + c.earlier.score + '%</span>';
    html += '<span class="cmp-headline__arrow">' + arrow + '</span>';
    html += '<span class="cmp-headline__score-to">' + c.later.score + '%</span>';
    html += '<span class="cmp-headline__delta">' + sign + c.deltas.score + '</span>';
    html += '</div>';
    html += '<div class="cmp-headline__dates">' + formatShortDate(c.earlier.date) + ' → ' + formatShortDate(c.later.date) + ' · ' + c.daysBetween + ' day' + (c.daysBetween !== 1 ? 's' : '') + ' apart</div>';
    html += '</div>';

    // At-a-glance cards
    html += '<div class="cmp-cards">';
    html += cmpCard('Resolved', c.summary.resolvedCount, 'issue types cleared', 'positive');
    html += cmpCard('New', c.summary.newCount, 'issue types appeared', c.summary.newCount > 0 ? 'negative' : 'neutral');
    html += cmpCard('Still Failing', c.summary.persistentCount, 'need attention', 'neutral');
    html += cmpCard('Total Issues', (c.deltas.issues > 0 ? '+' : '') + c.deltas.issues, c.earlier.issues + ' → ' + c.later.issues, c.deltas.issues < 0 ? 'positive' : c.deltas.issues > 0 ? 'negative' : 'neutral');
    html += '</div>';

    // Talking points
    if (c.talkingPoints && c.talkingPoints.length > 0) {
      html += '<div class="cmp-talking">';
      html += '<h4 class="cmp-talking__title">Talking Points</h4>';
      html += '<ul class="cmp-talking__list">';
      c.talkingPoints.forEach(function (p) { html += '<li>' + escHtml(p) + '</li>'; });
      html += '</ul></div>';
    }

    // Resolved / New / Persistent columns
    html += '<div class="cmp-columns">';
    html += cmpColumn('Resolved', c.resolved, 'positive', 'These issues were cleared since the last scan.');
    html += cmpColumn('New Issues', c.newIssues, 'negative', 'These appeared since the last scan — likely new content or a change.');
    html += cmpColumn('Still Failing', c.persistent, 'neutral', 'Present in both scans — still need work.');
    html += '</div>';

    // Page movement
    if ((c.pageMovement.improved.length > 0 || c.pageMovement.degraded.length > 0)) {
      html += '<div class="cmp-pages">';
      html += '<h4 class="cmp-pages__title">Page-Level Movement</h4>';
      html += '<div class="cmp-pages__grid">';
      if (c.pageMovement.improved.length > 0) {
        html += '<div class="cmp-pages__col"><h5 class="cmp-pages__col-title cmp-pages__col-title--positive">Improved (' + c.pageMovement.improved.length + ')</h5>';
        c.pageMovement.improved.slice(0, 8).forEach(function (p) {
          html += '<div class="cmp-pages__row"><span>' + escHtml(truncateUrl(p.url)) + '</span><span class="cmp-pages__delta cmp-pages__delta--positive">' + p.delta + '</span></div>';
        });
        html += '</div>';
      }
      if (c.pageMovement.degraded.length > 0) {
        html += '<div class="cmp-pages__col"><h5 class="cmp-pages__col-title cmp-pages__col-title--negative">Got Worse (' + c.pageMovement.degraded.length + ')</h5>';
        c.pageMovement.degraded.slice(0, 8).forEach(function (p) {
          html += '<div class="cmp-pages__row"><span>' + escHtml(truncateUrl(p.url)) + '</span><span class="cmp-pages__delta cmp-pages__delta--negative">+' + p.delta + '</span></div>';
        });
        html += '</div>';
      }
      html += '</div></div>';
    }

    content.innerHTML = html;
  }

  function cmpCard(label, value, sublabel, tone) {
    return '<div class="cmp-card cmp-card--' + tone + '">' +
      '<span class="cmp-card__value">' + value + '</span>' +
      '<span class="cmp-card__label">' + escHtml(label) + '</span>' +
      '<span class="cmp-card__sub">' + escHtml(sublabel) + '</span>' +
    '</div>';
  }

  function cmpColumn(title, items, tone, desc) {
    var html = '<div class="cmp-column">';
    html += '<h4 class="cmp-column__title cmp-column__title--' + tone + '">' + escHtml(title) + ' (' + items.length + ')</h4>';
    html += '<p class="cmp-column__desc">' + escHtml(desc) + '</p>';
    if (items.length === 0) {
      html += '<p class="cmp-column__empty">None</p>';
    } else {
      html += '<ul class="cmp-column__list">';
      items.slice(0, 10).forEach(function (item) {
        var instanceNote = '';
        if (item.instanceDelta !== undefined && item.instanceDelta !== 0) {
          var iSign = item.instanceDelta > 0 ? '+' : '';
          instanceNote = ' <span class="cmp-column__instances">(' + iSign + item.instanceDelta + ' instances)</span>';
        }
        html += '<li class="cmp-column__item">' +
          '<span class="cmp-column__badge cmp-column__badge--' + item.impact + '">' + item.impact + '</span>' +
          '<span>' + escHtml(item.description || item.id) + instanceNote + '</span>' +
        '</li>';
      });
      if (items.length > 10) html += '<li class="cmp-column__more">+ ' + (items.length - 10) + ' more</li>';
      html += '</ul>';
    }
    html += '</div>';
    return html;
  }

  function loadScanIntoDetail(scanId) {
    fetch('/scanner/api/scans/' + scanId)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.success && data.details) {
          currentScanData = data.details;
          currentScanData.scanId = parseInt(scanId);
          resultsSection.hidden = false;
          renderResults(data.details);
        }
      })
      .catch(function () {});
  }

  // ─── Notes ───────────────────────────────────────────────────
  function initNotesButton() {
    var btn = document.getElementById('btn-save-notes');
    if (!btn) return;

    btn.addEventListener('click', function () {
      var notesEl = document.getElementById('client-notes');
      if (!notesEl) return;
      var notes = notesEl.value;

      if (!currentClientId) {
        btn.textContent = 'No client selected';
        setTimeout(function () { btn.textContent = 'Save Notes'; }, 2000);
        return;
      }

      btn.textContent = 'Saving...';

      fetch('/scanner/api/clients/' + currentClientId + '/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          btn.textContent = data.success ? 'Saved!' : 'Error saving';
          setTimeout(function () { btn.textContent = 'Save Notes'; }, 1500);
        })
        .catch(function () {
          btn.textContent = 'Error saving';
          setTimeout(function () { btn.textContent = 'Save Notes'; }, 2000);
        });
    });
  }

  // ─── Edit Name ───────────────────────────────────────────────
  function initEditNameButton() {
    var btn = document.getElementById('btn-edit-name');
    if (btn) {
      btn.addEventListener('click', function () {
        var nameEl = document.getElementById('client-name-display');
        var current = nameEl.textContent;
        var newName = prompt('Client display name:', current);
        if (newName !== null && newName.trim() && currentClientId) {
          fetch('/scanner/api/clients/' + currentClientId + '/name', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayName: newName.trim() }),
          }).then(function () {
            nameEl.textContent = newName.trim();
          });
        }
      });
    }
  }

  // ─── Delete Client ───────────────────────────────────────────
  function initDeleteClientButton() {
    var btn = document.getElementById('btn-delete-client');
    if (btn) {
      btn.addEventListener('click', function () {
        showConfirmDialog('Delete Client', 'This will permanently delete this client profile and all associated scan data. This cannot be undone.', function () {
          fetch('/scanner/api/clients/' + currentClientId, { method: 'DELETE' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
              if (data.success) showClientsView();
            });
        });
      });
    }
  }

  // ─── Outreach Button ─────────────────────────────────────────
  function initOutreachButton() {
    var btn = document.getElementById('btn-send-outreach');
    var emailInput = document.getElementById('client-contact-email');
    var statusEl = document.getElementById('outreach-status');

    if (!btn || !emailInput) return;

    btn.addEventListener('click', function () {
      var email = emailInput.value.trim();
      if (!email || !email.includes('@') || !email.includes('.')) {
        statusEl.textContent = 'Please enter a valid email address.';
        statusEl.className = 'dash-client-detail__outreach-status dash-client-detail__outreach-status--error';
        return;
      }
      if (!currentClientId) return;

      btn.disabled = true;
      btn.textContent = 'Sending...';
      statusEl.textContent = '';

      fetch('/scanner/api/clients/' + currentClientId + '/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          btn.disabled = false;
          btn.textContent = 'Send Snapshot';
          if (data.success) {
            statusEl.textContent = 'Snapshot sent to ' + email;
            statusEl.className = 'dash-client-detail__outreach-status dash-client-detail__outreach-status--success';
          } else {
            statusEl.textContent = data.error || 'Failed to send.';
            statusEl.className = 'dash-client-detail__outreach-status dash-client-detail__outreach-status--error';
          }
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = 'Send Snapshot';
          statusEl.textContent = 'Network error.';
          statusEl.className = 'dash-client-detail__outreach-status dash-client-detail__outreach-status--error';
        });
    });
  }

  // ─── Delete Scan ─────────────────────────────────────────────
  function confirmDeleteScan(scanId) {
    showConfirmDialog('Delete Scan', 'This will permanently delete this scan record. This cannot be undone.', function () {
      fetch('/scanner/api/scans/' + scanId, { method: 'DELETE' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.success && currentClientId) {
            loadClientDetail(currentClientId);
          }
        });
    });
  }

  // ─── Confirm Dialog ──────────────────────────────────────────
  function showConfirmDialog(title, message, onConfirm) {
    var overlay = document.createElement('div');
    overlay.className = 'dash-confirm-overlay';
    overlay.innerHTML =
      '<div class="dash-confirm-dialog">' +
        '<h3 class="dash-confirm-dialog__title">' + escHtml(title) + '</h3>' +
        '<p class="dash-confirm-dialog__message">' + escHtml(message) + '</p>' +
        '<div class="dash-confirm-dialog__actions">' +
          '<button class="btn btn--secondary btn--sm" id="confirm-cancel">Cancel</button>' +
          '<button class="btn--danger" id="confirm-ok">Delete</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    document.getElementById('confirm-cancel').addEventListener('click', function () { overlay.remove(); });
    document.getElementById('confirm-ok').addEventListener('click', function () { overlay.remove(); onConfirm(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
  }

  // ═══════════════════════════════════════════════════════════════
  // TAB NAVIGATION
  // ═══════════════════════════════════════════════════════════════

  function initTabs() {
    var tabs = document.querySelectorAll('.dash-tabs__tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () { switchTab(tab); });
      tab.addEventListener('keydown', function (e) {
        var tabArr = Array.from(tabs);
        var idx = tabArr.indexOf(tab);
        if (e.key === 'ArrowRight') { e.preventDefault(); var next = tabArr[(idx + 1) % tabArr.length]; next.focus(); switchTab(next); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); var prev = tabArr[(idx - 1 + tabArr.length) % tabArr.length]; prev.focus(); switchTab(prev); }
      });
    });
  }

  function switchTab(activeTab) {
    var tabs = document.querySelectorAll('.dash-tabs__tab');
    var panels = document.querySelectorAll('.dash-tab-panel');
    tabs.forEach(function (t) { t.classList.remove('dash-tabs__tab--active'); t.setAttribute('aria-selected', 'false'); });
    panels.forEach(function (p) { p.hidden = true; p.classList.add('dash-tab-panel--hidden'); });
    activeTab.classList.add('dash-tabs__tab--active');
    activeTab.setAttribute('aria-selected', 'true');
    var panel = document.getElementById(activeTab.getAttribute('aria-controls'));
    if (panel) { panel.hidden = false; panel.classList.remove('dash-tab-panel--hidden'); }
  }

  // ═══════════════════════════════════════════════════════════════
  // SCAN SUBMISSION
  // ═══════════════════════════════════════════════════════════════

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      startScan();
    });
  }

  function startScan() {
    var rawUrl = urlInput.value.trim();
    if (!rawUrl) { showError('Please enter a URL to scan.'); urlInput.focus(); return; }

    var urlToSend = rawUrl;
    if (!/^https?:\/\//i.test(urlToSend)) urlToSend = 'https://' + urlToSend;

    var body = { url: urlToSend };
    if (optMaxPages) body.maxPages = parseInt(optMaxPages.value) || 50;
    if (optMaxDepth) body.maxDepth = parseInt(optMaxDepth.value) || 3;
    if (optRobots) body.respectRobots = optRobots.checked;
    if (optAgeGate) body.handleAgeGate = optAgeGate.checked;

    clearError();
    setLoading(true);
    showProgress();
    updateProgress(0, 'Validating URL and checking reachability...');

    // Use fetch with SSE streaming for real-time progress
    fetch('/scanner/api/scan/full', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (response) {
        if (!response.ok && !response.headers.get('content-type').includes('text/event-stream')) {
          return response.json().then(function (d) { throw new Error(d.error || 'Scan failed.'); });
        }

        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';

        function readStream() {
          return reader.read().then(function (result) {
            if (result.done) return;

            buffer += decoder.decode(result.value, { stream: true });
            var lines = buffer.split('\n\n');
            buffer = lines.pop(); // Keep incomplete chunk

            lines.forEach(function (line) {
              if (!line.startsWith('data: ')) return;
              try {
                var event = JSON.parse(line.replace('data: ', ''));

                if (event.type === 'progress') {
                  var pct = event.maxPages > 0 ? Math.round((event.currentPage / event.maxPages) * 90) : 50;
                  var pageUrl = event.currentUrl || '';
                  var shortUrl = pageUrl;
                  try { shortUrl = new URL(pageUrl).pathname; } catch(e) {}
                  updateProgress(pct, 'Scanning page ' + event.currentPage + ' of ~' + event.totalQueued + ': ' + shortUrl);
                }

                if (event.type === 'complete') {
                  updateProgress(100, 'Scan complete!');
                  setLoading(false);
                  setTimeout(function () { hideProgress(); }, 600);

                  currentScanData = event.results;
                  if (event.results.clientId) {
                    // Show client detail but render the fresh results directly
                    // (avoids re-fetching from DB which may not have the quote yet)
                    showClientDetailWithData(event.results.clientId, event.results);
                  } else {
                    loadClients();
                  }
                }

                if (event.type === 'error') {
                  setLoading(false);
                  hideProgress();
                  showError(event.error || 'Scan failed.');
                }
              } catch (e) {
                // Ignore parse errors on incomplete chunks
              }
            });

            return readStream();
          });
        }

        return readStream();
      })
      .catch(function (err) {
        setLoading(false);
        hideProgress();
        showError(err.message || 'Network error. Please check your connection.');
      });
  }

  function setLoading(isLoading) {
    scanBtn.disabled = isLoading;
    urlInput.disabled = isLoading;
    if (btnText) btnText.hidden = isLoading;
    if (btnLoading) btnLoading.hidden = !isLoading;
  }

  function showProgress() { progressPanel.hidden = false; }
  function hideProgress() { progressPanel.hidden = true; if (progressFill) progressFill.style.width = '0%'; }

  function updateProgress(pct, message) {
    if (progressFill) progressFill.style.width = Math.min(pct, 100) + '%';
    if (progressStatus) progressStatus.textContent = message;
  }

  function showError(msg) { if (errorPanel) { errorPanel.textContent = msg; errorPanel.hidden = false; } }
  function clearError() { if (errorPanel) { errorPanel.textContent = ''; errorPanel.hidden = true; } }

  // ═══════════════════════════════════════════════════════════════
  // RENDER RESULTS (tabs within client detail)
  // ═══════════════════════════════════════════════════════════════

  function renderResults(data) {
    var resultsUrl = document.getElementById('results-url');
    var resultsDate = document.getElementById('results-date');
    var resultsPages = document.getElementById('results-pages');

    if (resultsUrl) resultsUrl.textContent = data.url || '';
    if (resultsDate) resultsDate.textContent = formatDate(data.timestamp);
    if (resultsPages && data.crawl) resultsPages.textContent = data.crawl.pagesScanned + ' page' + (data.crawl.pagesScanned !== 1 ? 's' : '') + ' scanned';
    else if (resultsPages) resultsPages.textContent = '';

    renderOverviewTab(data);
    renderIssuesTab(data);
    renderAeoTab(data);
    renderQuoteTab(data);
    renderPagesTab(data);
    attachExportHandlers();
    loadScoreHistory(data.url);

    var overviewBtn = document.getElementById('tab-btn-overview');
    if (overviewBtn) switchTab(overviewBtn);
  }

  // ═══════════════════════════════════════════════════════════════
  // OVERVIEW TAB
  // ═══════════════════════════════════════════════════════════════

  function renderOverviewTab(data) {
    var overview = data.overview || {};
    var score = overview.accessibilityScore || data.summary.accessibilityScore || 0;

    if (!data.overview && data.summary) {
      overview = {
        accessibilityScore: Math.max(0, 100 - ((data.summary.critical || 0) * 15 + (data.summary.serious || 0) * 8 + (data.summary.moderate || 0) * 3 + (data.summary.minor || 0) * 1)),
        wcagCompliance: { levelA: 0, levelAA: 0, levelAAA: 0, counts: { A: 0, AA: 0, AAA: 0 } },
        disabilityCategories: { visual: 0, auditory: 0, motor: 0, cognitive: 0 },
        issuesByDepth: { '0': { average: data.summary.totalIssues || 0, total: data.summary.totalIssues || 0, pageCount: 1 } },
        commonIssues: [],
      };
      score = overview.accessibilityScore;
    }

    renderGauge(score);

    var compliance = overview.wcagCompliance || {};
    var counts = compliance.counts || {};
    setLevelCard('a', compliance.levelA || 0, counts.A || 0);
    setLevelCard('aa', compliance.levelAA || 0, counts.AA || 0);
    setLevelCard('aaa', compliance.levelAAA || 0, counts.AAA || 0);

    var disabilities = overview.disabilityCategories || {};
    setText('disability-visual', disabilities.visual || 0);
    setText('disability-auditory', disabilities.auditory || 0);
    setText('disability-motor', disabilities.motor || 0);
    setText('disability-cognitive', disabilities.cognitive || 0);

    // Wire up disability card drill-down
    initDisabilityDrillDown(data.issues || [], overview.commonIssues || []);

    renderCommonIssuesChart(overview.commonIssues || []);
    renderIssuesByDepthChart(overview.issuesByDepth || {});
  }

  function renderGauge(score) {
    var gaugeScore = document.getElementById('gauge-score');
    var gaugeFill = document.getElementById('gauge-fill');
    var gaugeLabel = document.getElementById('gauge-label');
    if (gaugeScore) gaugeScore.textContent = score;
    if (gaugeFill) {
      var circumference = 2 * Math.PI * 52;
      gaugeFill.style.strokeDasharray = circumference;
      gaugeFill.style.strokeDashoffset = circumference - (score / 100) * circumference;
      gaugeFill.classList.remove('gauge-fill--poor', 'gauge-fill--fair', 'gauge-fill--good', 'gauge-fill--excellent');
      if (score < 30) gaugeFill.classList.add('gauge-fill--poor');
      else if (score < 60) gaugeFill.classList.add('gauge-fill--fair');
      else if (score < 85) gaugeFill.classList.add('gauge-fill--good');
      else gaugeFill.classList.add('gauge-fill--excellent');
    }
    if (gaugeLabel) {
      if (score < 30) gaugeLabel.textContent = 'Needs Attention';
      else if (score < 60) gaugeLabel.textContent = 'Fair';
      else if (score < 85) gaugeLabel.textContent = 'Good';
      else gaugeLabel.textContent = 'Excellent';
    }
  }

  function setLevelCard(level, pct, count) {
    var bar = document.getElementById('level-' + level + '-bar');
    var pctEl = document.getElementById('level-' + level + '-pct');
    var countEl = document.getElementById('level-' + level + '-count');
    if (bar) bar.style.width = Math.min(pct, 100) + '%';
    if (pctEl) pctEl.textContent = pct + '%';
    if (countEl) countEl.textContent = count + ' issue' + (count !== 1 ? 's' : '');
  }

  function renderCommonIssuesChart(commonIssues) {
    var ctx = document.getElementById('chart-common-issues');
    if (!ctx || !window.Chart) return;
    if (chartInstances.commonIssues) chartInstances.commonIssues.destroy();
    var top7 = commonIssues.slice(0, 7);
    if (top7.length === 0) return;
    var labels = top7.map(function (i) { return truncate(i.description, 40); });
    var values = top7.map(function (i) { return i.pagesAffected; });
    var colors = ['#1A1A1A', '#4A4A4A', '#767676', '#CBB9A6', '#A09080', '#E5E5E5', '#333333'];
    chartInstances.commonIssues = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: labels, datasets: [{ data: values, backgroundColor: colors.slice(0, top7.length), borderWidth: 2, borderColor: '#ffffff' }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { font: { family: 'Inter', size: 11 }, color: '#4A4A4A', boxWidth: 12, padding: 8 } },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var issue = top7[ctx.dataIndex];
                var pages = issue.pagesAffected;
                // Break long text into wrapped lines (~40 chars each)
                var desc = (issue.description || '').toLowerCase();
                var intro = 'Shows up on ' + pages + ' page' + (pages !== 1 ? 's' : '') + ':';
                return [intro].concat(wrapText(desc, 42));
              },
            },
            displayColors: false,
            bodyFont: { family: 'Inter', size: 12 },
            padding: 12,
            backgroundColor: '#1A1A1A',
            bodyColor: '#F7F7F5',
            caretPadding: 6,
          },
        },
      },
    });
  }

  function renderIssuesByDepthChart(issuesByDepth) {
    var ctx = document.getElementById('chart-issues-depth');
    if (!ctx || !window.Chart) return;
    if (chartInstances.issuesDepth) chartInstances.issuesDepth.destroy();
    var depthLabels = { '0': 'Homepage', '1': 'Top-level pages', '2': 'Inner pages', '3': 'Deep pages' };
    var keys = Object.keys(issuesByDepth).sort();
    if (keys.length === 0) return;
    var labels = keys.map(function (k) { return depthLabels[k] || 'Depth ' + k; });
    var averages = keys.map(function (k) { return issuesByDepth[k].average; });
    // Conversational descriptions for each depth level
    var depthPhrases = {
      '0': 'the homepage',
      '1': 'the main pages people reach in one click',
      '2': 'pages a couple clicks deep',
      '3': 'the deepest pages on the site',
    };

    chartInstances.issuesDepth = new Chart(ctx, {
      type: 'bar',
      data: { labels: labels, datasets: [{ label: 'Avg issues', data: averages, backgroundColor: '#1A1A1A', borderRadius: 4, barThickness: 24 }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: function () { return ''; },
              label: function (ctx) {
                var key = keys[ctx.dataIndex];
                var avg = ctx.parsed.x;
                var phrase = depthPhrases[key] || ('pages at depth ' + key);
                var count = issuesByDepth[key] ? issuesByDepth[key].pageCount : 0;
                // Return as array of short lines so Chart.js wraps cleanly
                return [
                  'On average, ' + phrase +
                  ' have about ' + avg + ' issue' + (avg !== 1 ? 's' : '') + ' each',
                  '(' + count + ' page' + (count !== 1 ? 's' : '') + ' scanned)',
                ];
              },
            },
            displayColors: false,
            bodyFont: { family: 'Inter', size: 12 },
            padding: 12,
            backgroundColor: '#1A1A1A',
            titleColor: '#F7F7F5',
            bodyColor: '#F7F7F5',
            caretPadding: 6,
          },
        },
        scales: { x: { beginAtZero: true, title: { display: true, text: 'Avg issues per page', font: { family: 'Inter', size: 11 }, color: '#4A4A4A' }, ticks: { font: { family: 'Inter', size: 11 }, color: '#4A4A4A' }, grid: { color: '#E5E5E5' } }, y: { ticks: { font: { family: 'Inter', size: 12 }, color: '#1A1A1A' }, grid: { display: false } } },
      },
    });
  }

  // ─── Disability Category Drill-Down ───────────────────────
  function initDisabilityDrillDown(issues, commonIssues) {
    // Map issues to disability categories with full detail
    var categoryMap = { visual: [], auditory: [], motor: [], cognitive: [] };

    // Group by rule ID per category (deduplicated), but keep all instances for detail
    var rulesByCategory = { visual: {}, auditory: {}, motor: {}, cognitive: {} };

    issues.forEach(function (issue) {
      var cats = issue.disabilityCategories || [];
      cats.forEach(function (cat) {
        if (!rulesByCategory[cat]) return;
        if (!rulesByCategory[cat][issue.id]) {
          rulesByCategory[cat][issue.id] = {
            id: issue.id,
            description: issue.plainDescription,
            howToFix: issue.howToFix,
            impact: issue.impact,
            wcagLevel: issue.wcagLevel,
            instances: [],
          };
        }
        rulesByCategory[cat][issue.id].instances.push({
          pageUrl: issue.pageUrl,
          cssSelector: issue.cssSelector,
          htmlSnippet: issue.htmlSnippet,
        });
      });
    });

    // Convert to arrays
    for (var cat in rulesByCategory) {
      categoryMap[cat] = Object.values(rulesByCategory[cat]);
    }

    // Attach click handlers to disability cards
    var cards = document.querySelectorAll('.overview-disability-card');
    var container = document.querySelector('.overview-disabilities');
    var currentExpanded = null;

    cards.forEach(function (card) {
      card.addEventListener('click', function () {
        var category = card.getAttribute('data-category');
        var rulesForCat = categoryMap[category] || [];

        // Remove existing detail panel (it's a sibling after the grid)
        var existing = container.parentNode.querySelector('.overview-disability-detail');
        if (existing) existing.remove();
        cards.forEach(function (c) { c.classList.remove('overview-disability-card--expanded'); });

        if (currentExpanded === category) { currentExpanded = null; return; }
        currentExpanded = category;
        card.classList.add('overview-disability-card--expanded');

        if (rulesForCat.length === 0) return;

        var panel = document.createElement('div');
        panel.className = 'overview-disability-detail';

        var categoryNames = { visual: 'Visual', auditory: 'Auditory', motor: 'Motor', cognitive: 'Cognitive' };
        var html = '<h4 class="overview-disability-detail__title">' + categoryNames[category] + ' — Issues causing non-compliance</h4>';
        html += '<ul class="overview-disability-detail__list">';

        rulesForCat.forEach(function (rule) {
          html += '<li class="overview-disability-detail__item">';
          html += '<div class="overview-disability-detail__item-header">';
          html += '<span class="overview-disability-detail__severity overview-disability-detail__severity--' + rule.impact + '">' + rule.impact + '</span>';
          html += '<span class="overview-disability-detail__text">' + escHtml(rule.description) + '</span>';
          html += '<span class="overview-disability-detail__pages">' + rule.instances.length + ' page' + (rule.instances.length !== 1 ? 's' : '') + '</span>';
          html += '</div>';
          // Show fix instruction
          html += '<div class="overview-disability-detail__fix"><strong>Fix:</strong> ' + escHtml(rule.howToFix) + '</div>';
          // Show first 3 specific locations
          html += '<div class="overview-disability-detail__locations">';
          rule.instances.slice(0, 3).forEach(function (inst) {
            html += '<div class="overview-disability-detail__location">';
            if (inst.pageUrl) html += '<span class="overview-disability-detail__page-url">' + escHtml(truncateUrl(inst.pageUrl)) + '</span>';
            if (inst.cssSelector) html += '<code class="overview-disability-detail__selector">' + escHtml(inst.cssSelector) + '</code>';
            html += '</div>';
          });
          if (rule.instances.length > 3) {
            html += '<span class="overview-disability-detail__more">+ ' + (rule.instances.length - 3) + ' more locations</span>';
          }
          html += '</div>';
          html += '</li>';
        });

        html += '</ul>';
        panel.innerHTML = html;
        // Insert AFTER the entire grid row, not between cards
        container.after(panel);
      });
    });
  }

  function loadScoreHistory(url) {
    var domain;
    try { domain = new URL(url).hostname; } catch (e) { return; }
    fetch('/scanner/api/scans/history/' + encodeURIComponent(domain))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.success && data.history && data.history.length > 1) {
          renderScoreTimeChart(data.history);
          renderLevelsTimeChart(data.history);
        } else {
          var s = document.getElementById('sparkline-empty');
          var t = document.getElementById('timeline-empty');
          if (s) s.hidden = false;
          if (t) t.hidden = false;
        }
      })
      .catch(function () {});
  }

  function renderScoreTimeChart(history) {
    var ctx = document.getElementById('chart-score-time');
    if (!ctx || !window.Chart) return;
    if (chartInstances.scoreTime) chartInstances.scoreTime.destroy();
    var s = document.getElementById('sparkline-empty'); if (s) s.hidden = true;
    var labels = history.map(function (h) { return formatShortDate(h.created_at); });
    var scores = history.map(function (h) { return h.accessibility_score || 0; });
    chartInstances.scoreTime = new Chart(ctx, {
      type: 'line',
      data: { labels: labels, datasets: [{ label: 'Score', data: scores, borderColor: '#1A1A1A', backgroundColor: 'rgba(26,26,26,0.05)', fill: true, tension: 0.3, pointRadius: 3, pointBackgroundColor: '#1A1A1A', borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100, ticks: { font: { family: 'Inter', size: 10 }, color: '#4A4A4A' }, grid: { color: '#E5E5E5' } }, x: { ticks: { font: { family: 'Inter', size: 10 }, color: '#4A4A4A' }, grid: { display: false } } } },
    });
  }

  function renderLevelsTimeChart(history) {
    var ctx = document.getElementById('chart-levels-time');
    if (!ctx || !window.Chart) return;
    if (chartInstances.levelsTime) chartInstances.levelsTime.destroy();
    var t = document.getElementById('timeline-empty'); if (t) t.hidden = true;
    var labels = history.map(function (h) { return formatShortDate(h.created_at); });
    var accessScores = history.map(function (h) { return h.accessibility_score || 0; });
    var aeoScores = history.map(function (h) { return h.aeo_score || 0; });
    chartInstances.levelsTime = new Chart(ctx, {
      type: 'line',
      data: { labels: labels, datasets: [{ label: 'Accessibility', data: accessScores, borderColor: '#1A1A1A', tension: 0.3, pointRadius: 3, borderWidth: 2 }, { label: 'AEO', data: aeoScores, borderColor: '#CBB9A6', tension: 0.3, pointRadius: 3, borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 11 }, color: '#4A4A4A', boxWidth: 12 } } }, scales: { y: { min: 0, max: 100, ticks: { font: { family: 'Inter', size: 10 }, color: '#4A4A4A' }, grid: { color: '#E5E5E5' } }, x: { ticks: { font: { family: 'Inter', size: 10 }, color: '#4A4A4A' }, grid: { display: false } } } },
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // ISSUES TAB
  // ═══════════════════════════════════════════════════════════════

  var allIssues = [];

  function renderIssuesTab(data) {
    setText('sum-total', data.summary.totalIssues);
    setText('sum-critical', data.summary.critical);
    setText('sum-serious', data.summary.serious);
    setText('sum-moderate', data.summary.moderate);
    setText('sum-minor', data.summary.minor);
    setText('sum-aeo-grade', data.aeo ? data.aeo.grade : '—');
    var aeoScoreEl = document.getElementById('sum-aeo-score');
    if (aeoScoreEl) aeoScoreEl.textContent = data.aeo ? data.aeo.score + '/' + data.aeo.maxScore : '';

    allIssues = data.issues || [];
    filterIssues('all');

    document.querySelectorAll('.dash-filter__btn').forEach(function (btn) {
      btn.onclick = function () {
        document.querySelectorAll('.dash-filter__btn').forEach(function (b) { b.classList.remove('dash-filter__btn--active'); });
        btn.classList.add('dash-filter__btn--active');
        filterIssues(btn.getAttribute('data-filter'));
      };
    });
  }

  function filterIssues(category) {
    var issuesList = document.getElementById('dash-issues-list');
    if (!issuesList) return;
    issuesList.innerHTML = '';
    var filtered = category === 'all' ? allIssues : allIssues.filter(function (i) { return i.category === category; });
    if (filtered.length === 0) { issuesList.innerHTML = '<p style="color:var(--color-text-muted);font-size:var(--text-sm);padding:var(--space-4);">No issues in this category.</p>'; return; }

    // Group by rule ID
    var ruleGroups = {};
    filtered.forEach(function (issue) {
      if (!ruleGroups[issue.id]) {
        ruleGroups[issue.id] = {
          id: issue.id,
          impact: issue.impact,
          category: issue.category,
          plainDescription: issue.plainDescription,
          howToFix: issue.howToFix,
          wcagLevel: issue.wcagLevel,
          helpUrl: issue.helpUrl,
          pages: [],
        };
      }
      ruleGroups[issue.id].pages.push({
        pageUrl: issue.pageUrl,
        cssSelector: issue.cssSelector,
        htmlSnippet: issue.htmlSnippet,
        instanceCount: issue.instanceCount,
        nodes: issue.nodes,
      });
    });

    // Convert to array and sort: by severity, then by pages affected
    var severityOrder = { critical: 0, serious: 1, moderate: 2, minor: 3 };
    var grouped = Object.values(ruleGroups).sort(function (a, b) {
      var sev = (severityOrder[a.impact] || 3) - (severityOrder[b.impact] || 3);
      if (sev !== 0) return sev;
      return b.pages.length - a.pages.length;
    });

    // Render grouped cards
    grouped.forEach(function (rule) {
      var card = document.createElement('div');
      card.className = 'dash-issue dash-issue--' + rule.impact;
      card.setAttribute('role', 'listitem');

      var totalInstances = rule.pages.reduce(function (sum, p) { return sum + (p.instanceCount || 1); }, 0);

      // Build affected pages HTML (collapsible)
      var pagesHtml = '<details class="dash-issue__pages-detail"><summary class="dash-issue__pages-toggle">Affected pages (' + rule.pages.length + ')</summary><div class="dash-issue__pages-list">';
      rule.pages.forEach(function (p) {
        pagesHtml += '<div class="dash-issue__page-entry">';
        if (p.pageUrl) pagesHtml += '<span class="dash-issue__page-url">' + escHtml(truncateUrl(p.pageUrl)) + '</span>';
        if (p.cssSelector) pagesHtml += '<code class="dash-issue__page-selector">' + escHtml(p.cssSelector) + '</code>';
        if (p.instanceCount > 1) pagesHtml += '<span class="dash-issue__page-instances">' + p.instanceCount + ' instances</span>';
        pagesHtml += '</div>';
      });
      pagesHtml += '</div></details>';

      // Build snippet from first occurrence
      var snippetHtml = '';
      var firstWithSnippet = rule.pages.find(function (p) { return p.nodes && p.nodes.length > 0 && p.nodes[0].html; });
      if (firstWithSnippet) {
        snippetHtml = '<details class="dash-issue__code-detail"><summary class="dash-issue__code-toggle">View code sample</summary><div class="dash-issue__snippet">' + escHtml(firstWithSnippet.nodes[0].html) + '</div></details>';
      }

      card.innerHTML =
        '<div class="dash-issue__top">' +
          '<span class="dash-issue__severity dash-issue__severity--' + rule.impact + '">' + rule.impact + '</span>' +
          '<span class="dash-issue__category">' + (rule.category === 'content' ? 'Content' : 'Technical') + '</span>' +
          '<span class="dash-issue__rule-id"><code>' + escHtml(rule.id) + '</code></span>' +
          '<span class="dash-issue__count">' + rule.pages.length + ' page' + (rule.pages.length !== 1 ? 's' : '') + ' · ' + totalInstances + ' instance' + (totalInstances !== 1 ? 's' : '') + '</span>' +
        '</div>' +
        '<div class="dash-issue__title">' + escHtml(rule.plainDescription) + '</div>' +
        '<div class="dash-issue__fix"><strong>How to fix: </strong>' + escHtml(rule.howToFix) + '</div>' +
        '<div class="dash-issue__meta">' +
          '<span class="dash-issue__wcag">WCAG ' + escHtml(rule.wcagLevel) + '</span>' +
          (rule.helpUrl ? '<a href="' + escHtml(rule.helpUrl) + '" target="_blank" rel="noopener" class="dash-issue__docs-link">WCAG docs →</a>' : '') +
        '</div>' +
        pagesHtml +
        snippetHtml +
        '<div class="dash-issue__actions">' +
          '<button class="btn btn--secondary btn--sm dash-issue__verify-btn" data-rule="' + escHtml(rule.id) + '" data-url="' + escHtml(rule.pages[0].pageUrl || '') + '">Verify Fix</button>' +
          '<button class="btn btn--secondary btn--sm dash-issue__fix-btn" data-rule="' + escHtml(rule.id) + '" data-idx="' + grouped.indexOf(rule) + '">Fix This</button>' +
        '</div>';

      issuesList.appendChild(card);
    });

    // Attach verify-fix handlers
    issuesList.querySelectorAll('.dash-issue__verify-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var ruleId = btn.getAttribute('data-rule');
        var pageUrl = btn.getAttribute('data-url');
        if (!pageUrl) { btn.textContent = 'No page URL'; return; }

        btn.disabled = true;
        btn.textContent = 'Checking...';

        fetch('/scanner/api/verify-fix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: pageUrl, ruleId: ruleId }),
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            btn.disabled = false;
            if (data.success && data.passed) {
              btn.textContent = 'Fixed ✓';
              btn.classList.add('dash-issue__verify-btn--passed');
            } else if (data.success) {
              btn.textContent = 'Still failing (' + data.instances + ')';
              btn.classList.add('dash-issue__verify-btn--failed');
            } else {
              btn.textContent = 'Error';
            }
            setTimeout(function () {
              btn.textContent = 'Verify Fix';
              btn.classList.remove('dash-issue__verify-btn--passed', 'dash-issue__verify-btn--failed');
            }, 4000);
          })
          .catch(function () {
            btn.disabled = false;
            btn.textContent = 'Error';
            setTimeout(function () { btn.textContent = 'Verify Fix'; }, 3000);
          });
      });
    });

    // Fix This button handlers — open fixer page pre-loaded
    issuesList.querySelectorAll('.dash-issue__fix-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var ruleId = btn.getAttribute('data-rule');
        var idx = parseInt(btn.getAttribute('data-idx'));
        var htmlSnippet = '';

        // Get HTML from the grouped rules array
        if (grouped[idx] && grouped[idx].pages[0]) {
          var firstPage = grouped[idx].pages[0];
          if (firstPage.nodes && firstPage.nodes[0] && firstPage.nodes[0].html) {
            htmlSnippet = firstPage.nodes[0].html;
          } else if (firstPage.htmlSnippet) {
            htmlSnippet = firstPage.htmlSnippet;
          }
        }

        var params = '?rule=' + encodeURIComponent(ruleId);
        if (htmlSnippet) params += '&html=' + encodeURIComponent(htmlSnippet);
        params += '&auto=1';
        window.open('/scanner/fixer' + params, '_blank');
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // AEO TAB
  // ═══════════════════════════════════════════════════════════════

  function renderAeoTab(data) {
    var summaryEl = document.getElementById('dash-aeo-summary');
    var findingsEl = document.getElementById('dash-aeo-findings');
    var aeo = data.aeo;
    if (!aeo) { if (summaryEl) summaryEl.innerHTML = '<p style="color:var(--color-text-muted);">AEO data unavailable.</p>'; return; }
    if (summaryEl) summaryEl.innerHTML = '<span class="dash-aeo-summary__grade">' + escHtml(aeo.grade) + '</span><span class="dash-aeo-summary__score">' + aeo.score + ' / ' + aeo.maxScore + ' points</span>';
    if (findingsEl) {
      findingsEl.innerHTML = '';
      aeo.findings.forEach(function (f) {
        var li = document.createElement('li');
        var icon = f.status === 'pass' ? '✓' : f.status === 'warn' ? '⚠' : '✗';
        li.innerHTML = '<span class="icon-' + f.status + '" aria-hidden="true">' + icon + '</span><span>' + escHtml(f.text) + '</span>';
        findingsEl.appendChild(li);
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // QUOTE TAB
  // ═══════════════════════════════════════════════════════════════

  function renderQuoteTab(data) {
    var el = document.getElementById('dash-quote-content');
    var quote = data.quote;
    if (!el) return;
    if (!quote || !quote.tiers || !quote.recommendedTier) { el.innerHTML = '<p style="color:var(--color-text-muted);">Quote could not be generated. Run a new scan to generate a fresh quote.</p>'; return; }
    var rec = quote.tiers[quote.recommendedTier];
    el.innerHTML =
      '<p class="dash-quote__recommendation">Recommended: <strong>' + escHtml(rec.name) + '</strong></p>' +
      '<div class="dash-quote__tiers">' + tierCard(quote.tiers.tier1, 'tier1', quote.recommendedTier) + tierCard(quote.tiers.tier2, 'tier2', quote.recommendedTier) + tierCard(quote.tiers.tier3, 'tier3', quote.recommendedTier) + '</div>' +
      '<p class="dash-quote__scope"><strong>Scope:</strong> ' + escHtml(quote.scopeSummary) + '</p>' +
      '<p class="dash-quote__scope"><strong>Rationale:</strong> ' + escHtml(quote.rationale) + '</p>' +
      '<div class="dash-quote__actions"><button class="btn btn--primary btn--sm" id="btn-copy-quote">Copy Quote</button><button class="btn btn--secondary btn--sm" id="btn-export-quote">Export Proposal</button></div>';

    document.getElementById('btn-copy-quote').addEventListener('click', function () {
      var text = 'Simply Black and White — Project Quote\n═══════════════════════════════════════\n\nRecommended: ' + rec.name + '\n\nTier 1 — ' + quote.tiers.tier1.name + ': $' + quote.tiers.tier1.calculatedMin + '–$' + quote.tiers.tier1.calculatedMax + '\nTier 2 — ' + quote.tiers.tier2.name + ': $' + quote.tiers.tier2.calculatedMin + '–$' + quote.tiers.tier2.calculatedMax + '\nTier 3 — ' + quote.tiers.tier3.name + ': $' + quote.tiers.tier3.calculatedMin + '–$' + quote.tiers.tier3.calculatedMax + '/mo\n\nScope: ' + quote.scopeSummary + '\n\nRationale: ' + quote.rationale + '\n\n— Simply Black and White\nsimplyblackandwhite.com';
      navigator.clipboard.writeText(text).then(function () { var b = document.getElementById('btn-copy-quote'); b.textContent = 'Copied!'; setTimeout(function () { b.textContent = 'Copy Quote'; }, 2000); });
    });
    document.getElementById('btn-export-quote').addEventListener('click', function () { if (currentScanData && currentScanData.scanId) window.open('/scanner/quote/' + currentScanData.scanId, '_blank'); });
  }

  function tierCard(tier, key, rec) {
    var isRec = key === rec;
    var price = tier.type === 'monthly-retainer' ? '$' + tier.calculatedMin + '–$' + tier.calculatedMax + '/mo' : '$' + tier.calculatedMin + '–$' + tier.calculatedMax;
    return '<div class="dash-quote__tier' + (isRec ? ' dash-quote__tier--recommended' : '') + '"><div class="dash-quote__tier-name">' + escHtml(tier.name) + '</div><div class="dash-quote__tier-price">' + price + '</div></div>';
  }

  // ═══════════════════════════════════════════════════════════════
  // PAGES TAB
  // ═══════════════════════════════════════════════════════════════

  function renderPagesTab(data) {
    var tbody = document.getElementById('dash-pages-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!data.pages || data.pages.length === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--color-text-muted);padding:var(--space-8);">No per-page data available.</td></tr>'; return; }
    var depthLabels = { 0: 'Homepage', 1: 'Top-level', 2: 'Inner', 3: 'Deep' };
    data.pages.forEach(function (p) {
      var tr = document.createElement('tr');
      var label = depthLabels[p.depth] || 'Depth ' + p.depth;
      if (p.error) tr.innerHTML = '<td><span class="dash-pages-table__url" title="' + escHtml(p.url) + '">' + escHtml(truncateUrl(p.url)) + '</span></td><td><span class="dash-pages-table__depth-badge">' + label + '</span></td><td><span class="dash-pages-table__error">Failed</span></td><td>—</td>';
      else tr.innerHTML = '<td><span class="dash-pages-table__url" title="' + escHtml(p.url) + '">' + escHtml(truncateUrl(p.url)) + '</span></td><td><span class="dash-pages-table__depth-badge">' + label + '</span></td><td>' + (p.issueCount || 0) + '</td><td>' + (p.aeoScore !== null ? p.aeoScore : '—') + '</td>';
      tbody.appendChild(tr);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // EXPORTS
  // ═══════════════════════════════════════════════════════════════

  function attachExportHandlers() {
    var r = document.getElementById('btn-client-report');
    var c = document.getElementById('btn-csv-export');
    var w = document.getElementById('btn-workbook-export');
    var rescan = document.getElementById('btn-rescan');
    if (r) r.onclick = function () { if (currentScanData && currentScanData.scanId) window.open('/scanner/report/' + currentScanData.scanId, '_blank'); };
    if (c) c.onclick = function () { if (currentScanData && currentScanData.scanId) window.location.href = '/scanner/api/scans/' + currentScanData.scanId + '/csv'; };
    if (w) w.onclick = function () { if (currentScanData && currentScanData.scanId) window.open('/scanner/workbook/' + currentScanData.scanId, '_blank'); };
    if (rescan) rescan.onclick = function () {
      if (!currentScanData || !currentScanData.url) return;
      // Pre-fill the scan input and trigger a new scan
      urlInput.value = currentScanData.url;
      startScan();
      // Scroll to progress
      document.querySelector('.dash-scan-input').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════

  function escHtml(str) { var d = document.createElement('div'); d.appendChild(document.createTextNode(str || '')); return d.innerHTML; }
  function setText(id, value) { var el = document.getElementById(id); if (el) el.textContent = value; }
  function formatDate(iso) { if (!iso) return ''; var d = new Date(iso); return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  function formatShortDate(str) { if (!str) return ''; var d = new Date(str); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  function truncate(str, len) { if (!str) return ''; return str.length > len ? str.substring(0, len) + '...' : str; }
  function truncateUrl(url) { if (!url) return ''; try { var p = new URL(url); var path = p.pathname; if (path.length > 40) path = path.substring(0, 37) + '...'; return p.hostname + path; } catch (e) { return url.length > 50 ? url.substring(0, 47) + '...' : url; } }
  function wrapText(str, maxLen) {
    if (!str) return [];
    var words = str.split(' ');
    var lines = [];
    var current = '';
    words.forEach(function (w) {
      if ((current + ' ' + w).trim().length > maxLen) {
        if (current) lines.push(current.trim());
        current = w;
      } else {
        current += ' ' + w;
      }
    });
    if (current.trim()) lines.push(current.trim());
    return lines;
  }

})();
