/**
 * Light Scan — Frontend Handler
 * Simply Black and White — Phase 4
 *
 * Handles the homepage scan form submission, displays results,
 * manages loading/error states accessibly, and persists results
 * in sessionStorage so they survive page navigation.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'sbw_scan_result';

  // ─── DOM Elements ────────────────────────────────────────────
  var form = document.getElementById('scan-form');
  var urlInput = document.getElementById('scan-url');
  var submitBtn = document.getElementById('scan-submit');
  var btnText = submitBtn ? submitBtn.querySelector('.scan-form__btn-text') : null;
  var btnLoading = submitBtn ? submitBtn.querySelector('.scan-form__btn-loading') : null;
  var errorPanel = document.getElementById('scan-error');
  var resultsPanel = document.getElementById('scan-results');
  var resultsUrl = document.getElementById('scan-results-url');
  var humanRisksList = document.getElementById('human-risks');
  var technicalRisksList = document.getElementById('technical-risks');
  var aeoSnapshot = document.getElementById('aeo-snapshot');
  var progressPanel = document.getElementById('scan-progress');
  var progressFill = document.getElementById('scan-progress-fill');
  var progressStatus = document.getElementById('scan-progress-status');

  if (!form || !urlInput || !submitBtn) return;

  // ─── State Management ────────────────────────────────────────
  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    urlInput.disabled = isLoading;

    if (btnText) btnText.hidden = isLoading;
    if (btnLoading) {
      btnLoading.hidden = !isLoading;
      btnLoading.setAttribute('aria-hidden', String(!isLoading));
    }

    if (isLoading) {
      submitBtn.setAttribute('aria-busy', 'true');
    } else {
      submitBtn.removeAttribute('aria-busy');
    }
  }

  function showError(message, isSoft) {
    if (!errorPanel) return;

    // Soft errors (site blocked etc.) get a gentler treatment
    if (isSoft) {
      errorPanel.className = 'scan-form__error scan-form__error--soft';
    } else {
      errorPanel.className = 'scan-form__error';
    }

    // Link "free consultation" to the contact form
    var linkedMessage = message.replace(
      /free consultation/gi,
      '<a href="#contact" class="scan-form__error-link">free consultation</a>'
    );
    errorPanel.innerHTML = linkedMessage;
    errorPanel.hidden = false;
    resultsPanel.hidden = true;
  }

  function clearError() {
    if (!errorPanel) return;
    errorPanel.textContent = '';
    errorPanel.hidden = true;
  }

  // ─── Progress Bar ────────────────────────────────────────────
  var progressInterval = null;
  var progressMessages = [
    'Knocking on your website\'s front door...',
    'It answered. Loading everything the browser sees...',
    'Waiting for all the JavaScript to finish its coffee...',
    'Running the accessibility checklist — no judgment, promise.',
    'Squinting at your color contrast like a designer at 2am...',
    'Checking if your headings make sense to a screen reader...',
    'Looking for semantic landmarks — the GPS of your code...',
    'Making sure your images have descriptions for everyone...',
    'Asking the AI search bots what they think of your structure...',
    'Wrapping it up — your honest findings are almost ready.',
  ];

  function showProgress() {
    if (!progressPanel) return;
    progressPanel.hidden = false;
    if (progressFill) progressFill.style.width = '0%';
    if (progressStatus) progressStatus.textContent = progressMessages[0];

    var step = 0;
    var maxSteps = progressMessages.length;

    progressInterval = setInterval(function () {
      step++;
      if (step >= maxSteps) {
        clearInterval(progressInterval);
        return;
      }
      var pct = Math.min(Math.round((step / maxSteps) * 90), 90);
      if (progressFill) progressFill.style.width = pct + '%';
      if (progressStatus) progressStatus.textContent = progressMessages[step];
    }, 4000);
  }

  function hideProgress() {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    if (progressFill) progressFill.style.width = '100%';
    if (progressStatus) progressStatus.textContent = 'Done!';
    setTimeout(function () {
      if (progressPanel) progressPanel.hidden = true;
      if (progressFill) progressFill.style.width = '0%';
    }, 800);
  }

  function showResults(data, animate) {
    if (!resultsPanel) return;

    // URL display
    if (resultsUrl) {
      resultsUrl.textContent = data.url;
    }

    // Human risks
    if (humanRisksList) {
      humanRisksList.innerHTML = '';
      data.summary.humanRisks.forEach(function (risk) {
        var li = document.createElement('li');
        li.textContent = risk;
        humanRisksList.appendChild(li);
      });
    }

    // Technical risks
    if (technicalRisksList) {
      technicalRisksList.innerHTML = '';
      data.summary.technicalRisks.forEach(function (risk) {
        var li = document.createElement('li');
        li.textContent = risk;
        technicalRisksList.appendChild(li);
      });
    }

    // AEO snapshot
    if (aeoSnapshot && data.aeo) {
      var scoreHtml = '<div class="aeo-score">';
      scoreHtml += '<span class="aeo-score__grade">' + data.aeo.grade + '</span>';
      scoreHtml += '<span class="aeo-score__value">' + data.aeo.score + '/' + data.aeo.maxScore + '</span>';
      scoreHtml += '<span class="aeo-score__label">AEO Health Score</span>';
      scoreHtml += '</div>';

      var findingsHtml = '<ul class="aeo-findings" role="list">';
      data.aeo.findings.forEach(function (finding, i) {
        var icon = finding.status === 'pass' ? '✓' : finding.status === 'warn' ? '⚠' : '✗';
        var cls = 'aeo-finding aeo-finding--' + finding.status;
        findingsHtml += '<li class="' + cls + '" style="animation-delay:' + (i * 0.1) + 's">';
        findingsHtml += '<span class="aeo-finding__icon" aria-hidden="true">' + icon + '</span>';
        findingsHtml += '<span>' + finding.text + '</span>';
        findingsHtml += '</li>';
      });
      findingsHtml += '</ul>';

      // Gated findings teaser
      if (data.aeo.gatedCount > 0) {
        findingsHtml += '<p class="aeo-gated">';
        findingsHtml += '+ ' + data.aeo.gatedCount + ' more finding' + (data.aeo.gatedCount > 1 ? 's' : '') + ' available in the full report.';
        findingsHtml += '</p>';
      }

      aeoSnapshot.innerHTML = scoreHtml + findingsHtml;
    }

    // Show panel
    resultsPanel.hidden = false;
    errorPanel.hidden = true;

    // Only scroll and animate on fresh scans, not session restores
    if (animate) {
      resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ─── Session Persistence ─────────────────────────────────────
  function saveToSession(data) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // Storage full or unavailable — not critical
    }
  }

  function loadFromSession() {
    try {
      var stored = sessionStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // Not critical
    }
  }

  // ─── Restore previous results on page load ──────────────────
  var previousResult = loadFromSession();
  if (previousResult) {
    showResults(previousResult, false);
    // Pre-fill the URL input so user sees what was scanned
    if (previousResult.url) {
      urlInput.value = previousResult.url;
    }
  }

  // ─── Form Submission ─────────────────────────────────────────
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearError();

    var rawUrl = urlInput.value.trim();

    // Basic client-side validation
    if (!rawUrl) {
      showError('Please enter a website URL.', false);
      urlInput.focus();
      return;
    }

    // Ensure protocol
    var urlToSend = rawUrl;
    if (!/^https?:\/\//i.test(urlToSend)) {
      urlToSend = 'https://' + urlToSend;
    }

    setLoading(true);
    showProgress();
    resultsPanel.hidden = true;

    fetch('/api/scan/light', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: urlToSend }),
    })
      .then(function (response) {
        return response.json().then(function (data) {
          return { status: response.status, data: data };
        });
      })
      .then(function (result) {
        setLoading(false);
        hideProgress();

        if (result.status !== 200 || !result.data.success) {
          var msg = result.data.error || 'Something went wrong. Please try again.';
          // Determine if this is a "soft" error (site blocked, timeout) vs validation error
          var isSoft = msg.includes('consultation') || msg.includes('hiccup');
          showError(msg, isSoft);

          // Clear any previous stored results for this failed scan
          clearSession();
          return;
        }

        showResults(result.data, true);
        saveToSession(result.data);
      })
      .catch(function () {
        setLoading(false);
        hideProgress();
        showError('Network error — please check your connection and try again.', false);
      });
  });

  // ─── Email Capture (post-scan) ───────────────────────────────
  var emailForm = document.getElementById('scan-email-form');
  var emailInput = document.getElementById('scan-email-input');
  var emailBtn = document.getElementById('scan-email-btn');
  var emailSuccess = document.getElementById('scan-email-success');
  var emailCapture = document.getElementById('scan-email-capture');

  if (emailForm) {
    emailForm.addEventListener('submit', function (e) {
      e.preventDefault();

      var email = emailInput.value.trim();
      if (!email || !email.includes('@') || !email.includes('.')) {
        emailInput.setCustomValidity('Please enter a valid email address.');
        emailInput.reportValidity();
        return;
      }
      emailInput.setCustomValidity('');

      // Get current scan data from session
      var scanData = loadFromSession();
      if (!scanData || !scanData.scanId) {
        // No scan to associate — still capture the email
      }

      emailBtn.disabled = true;
      emailBtn.textContent = 'Sending...';

      fetch('/api/scan/capture-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          scanId: scanData ? scanData.scanId : null,
          url: scanData ? scanData.url : null,
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.success) {
            emailForm.hidden = true;
            emailSuccess.hidden = false;
            var noteEl = emailCapture.querySelector('.scan-email-capture__note');
            if (noteEl) noteEl.hidden = true;
          } else {
            emailBtn.disabled = false;
            emailBtn.textContent = 'Send My Report';
            emailInput.setCustomValidity(data.error || 'Something went wrong.');
            emailInput.reportValidity();
          }
        })
        .catch(function () {
          emailBtn.disabled = false;
          emailBtn.textContent = 'Send My Report';
        });
    });
  }

})();
