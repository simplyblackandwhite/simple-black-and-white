'use strict';

/**
 * AEO Analyzer — Answer Engine Optimization
 * Simply Black and White — Phase 9
 *
 * Evaluates how well a page is structured for AI search engines
 * (ChatGPT, Perplexity, Google AI Overviews) to parse, understand,
 * and cite the business as an authoritative source.
 *
 * Scoring categories (150 max for full, 100 max for snapshot):
 * - Semantic structure (30 pts)
 * - Heading hierarchy (20 pts)
 * - JSON-LD Schema (25 pts)
 * - Meta description (10 pts)
 * - Image alt coverage (15 pts)
 * - FAQ / Conversational query readiness (20 pts) [full only]
 * - Active present-tense phrasing (15 pts) [full only]
 * - Comparison content (15 pts) [full only]
 */

/**
 * Run a full AEO analysis on page data extracted from the browser.
 * Used in the internal dashboard (full scan).
 *
 * @param {object} pageData - Raw page data from browser evaluate
 * @returns {object} - Full AEO analysis with score, grade, and findings
 */
function analyzeFullAeo(pageData) {
  const findings = [];
  let score = 0;
  const maxScore = 150;

  // ─── 1. Semantic Structure (30 pts) ──────────────────────────
  score += scoreSemantics(pageData, findings);

  // ─── 2. Heading Hierarchy (20 pts) ───────────────────────────
  score += scoreHeadings(pageData, findings);

  // ─── 3. JSON-LD Schema (25 pts) ──────────────────────────────
  score += scoreSchema(pageData, findings, true);

  // ─── 4. Meta Description (10 pts) ────────────────────────────
  score += scoreMeta(pageData, findings);

  // ─── 5. Image Alt Coverage (15 pts) ──────────────────────────
  score += scoreImages(pageData, findings);

  // ─── 6. FAQ / Conversational Query Readiness (20 pts) ────────
  score += scoreFaqReadiness(pageData, findings);

  // ─── 7. Active Present-Tense Phrasing (15 pts) ───────────────
  score += scorePresentTense(pageData, findings);

  // ─── 8. Comparison Content (15 pts) ──────────────────────────
  score += scoreComparisonContent(pageData, findings);

  // Normalize to 100-point scale for display
  const normalized = Math.round((score / maxScore) * 100);

  return {
    score: normalized,
    maxScore: 100,
    rawScore: score,
    rawMaxScore: maxScore,
    grade: getGrade(normalized),
    findings,
  };
}

/**
 * Run a snapshot AEO analysis (gated for public light scan).
 * Shows 3 findings max, gates the rest.
 *
 * @param {object} pageData - Raw page data from browser evaluate
 * @returns {object} - Snapshot AEO with gated count
 */
function analyzeSnapshotAeo(pageData) {
  const findings = [];
  let score = 0;
  const maxScore = 100;

  // Only run the core 5 checks for the snapshot
  score += scoreSemantics(pageData, findings);
  score += scoreHeadings(pageData, findings);
  score += scoreSchema(pageData, findings, false);
  score += scoreMeta(pageData, findings);
  score += scoreImages(pageData, findings);

  return {
    score,
    maxScore,
    grade: getGrade(score),
    findings: findings.slice(0, 3),
    gatedCount: Math.max(0, findings.length - 3),
  };
}

// ─── Scoring Functions ─────────────────────────────────────────────────────

function scoreSemantics(data, findings) {
  if (data.semanticRatio >= 40) {
    findings.push({ status: 'pass', text: `Strong semantic structure: ${data.semanticRatio}% of containers use semantic HTML.`, category: 'structure' });
    return 30;
  } else if (data.semanticRatio >= 20) {
    findings.push({ status: 'warn', text: `Moderate semantic density: ${data.semanticRatio}% semantic vs ${100 - data.semanticRatio}% generic divs. AI crawlers prefer semantic landmarks.`, category: 'structure' });
    return 15;
  } else {
    findings.push({ status: 'fail', text: `Low semantic density: only ${data.semanticRatio}% of containers are semantic. This is "div soup" — hard for AI bots to parse.`, category: 'structure' });
    return 0;
  }
}

function scoreHeadings(data, findings) {
  if (data.h1Count === 1 && data.hierarchyValid) {
    findings.push({ status: 'pass', text: 'Heading hierarchy is logical (single H1, no skipped levels).', category: 'structure' });
    return 20;
  } else if (data.h1Count === 1) {
    findings.push({ status: 'warn', text: 'Single H1 present but heading levels skip ranks. AI bots use headings to understand content structure.', category: 'structure' });
    return 10;
  } else if (data.h1Count === 0) {
    findings.push({ status: 'fail', text: 'No H1 heading found. Every page needs a primary heading for AI to identify the main topic.', category: 'structure' });
    return 0;
  } else {
    findings.push({ status: 'warn', text: `${data.h1Count} H1 headings found. Pages should have exactly one H1 to signal the primary topic.`, category: 'structure' });
    return 5;
  }
}

function scoreSchema(data, findings, showDetail) {
  if (data.schemaPresent && data.schemaValid) {
    const detail = showDetail ? ` (${data.schemas.join(', ')})` : '';
    findings.push({ status: 'pass', text: `JSON-LD Schema markup detected${detail}. Structurally valid.`, category: 'schema' });
    return 25;
  } else if (data.schemaPresent && !data.schemaValid) {
    findings.push({ status: 'warn', text: 'JSON-LD Schema found but contains parsing errors that may prevent AI engines from reading it.', category: 'schema' });
    return 10;
  } else {
    findings.push({ status: 'fail', text: 'No JSON-LD Schema markup found. Schema helps AI engines understand your business entity and services.', category: 'schema' });
    return 0;
  }
}

function scoreMeta(data, findings) {
  if (data.hasMetaDesc) {
    findings.push({ status: 'pass', text: 'Meta description present — used by AI for quick entity summaries.', category: 'meta' });
    return 10;
  } else {
    findings.push({ status: 'fail', text: 'No meta description. AI engines often use this as a quick summary of what the page is about.', category: 'meta' });
    return 0;
  }
}

function scoreImages(data, findings) {
  if (data.totalImages === 0) {
    findings.push({ status: 'pass', text: 'No images without context issues (or no images on page).', category: 'content' });
    return 15;
  } else if (data.imagesWithoutAlt === 0) {
    findings.push({ status: 'pass', text: `All ${data.totalImages} images have alt text — accessible and AI-readable.`, category: 'content' });
    return 15;
  } else {
    const ratio = Math.round((data.imagesWithoutAlt / data.totalImages) * 100);
    findings.push({ status: 'fail', text: `${data.imagesWithoutAlt} of ${data.totalImages} images lack alt text (${ratio}%). Screen readers and AI can't interpret them.`, category: 'content' });
    return ratio < 30 ? 8 : 0;
  }
}

function scoreFaqReadiness(data, findings) {
  let pts = 0;

  // Check for FAQ Schema
  if (data.hasFaqSchema) {
    pts += 10;
    findings.push({ status: 'pass', text: 'FAQ Schema (FAQPage) detected — AI engines can parse your Q&A content directly.', category: 'faq' });
  } else {
    findings.push({ status: 'fail', text: 'No FAQ Schema found. Adding FAQPage structured data lets AI engines pull your answers into search results.', category: 'faq' });
  }

  // Check for question-format headings
  if (data.questionHeadingCount >= 3) {
    pts += 10;
    findings.push({ status: 'pass', text: `${data.questionHeadingCount} question-format headings found. These match how people ask AI engines for answers.`, category: 'faq' });
  } else if (data.questionHeadingCount >= 1) {
    pts += 5;
    findings.push({ status: 'warn', text: `Only ${data.questionHeadingCount} question-format heading${data.questionHeadingCount !== 1 ? 's' : ''} found. Add more "How/What/Why/When" headings to match natural search queries.`, category: 'faq' });
  } else {
    findings.push({ status: 'fail', text: 'No question-format headings detected. AI engines match conversational queries to pages with question-style headings (e.g., "What is ADA compliance?").', category: 'faq' });
  }

  return pts;
}

function scorePresentTense(data, findings) {
  // Check for active present-tense phrasing in key content
  if (data.presentTenseRatio >= 70) {
    findings.push({ status: 'pass', text: `Strong active voice: ${data.presentTenseRatio}% of key sentences use present tense. AI engines parse this as current, authoritative information.`, category: 'phrasing' });
    return 15;
  } else if (data.presentTenseRatio >= 40) {
    findings.push({ status: 'warn', text: `Mixed tense usage: ${data.presentTenseRatio}% present tense. AI engines prefer active present-tense statements ("We provide...") over past/future tense for entity citations.`, category: 'phrasing' });
    return 8;
  } else {
    findings.push({ status: 'fail', text: `Low present-tense usage: ${data.presentTenseRatio}%. Content phrased in past or future tense is less likely to be cited by AI as a current authoritative source.`, category: 'phrasing' });
    return 0;
  }
}

function scoreComparisonContent(data, findings) {
  if (data.hasComparisonContent) {
    findings.push({ status: 'pass', text: 'Comparison/alternative content detected. This helps your page answer "which is better" and "vs" queries from AI search users.', category: 'comparison' });
    return 15;
  } else {
    findings.push({ status: 'warn', text: 'No comparison or "vs" content detected. Pages that address alternatives ("X vs Y", "Which is better") get cited in comparison queries by AI engines.', category: 'comparison' });
    return 0;
  }
}

// ─── Utilities ─────────────────────────────────────────────────────────────

function getGrade(score) {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  if (score >= 20) return 'D';
  return 'F';
}

/**
 * Extract AEO-relevant data from a page using Puppeteer's page.evaluate().
 * Call this inside the browser context.
 *
 * @returns {object} - Raw data for AEO analysis
 */
function getPageEvalScript() {
  return function () {
    var doc = document;

    // Semantic tag density
    var semanticTags = ['article', 'section', 'nav', 'main', 'header', 'footer', 'aside'];
    var semanticCount = semanticTags.reduce(function (sum, tag) { return sum + doc.querySelectorAll(tag).length; }, 0);
    var divCount = doc.querySelectorAll('div').length;
    var totalContainers = semanticCount + divCount;
    var semanticRatio = totalContainers > 0 ? semanticCount / totalContainers : 0;

    // Heading hierarchy
    var headings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    var headingLevels = headings.map(function (h) { return parseInt(h.tagName.charAt(1)); });
    var hierarchyValid = true;
    var h1Count = doc.querySelectorAll('h1').length;

    for (var i = 1; i < headingLevels.length; i++) {
      if (headingLevels[i] - headingLevels[i - 1] > 1) {
        hierarchyValid = false;
        break;
      }
    }

    // JSON-LD Schema
    var jsonLdScripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
    var schemas = [];
    var schemaValid = true;
    var hasFaqSchema = false;

    jsonLdScripts.forEach(function (script) {
      try {
        var parsed = JSON.parse(script.textContent);
        var type = parsed['@type'] || '';
        schemas.push(type);
        if (type === 'FAQPage' || (parsed['@graph'] && JSON.stringify(parsed['@graph']).includes('FAQPage'))) {
          hasFaqSchema = true;
        }
      } catch (e) {
        schemaValid = false;
      }
    });

    // Meta description
    var metaDesc = doc.querySelector('meta[name="description"]');
    var hasMetaDesc = !!(metaDesc && metaDesc.content && metaDesc.content.length > 0);

    // Image alt tags
    var images = doc.querySelectorAll('img');
    var imagesWithoutAlt = Array.from(images).filter(function (img) {
      return !img.alt || img.alt.trim() === '';
    }).length;

    // Question-format headings
    var questionPattern = /^(what|how|why|when|where|who|which|can|do|does|is|are|should|will)\b/i;
    var questionHeadingCount = headings.filter(function (h) {
      return questionPattern.test(h.textContent.trim());
    }).length;

    // Present-tense detection (heuristic on paragraph text)
    var paragraphs = Array.from(doc.querySelectorAll('p, li')).slice(0, 50);
    var presentIndicators = /\b(we provide|we offer|we help|we deliver|we build|we create|we make|we ensure|we analyze|we monitor|we guide|our team|is a|are a|specializes in|focuses on)\b/i;
    var pastFutureIndicators = /\b(we provided|we offered|we helped|we will|we would|we could|was a|were a|used to)\b/i;
    var presentCount = 0;
    var totalChecked = 0;

    paragraphs.forEach(function (p) {
      var text = p.textContent.trim();
      if (text.length < 20) return;
      totalChecked++;
      if (presentIndicators.test(text)) presentCount++;
      if (pastFutureIndicators.test(text)) presentCount--; // Penalize past/future
    });

    var presentTenseRatio = totalChecked > 0 ? Math.max(0, Math.min(100, Math.round((presentCount / totalChecked) * 100))) : 50;

    // Comparison content detection
    var bodyText = doc.body ? doc.body.innerText.substring(0, 20000).toLowerCase() : '';
    var comparisonPatterns = [
      /\bvs\.?\b/, /\bversus\b/, /\bcompare[ds]?\b/, /\bcomparison\b/,
      /\balternative[s]?\b/, /\binstead of\b/, /\bwhich is better\b/,
      /\bdifference between\b/, /\bpros and cons\b/, /\bunlike\b/
    ];
    var hasComparisonContent = comparisonPatterns.some(function (p) { return p.test(bodyText); });

    return {
      semanticCount: semanticCount,
      divCount: divCount,
      semanticRatio: Math.round(semanticRatio * 100),
      headingCount: headings.length,
      h1Count: h1Count,
      hierarchyValid: hierarchyValid,
      schemas: schemas,
      schemaPresent: schemas.length > 0,
      schemaValid: schemaValid,
      hasFaqSchema: hasFaqSchema,
      hasMetaDesc: hasMetaDesc,
      totalImages: images.length,
      imagesWithoutAlt: imagesWithoutAlt,
      questionHeadingCount: questionHeadingCount,
      presentTenseRatio: presentTenseRatio,
      hasComparisonContent: hasComparisonContent,
    };
  };
}

module.exports = {
  analyzeFullAeo,
  analyzeSnapshotAeo,
  getPageEvalScript,
};
