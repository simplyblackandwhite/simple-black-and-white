'use strict';

/**
 * Accessibility Fixer — Rules Engine
 * Simply Black and White — Phase 12
 *
 * Deterministic fixes for the top 20 axe-core violations.
 * Each fix function takes HTML input and returns { fixed, changes }.
 * Falls back to LLM for complex/unknown patterns.
 */

// ─── Rule Fix Registry ───────────────────────────────────────────────────────
const FIXERS = {

  'image-alt': {
    name: 'Missing alt text',
    fix(html) {
      const changes = [];
      // Add alt="" to images without alt attribute
      let fixed = html.replace(/<img\b(?![^>]*\balt\b)([^>]*)>/gi, (match, attrs) => {
        // Try to extract meaningful text from src filename
        const srcMatch = attrs.match(/src=["']([^"']+)["']/i);
        let altSuggestion = '';
        if (srcMatch) {
          const filename = srcMatch[1].split('/').pop().split('.')[0].replace(/[-_]/g, ' ');
          altSuggestion = filename.length > 2 && filename.length < 50 ? filename : '';
        }
        changes.push('Added alt attribute' + (altSuggestion ? ` with suggested text "${altSuggestion}"` : ' (empty — mark as decorative or add description)'));
        return `<img${attrs} alt="${altSuggestion}">`;
      });
      return { fixed, changes };
    },
    explanation: 'Every <img> element needs an alt attribute. For informative images, describe what the image shows. For decorative images, use alt="" (empty string).',
  },

  'link-name': {
    name: 'Link without accessible name',
    fix(html) {
      const changes = [];
      // Add aria-label to links that have no visible text content
      let fixed = html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (match, attrs, inner) => {
        // Check if there's actual text content
        const textContent = inner.replace(/<[^>]+>/g, '').trim();
        if (textContent) return match; // Has text — no fix needed
        if (attrs.includes('aria-label')) return match; // Already has label

        const hrefMatch = attrs.match(/href=["']([^"']+)["']/i);
        const label = hrefMatch ? 'Link to ' + hrefMatch[1].split('/').pop().replace(/[-_]/g, ' ').replace(/\.\w+$/, '') : 'Link purpose';
        changes.push(`Added aria-label="${label}" to link without visible text`);
        return `<a${attrs} aria-label="${label}">${inner}</a>`;
      });
      return { fixed, changes };
    },
    explanation: 'Links must have discernible text that tells screen reader users where the link goes. Use visible text inside the <a> tag, or aria-label for icon/image links.',
  },

  'button-name': {
    name: 'Button without accessible name',
    fix(html) {
      const changes = [];
      let fixed = html.replace(/<button\b([^>]*)>\s*(<(?:img|i|svg|span)[^>]*>)?\s*<\/button>/gi, (match, attrs, inner) => {
        if (attrs.includes('aria-label')) return match;
        changes.push('Added aria-label to button without visible text');
        return `<button${attrs} aria-label="Button action">${inner || ''}</button>`;
      });
      // Also fix div/span used as buttons without role
      fixed = fixed.replace(/<(div|span)\b([^>]*)\bonclick\b([^>]*)>/gi, (match, tag, before, after) => {
        if (before.includes('role=') || after.includes('role=')) return match;
        changes.push(`Converted <${tag} onclick> to proper button element`);
        return `<button${before}${after}>`;
      });
      if (changes.length > 0 && fixed.includes('</div>') && html.includes('onclick')) {
        fixed = fixed.replace(/<\/div>/i, '</button>');
      }
      return { fixed, changes };
    },
    explanation: 'Buttons must have accessible names. Use visible text, aria-label, or aria-labelledby. Interactive elements should use <button>, not <div onclick>.',
  },

  'label': {
    name: 'Form field missing label',
    fix(html) {
      const changes = [];
      // Find inputs without associated labels
      let fixed = html.replace(/<input\b([^>]*)>/gi, (match, attrs) => {
        if (attrs.includes('aria-label') || attrs.includes('aria-labelledby')) return match;
        if (attrs.match(/type=["'](hidden|submit|button|reset)["']/i)) return match;

        const idMatch = attrs.match(/id=["']([^"']+)["']/i);
        const nameMatch = attrs.match(/name=["']([^"']+)["']/i);
        const typeMatch = attrs.match(/type=["']([^"']+)["']/i);
        const placeholderMatch = attrs.match(/placeholder=["']([^"']+)["']/i);

        const labelText = placeholderMatch ? placeholderMatch[1] : nameMatch ? nameMatch[1].replace(/[-_]/g, ' ') : typeMatch ? typeMatch[1] : 'Field';
        const id = idMatch ? idMatch[1] : 'field-' + Math.random().toString(36).substr(2, 6);

        if (!idMatch) {
          attrs += ` id="${id}"`;
        }

        changes.push(`Added label for "${labelText}" input`);
        return `<label for="${id}">${labelText}</label>\n<input${attrs}>`;
      });
      return { fixed, changes };
    },
    explanation: 'Every form input needs an associated <label> element using the for/id pairing. Screen readers announce the label when a user focuses the field.',
  },

  'html-has-lang': {
    name: 'Missing lang attribute',
    fix(html) {
      const changes = [];
      let fixed = html.replace(/<html\b([^>]*)>/i, (match, attrs) => {
        if (attrs.includes('lang=')) return match;
        changes.push('Added lang="en" to <html> element');
        return `<html${attrs} lang="en">`;
      });
      if (changes.length === 0 && !html.includes('<html')) {
        changes.push('Add lang="en" to your opening <html> tag');
        fixed = `<!-- Add lang="en" to your <html> tag -->\n${html}`;
      }
      return { fixed, changes };
    },
    explanation: 'The <html> element must have a lang attribute so screen readers pronounce content in the correct language.',
  },

  'document-title': {
    name: 'Missing page title',
    fix(html) {
      const changes = [];
      if (html.includes('<title') && html.match(/<title>\s*<\/title>/i)) {
        let fixed = html.replace(/<title>\s*<\/title>/i, '<title>Page Title — Your Site Name</title>');
        changes.push('Populated empty <title> element');
        return { fixed, changes };
      }
      if (html.includes('<head') && !html.includes('<title')) {
        let fixed = html.replace(/<head([^>]*)>/i, '<head$1>\n  <title>Page Title — Your Site Name</title>');
        changes.push('Added <title> element inside <head>');
        return { fixed, changes };
      }
      changes.push('Add a <title> element inside your <head> tag');
      return { fixed: `<title>Page Title — Your Site Name</title>\n${html}`, changes };
    },
    explanation: 'Every page needs a unique, descriptive <title> in the <head>. It\'s what screen readers announce first and what shows in browser tabs.',
  },

  'heading-order': {
    name: 'Heading hierarchy issue',
    fix(html) {
      const changes = [];
      // Detect skipped heading levels
      const headings = [];
      html.replace(/<h([1-6])\b[^>]*>(.*?)<\/h\1>/gi, (m, level, text) => {
        headings.push({ level: parseInt(level), text: text.replace(/<[^>]+>/g, '').trim() });
      });

      let fixed = html;

      if (headings.length === 0) {
        return { fixed, changes: ['No headings found in this snippet.'] };
      }

      // Single heading: if it's h3+ without context, suggest it should likely be h2
      if (headings.length === 1 && headings[0].level > 2) {
        const h = headings[0];
        const suggestedLevel = 2;
        fixed = fixed.replace(
          new RegExp(`<h${h.level}([^>]*)>`, 'i'),
          `<h${suggestedLevel}$1>`
        );
        fixed = fixed.replace(
          new RegExp(`</h${h.level}>`, 'i'),
          `</h${suggestedLevel}>`
        );
        changes.push(`Changed h${h.level} to h${suggestedLevel} — headings should follow a logical hierarchy (h1 → h2 → h3). An h${h.level} without preceding h${h.level - 1} breaks the document outline.`);
        return { fixed, changes };
      }

      // Multiple headings: fix skipped levels
      let lastLevel = 0;
      for (const h of headings) {
        if (h.level > lastLevel + 1 && lastLevel > 0) {
          const correctLevel = lastLevel + 1;
          fixed = fixed.replace(
            new RegExp(`<h${h.level}([^>]*)>(${escapeRegex(h.text)})<\\/h${h.level}>`, 'i'),
            `<h${correctLevel}$1>$2</h${correctLevel}>`
          );
          changes.push(`Changed h${h.level} "${h.text.substring(0, 30)}" to h${correctLevel} (was skipping levels)`);
        }
        lastLevel = Math.min(h.level, lastLevel > 0 ? h.level : h.level);
      }

      if (changes.length === 0) {
        changes.push('Heading hierarchy appears correct in this snippet. Ensure h1 → h2 → h3 order is maintained in the full page context.');
      }

      return { fixed, changes };
    },
    explanation: 'Headings must follow a logical order (h1 → h2 → h3). Never skip levels. Screen reader users navigate by headings — skipped levels break their mental model.',
  },

  'bypass': {
    name: 'No skip navigation link',
    fix(html) {
      const changes = [];
      if (html.includes('skip') && html.includes('#main')) {
        return { fixed: html, changes: ['Skip link already present'] };
      }
      const skipLink = '<a href="#main-content" class="skip-link">Skip to main content</a>';
      let fixed;
      if (html.includes('<body')) {
        fixed = html.replace(/<body([^>]*)>/i, `<body$1>\n  ${skipLink}`);
      } else {
        fixed = skipLink + '\n' + html;
      }
      changes.push('Added skip-to-main-content link as first focusable element');
      return { fixed, changes };
    },
    explanation: 'A "Skip to main content" link must be the first focusable element on the page. It lets keyboard users bypass repetitive navigation.',
  },

  'landmark-one-main': {
    name: 'No main landmark',
    fix(html) {
      const changes = [];
      if (html.includes('<main')) {
        return { fixed: html, changes: ['<main> element already present'] };
      }
      let fixed = html.replace(/<div\b([^>]*(?:id|class)=["'][^"']*(?:content|main|primary)[^"']*["'][^>]*)>/i, (match, attrs) => {
        changes.push('Converted content div to <main> landmark');
        return `<main${attrs}>`;
      });
      if (changes.length === 0) {
        fixed = `<main>\n${html}\n</main>`;
        changes.push('Wrapped content in <main> landmark element');
      } else {
        fixed = fixed.replace(/<\/div>\s*$/, '</main>');
      }
      return { fixed, changes };
    },
    explanation: 'Every page needs exactly one <main> element wrapping the primary content. Assistive technology uses this to let users jump directly to the content.',
  },

  'meta-viewport': {
    name: 'Viewport prevents zoom',
    fix(html) {
      const changes = [];
      let fixed = html.replace(/maximum-scale\s*=\s*[\d.]+/gi, () => {
        changes.push('Removed maximum-scale restriction');
        return '';
      });
      fixed = fixed.replace(/user-scalable\s*=\s*(?:no|0)/gi, () => {
        changes.push('Removed user-scalable=no restriction');
        return '';
      });
      // Clean up trailing commas
      fixed = fixed.replace(/,\s*,/g, ',').replace(/,\s*"/g, '"').replace(/content="([^"]*),\s*"/g, 'content="$1"');
      return { fixed, changes };
    },
    explanation: 'Never restrict zooming. People with low vision need to pinch-to-zoom to read text. Remove maximum-scale and user-scalable=no from your viewport meta tag.',
  },

  'color-contrast': {
    name: 'Insufficient color contrast',
    fix(html) {
      const changes = [];
      // Only provide guidance — can't fix from HTML. Don't modify the HTML itself.
      changes.push('Color contrast cannot be fixed from HTML alone — it requires CSS changes.');
      changes.push('Ensure text has a contrast ratio of at least 4.5:1 against its background (3:1 for large text).');
      changes.push('Use a tool like WebAIM Contrast Checker to find compliant color pairs.');
      return { fixed: html, changes };
    },
    explanation: 'WCAG requires a contrast ratio of 4.5:1 for normal text and 3:1 for large text (18px+ bold or 24px+ regular). This is a CSS fix, not an HTML fix.',
  },

  'region': {
    name: 'Content outside landmark',
    fix(html) {
      const changes = [];
      // Wrap orphan content in appropriate landmarks
      if (!html.includes('<main') && !html.includes('<nav') && !html.includes('<header') && !html.includes('<footer')) {
        let fixed = `<main>\n${html}\n</main>`;
        changes.push('Wrapped content in <main> landmark to satisfy landmark requirement');
        return { fixed, changes };
      }
      changes.push('Ensure all visible content is inside a landmark: <header>, <nav>, <main>, <aside>, or <footer>');
      return { fixed: html, changes };
    },
    explanation: 'All page content should be inside landmark regions (<header>, <nav>, <main>, <aside>, <footer>). Screen readers use these to help users understand page structure.',
  },

  'aria-hidden-focus': {
    name: 'Hidden element still focusable',
    fix(html) {
      const changes = [];
      let fixed = html.replace(/aria-hidden=["']true["']([^>]*)\btabindex=["']\d+["']/gi, (match, middle) => {
        changes.push('Added tabindex="-1" to remove from tab order while keeping aria-hidden');
        return `aria-hidden="true"${middle}tabindex="-1"`;
      });
      // Also handle the reverse order
      fixed = fixed.replace(/tabindex=["']\d+["']([^>]*)\baria-hidden=["']true["']/gi, (match, middle) => {
        if (!changes.length) changes.push('Set tabindex="-1" on aria-hidden element');
        return `tabindex="-1"${middle}aria-hidden="true"`;
      });
      if (changes.length === 0) {
        changes.push('Either remove aria-hidden="true" or add tabindex="-1" to prevent keyboard focus');
      }
      return { fixed, changes };
    },
    explanation: 'Elements with aria-hidden="true" are invisible to screen readers but can still receive keyboard focus. Add tabindex="-1" to remove them from tab order, or remove aria-hidden.',
  },

  'frame-title': {
    name: 'Frame missing title',
    fix(html) {
      const changes = [];
      let fixed = html.replace(/<iframe\b(?![^>]*\btitle\b)([^>]*)>/gi, (match, attrs) => {
        const srcMatch = attrs.match(/src=["']([^"']+)["']/i);
        let title = 'Embedded content';
        if (srcMatch) {
          if (srcMatch[1].includes('map')) title = 'Map';
          else if (srcMatch[1].includes('youtube') || srcMatch[1].includes('vimeo')) title = 'Video player';
          else if (srcMatch[1].includes('form')) title = 'Form';
        }
        changes.push(`Added title="${title}" to iframe`);
        return `<iframe${attrs} title="${title}">`;
      });
      return { fixed, changes };
    },
    explanation: 'Every <iframe> needs a title attribute describing its content. Screen readers announce this title so users know what the embedded content is for.',
  },

  'empty-heading': {
    name: 'Empty heading element',
    fix(html) {
      const changes = [];
      let fixed = html.replace(/<h([1-6])\b([^>]*)>\s*<\/h\1>/gi, (match, level) => {
        changes.push(`Removed empty <h${level}> element (use CSS margins for spacing instead)`);
        return `<!-- Removed empty h${level} — use CSS margin/padding for spacing -->`;
      });
      return { fixed, changes };
    },
    explanation: 'Empty headings create dead-end navigation points for screen reader users. Remove them and use CSS for visual spacing instead.',
  },

  'select-name': {
    name: 'Select missing label',
    fix(html) {
      const changes = [];
      let fixed = html.replace(/<select\b([^>]*)>/gi, (match, attrs) => {
        if (attrs.includes('aria-label') || attrs.includes('aria-labelledby')) return match;
        const idMatch = attrs.match(/id=["']([^"']+)["']/i);
        const nameMatch = attrs.match(/name=["']([^"']+)["']/i);
        const id = idMatch ? idMatch[1] : 'select-' + Math.random().toString(36).substr(2, 6);
        const label = nameMatch ? nameMatch[1].replace(/[-_]/g, ' ') : 'Selection';

        if (!idMatch) attrs += ` id="${id}"`;
        changes.push(`Added label for select: "${label}"`);
        return `<label for="${id}">${label}</label>\n<select${attrs}>`;
      });
      return { fixed, changes };
    },
    explanation: 'Every <select> dropdown needs an associated label. Use <label for="id"> or aria-label to announce the purpose to screen readers.',
  },

  'nested-interactive': {
    name: 'Nested interactive elements',
    fix(html) {
      const changes = [];
      // Detect <a> inside <button> or vice versa
      let fixed = html.replace(/<button([^>]*)>\s*<a\b([^>]*)>(.*?)<\/a>\s*<\/button>/gi, (match, btnAttrs, linkAttrs, content) => {
        changes.push('Removed nested <a> from inside <button> — kept as button');
        return `<button${btnAttrs}>${content}</button>`;
      });
      fixed = fixed.replace(/<a([^>]*)>\s*<button\b([^>]*)>(.*?)<\/button>\s*<\/a>/gi, (match, linkAttrs, btnAttrs, content) => {
        changes.push('Removed nested <button> from inside <a> — kept as link');
        return `<a${linkAttrs}>${content}</a>`;
      });
      if (changes.length === 0) {
        changes.push('Interactive elements (buttons, links) must not be nested inside each other. Choose one and remove the other.');
      }
      return { fixed, changes };
    },
    explanation: 'Nesting interactive elements (like a link inside a button) makes them impossible to activate for some assistive technology users. Keep each interactive element independent.',
  },

  'list': {
    name: 'Invalid list structure',
    fix(html) {
      const changes = [];
      // Fix <li> without parent <ul>/<ol>
      if (html.includes('<li') && !html.includes('<ul') && !html.includes('<ol')) {
        let fixed = `<ul>\n${html}\n</ul>`;
        changes.push('Wrapped <li> elements in a <ul> parent');
        return { fixed, changes };
      }
      changes.push('Ensure <li> elements are direct children of <ul> or <ol>');
      return { fixed: html, changes };
    },
    explanation: 'List items (<li>) must be inside a proper list container (<ul> or <ol>). Screen readers announce "list with X items" — broken structure prevents this.',
  },

  'aria-allowed-role': {
    name: 'Invalid ARIA role',
    fix(html) {
      const changes = [];
      // Common mistake: role="button" on <a>
      let fixed = html.replace(/<a\b([^>]*)\brole=["']button["']([^>]*)>/gi, (match, before, after) => {
        changes.push('Removed role="button" from <a> — use a real <button> instead if it performs an action');
        return `<a${before}${after}>`;
      });
      if (changes.length === 0) {
        changes.push('Ensure role attributes match the element type. Use native HTML elements instead of ARIA roles when possible.');
      }
      return { fixed, changes };
    },
    explanation: 'ARIA roles must be compatible with the HTML element. Instead of adding role="button" to a link, use a real <button> element. Native HTML is always preferred over ARIA.',
  },

  'aria-prohibited-attr': {
    name: 'Prohibited ARIA attribute',
    fix(html) {
      const changes = [];
      // Remove aria-label from non-interactive/non-landmark elements
      let fixed = html.replace(/<(div|span|p|h[1-6])\b([^>]*)\baria-label=["'][^"']*["']([^>]*)>/gi, (match, tag, before, after) => {
        // Only remove if the element doesn't have a role
        if (before.includes('role=') || after.includes('role=')) return match;
        changes.push(`Removed aria-label from <${tag}> (not supported on this element without a role)`);
        return `<${tag}${before}${after}>`;
      });
      return { fixed, changes };
    },
    explanation: 'Some ARIA attributes are not allowed on certain elements. For example, aria-label is not valid on generic <div> or <span> without a role. Use the correct semantic element instead.',
  },
};

// ─── Main Fix Function ───────────────────────────────────────────────────────

/**
 * Attempt to fix HTML using the rules engine.
 *
 * @param {string} html - The non-compliant HTML code
 * @param {string} ruleId - Optional specific rule to apply (if known)
 * @returns {object|null} - { fixed, changes, explanation, rule, method } or null if can't fix
 */
function fixWithRules(html, ruleId) {
  if (!html || !html.trim()) return null;

  // Detect if this is a snippet (no <html>, <head>, <body> tags) vs full page
  const isSnippet = !html.includes('<html') && !html.includes('<head') && !html.includes('<!DOCTYPE');

  // Page-level rules that should only apply to full documents, not snippets
  const pageLevelRules = ['html-has-lang', 'document-title', 'bypass', 'landmark-one-main', 'region'];

  // If a specific rule is requested, use that fixer
  if (ruleId && FIXERS[ruleId]) {
    // Skip page-level rules on snippets unless explicitly requested
    const fixer = FIXERS[ruleId];
    const result = fixer.fix(html);
    if (result.changes.length > 0) {
      return {
        fixed: result.fixed,
        changes: result.changes,
        explanation: fixer.explanation,
        rule: ruleId,
        ruleName: fixer.name,
        method: 'rules-engine',
      };
    }
  }

  // Auto-detect: try all fixers and apply the ones that produce changes
  if (!ruleId) {
    const allChanges = [];
    let currentHtml = html;

    for (const [id, fixer] of Object.entries(FIXERS)) {
      // Skip page-level rules when fixing a snippet
      if (isSnippet && pageLevelRules.includes(id)) continue;

      const result = fixer.fix(currentHtml);
      if (result.changes.length > 0 && result.fixed !== currentHtml) {
        currentHtml = result.fixed;
        allChanges.push({ rule: id, name: fixer.name, changes: result.changes, explanation: fixer.explanation });
      }
    }

    if (allChanges.length > 0) {
      return {
        fixed: currentHtml,
        changes: allChanges.flatMap(a => a.changes),
        explanations: allChanges.map(a => ({ rule: a.rule, name: a.name, explanation: a.explanation })),
        method: 'rules-engine (auto-detect)',
        rulesApplied: allChanges.length,
      };
    }
  }

  return null; // Rules engine couldn't fix it
}

// ─── Helper ──────────────────────────────────────────────────────────────────
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { fixWithRules, FIXERS };
