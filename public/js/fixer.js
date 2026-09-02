/**
 * Accessibility Fixer — Frontend
 * Simply Black and White — Phase 12
 */
(function () {
  'use strict';

  var inputEl = document.getElementById('fixer-input');
  var ruleSelect = document.getElementById('fixer-rule');
  var submitBtn = document.getElementById('fixer-submit');
  var clearBtn = document.getElementById('fixer-clear');
  var outputPanel = document.getElementById('fixer-output-panel');
  var outputCode = document.getElementById('fixer-output-code');
  var explanationText = document.getElementById('fixer-explanation-text');
  var metaEl = document.getElementById('fixer-meta');
  var copyBtn = document.getElementById('fixer-copy');
  var loadingEl = document.getElementById('fixer-loading');
  var errorEl = document.getElementById('fixer-error');

  if (!inputEl || !submitBtn) return;

  // URL params (for pre-loading from "Fix This" button)
  var params = new URLSearchParams(window.location.search);

  // ─── Submit Handler ──────────────────────────────────────────
  submitBtn.addEventListener('click', function () {
    var html = inputEl.value.trim();
    if (!html) {
      showError('Please paste some HTML code to fix.');
      inputEl.focus();
      return;
    }

    var ruleId = ruleSelect.value;
    // Fallback: if rule was passed via URL but not in dropdown, still use it
    if (!ruleId && params.get('rule')) {
      ruleId = params.get('rule');
    }
    clearError();
    setLoading(true);

    fetch('/scanner/api/fixer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: html, ruleId: ruleId }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        setLoading(false);
        if (!data.success) {
          showError(data.error || 'Something went wrong.');
          return;
        }
        renderOutput(data);
      })
      .catch(function () {
        setLoading(false);
        showError('Network error. Please try again.');
      });
  });

  // ─── Clear Button ────────────────────────────────────────────
  clearBtn.addEventListener('click', function () {
    inputEl.value = '';
    ruleSelect.value = '';
    outputPanel.hidden = true;
    clearError();
    inputEl.focus();
  });

  // ─── Copy Button ─────────────────────────────────────────────
  copyBtn.addEventListener('click', function () {
    var code = outputCode.textContent;
    navigator.clipboard.writeText(code).then(function () {
      copyBtn.textContent = 'Copied!';
      setTimeout(function () { copyBtn.textContent = 'Copy Code'; }, 2000);
    });
  });

  // ─── Keyboard shortcut: Ctrl/Cmd + Enter to submit ───────────
  inputEl.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      submitBtn.click();
    }
  });

  // ─── Render Output ───────────────────────────────────────────
  function renderOutput(data) {
    outputPanel.hidden = false;

    // Fixed code
    outputCode.textContent = data.fixed || '';

    // Explanation
    var expHtml = '<ul>';
    if (data.changes && data.changes.length > 0) {
      data.changes.forEach(function (change) {
        expHtml += '<li>' + escHtml(change) + '</li>';
      });
    }
    expHtml += '</ul>';

    // If there are multiple rule explanations (auto-detect mode)
    if (data.explanations && data.explanations.length > 0) {
      expHtml += '<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--color-stone);">';
      data.explanations.forEach(function (exp) {
        expHtml += '<p style="margin-bottom: 8px;"><strong>' + escHtml(exp.name) + ':</strong> ' + escHtml(exp.explanation) + '</p>';
      });
      expHtml += '</div>';
    } else if (data.explanation) {
      expHtml += '<p style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--color-stone);">' + escHtml(data.explanation) + '</p>';
    }

    explanationText.innerHTML = expHtml;

    // Meta info
    var meta = [];
    if (data.method) meta.push('Method: ' + data.method);
    if (data.rule) meta.push('Rule: ' + data.rule);
    if (data.ruleName) meta.push('(' + data.ruleName + ')');
    if (data.rulesApplied) meta.push(data.rulesApplied + ' rules applied');
    metaEl.textContent = meta.join(' · ');

    // Scroll to output
    outputPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ─── Loading & Error ─────────────────────────────────────────
  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    loadingEl.hidden = !isLoading;
    if (isLoading) outputPanel.hidden = true;
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  function clearError() {
    errorEl.textContent = '';
    errorEl.hidden = true;
  }

  function escHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
  }

  // ─── Pre-load from URL params (for "Fix This" integration) ───
  if (params.get('html')) {
    inputEl.value = decodeURIComponent(params.get('html'));
  }
  if (params.get('rule')) {
    ruleSelect.value = params.get('rule');
  }
  if (params.get('auto') === '1' && inputEl.value) {
    // Auto-submit if pre-loaded with data
    setTimeout(function () { submitBtn.click(); }, 300);
  }

})();
