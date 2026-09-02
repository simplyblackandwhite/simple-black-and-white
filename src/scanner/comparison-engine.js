'use strict';

/**
 * Scan Comparison Engine
 * Simply Black and White — Nightwolf — Phase 13
 *
 * Compares two scans of the same domain and produces a rich diff:
 * score deltas, resolved/new/persistent issues, page-level movement,
 * momentum indicator, and conversational talking points.
 */

/**
 * Compare two scan records.
 * @param {object} scanA - The EARLIER scan (baseline) — DB row with raw_results
 * @param {object} scanB - The LATER scan (current) — DB row with raw_results
 * @returns {object} - Full comparison object
 */
function compareScans(scanA, scanB) {
  // Determine chronological order — A should be earlier, B later
  const dateA = new Date(scanA.created_at);
  const dateB = new Date(scanB.created_at);
  let earlier = scanA, later = scanB;
  if (dateA > dateB) {
    earlier = scanB;
    later = scanA;
  }

  const rawEarlier = safeParse(earlier.raw_results);
  const rawLater = safeParse(later.raw_results);

  // ─── Scores ────────────────────────────────────────────────
  const scoreEarlier = earlier.accessibility_score || 0;
  const scoreLater = later.accessibility_score || 0;
  const scoreDelta = scoreLater - scoreEarlier;

  const aeoEarlier = earlier.aeo_score || 0;
  const aeoLater = later.aeo_score || 0;
  const aeoDelta = aeoLater - aeoEarlier;

  // ─── Issue counts ──────────────────────────────────────────
  const issuesEarlier = earlier.total_issues || 0;
  const issuesLater = later.total_issues || 0;
  const issuesDelta = issuesLater - issuesEarlier;

  // ─── Severity breakdown ────────────────────────────────────
  const severityDelta = {
    critical: (later.critical || 0) - (earlier.critical || 0),
    serious: (later.serious || 0) - (earlier.serious || 0),
    moderate: (later.moderate || 0) - (earlier.moderate || 0),
    minor: (later.minor || 0) - (earlier.minor || 0),
  };

  // ─── Rule-level diff (resolved / new / persistent) ─────────
  const rulesEarlier = groupByRule(rawEarlier.issues || []);
  const rulesLater = groupByRule(rawLater.issues || []);

  const resolved = [];   // in earlier, not in later
  const newIssues = [];  // in later, not in earlier
  const persistent = []; // in both

  for (const ruleId in rulesEarlier) {
    if (!rulesLater[ruleId]) {
      resolved.push(rulesEarlier[ruleId]);
    } else {
      // Persistent — track instance change
      const before = rulesEarlier[ruleId].totalInstances;
      const after = rulesLater[ruleId].totalInstances;
      persistent.push({
        ...rulesLater[ruleId],
        instancesBefore: before,
        instancesAfter: after,
        instanceDelta: after - before,
      });
    }
  }

  for (const ruleId in rulesLater) {
    if (!rulesEarlier[ruleId]) {
      newIssues.push(rulesLater[ruleId]);
    }
  }

  // Sort each by severity
  const sevOrder = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  const bySeverity = (a, b) => (sevOrder[a.impact] || 3) - (sevOrder[b.impact] || 3);
  resolved.sort(bySeverity);
  newIssues.sort(bySeverity);
  persistent.sort(bySeverity);

  // ─── Page-level movement ───────────────────────────────────
  const pageMovement = comparePages(rawEarlier.pages || [], rawLater.pages || []);

  // ─── Time between scans ────────────────────────────────────
  const msBetween = new Date(later.created_at) - new Date(earlier.created_at);
  const daysBetween = Math.round(msBetween / (1000 * 60 * 60 * 24));

  // ─── Momentum indicator ────────────────────────────────────
  let momentum;
  if (scoreDelta >= 15) momentum = { label: 'Strong Progress', tone: 'positive' };
  else if (scoreDelta > 0) momentum = { label: 'Improving', tone: 'positive' };
  else if (scoreDelta === 0) momentum = { label: 'Holding Steady', tone: 'neutral' };
  else if (scoreDelta > -15) momentum = { label: 'Slipping', tone: 'negative' };
  else momentum = { label: 'Regressing', tone: 'negative' };

  // ─── Talking points (conversational, read-aloud ready) ─────
  const talkingPoints = buildTalkingPoints({
    domain: later.url,
    scoreEarlier, scoreLater, scoreDelta,
    resolved, newIssues, persistent,
    daysBetween,
    severityDelta,
    aeoEarlier, aeoLater,
  });

  return {
    domain: later.url,
    earlier: {
      id: earlier.id,
      date: earlier.created_at,
      score: scoreEarlier,
      issues: issuesEarlier,
      aeoScore: aeoEarlier,
      aeoGrade: earlier.aeo_grade,
      pagesScanned: earlier.pages_scanned || 1,
    },
    later: {
      id: later.id,
      date: later.created_at,
      score: scoreLater,
      issues: issuesLater,
      aeoScore: aeoLater,
      aeoGrade: later.aeo_grade,
      pagesScanned: later.pages_scanned || 1,
    },
    deltas: {
      score: scoreDelta,
      issues: issuesDelta,
      aeo: aeoDelta,
      severity: severityDelta,
    },
    resolved,
    newIssues,
    persistent,
    pageMovement,
    daysBetween,
    momentum,
    talkingPoints,
    summary: {
      resolvedCount: resolved.length,
      newCount: newIssues.length,
      persistentCount: persistent.length,
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────

function safeParse(json) {
  try {
    return JSON.parse(json || '{}');
  } catch (e) {
    return {};
  }
}

function groupByRule(issues) {
  const map = {};
  issues.forEach((issue) => {
    if (!map[issue.id]) {
      map[issue.id] = {
        id: issue.id,
        impact: issue.impact,
        description: issue.plainDescription,
        howToFix: issue.howToFix,
        wcagLevel: issue.wcagLevel,
        category: issue.category,
        totalInstances: 0,
        pagesAffected: 0,
      };
    }
    map[issue.id].totalInstances += issue.instanceCount || 1;
    map[issue.id].pagesAffected += 1;
  });
  return map;
}

function comparePages(pagesEarlier, pagesLater) {
  const earlierMap = {};
  pagesEarlier.forEach((p) => {
    if (p.url) earlierMap[normalizePath(p.url)] = p.summary ? p.summary.totalIssues : (p.issueCount || 0);
  });

  const improved = [];
  const degraded = [];
  const unchanged = [];

  pagesLater.forEach((p) => {
    if (!p.url) return;
    const key = normalizePath(p.url);
    const laterIssues = p.summary ? p.summary.totalIssues : (p.issueCount || 0);
    if (earlierMap[key] === undefined) return; // page didn't exist before

    const earlierIssues = earlierMap[key];
    const delta = laterIssues - earlierIssues;
    const entry = { url: p.url, before: earlierIssues, after: laterIssues, delta };

    if (delta < 0) improved.push(entry);
    else if (delta > 0) degraded.push(entry);
    else unchanged.push(entry);
  });

  improved.sort((a, b) => a.delta - b.delta); // biggest improvement first
  degraded.sort((a, b) => b.delta - a.delta); // biggest regression first

  return { improved, degraded, unchanged: unchanged.length };
}

function normalizePath(url) {
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/$/, '') || '/';
  } catch (e) {
    return url;
  }
}

function buildTalkingPoints(d) {
  const points = [];
  const domain = friendlyDomain(d.domain);

  // Opening — overall movement
  if (d.scoreDelta > 0) {
    points.push(`${domain}'s accessibility score went up from ${d.scoreEarlier}% to ${d.scoreLater}% — that's ${d.scoreDelta} points of improvement${d.daysBetween > 0 ? ' over ' + d.daysBetween + ' day' + (d.daysBetween !== 1 ? 's' : '') : ''}.`);
  } else if (d.scoreDelta < 0) {
    points.push(`${domain}'s accessibility score dropped from ${d.scoreEarlier}% to ${d.scoreLater}% — down ${Math.abs(d.scoreDelta)} points. Worth looking into what changed.`);
  } else {
    points.push(`${domain}'s accessibility score held steady at ${d.scoreLater}%.`);
  }

  // Resolved wins
  if (d.resolved.length > 0) {
    const criticalResolved = d.resolved.filter((r) => r.impact === 'critical' || r.impact === 'serious').length;
    points.push(`We cleared ${d.resolved.length} type${d.resolved.length !== 1 ? 's' : ''} of issue completely${criticalResolved > 0 ? ', including ' + criticalResolved + ' high-severity one' + (criticalResolved !== 1 ? 's' : '') : ''}.`);
  }

  // New issues warning
  if (d.newIssues.length > 0) {
    const criticalNew = d.newIssues.filter((r) => r.impact === 'critical' || r.impact === 'serious').length;
    points.push(`Heads up: ${d.newIssues.length} new issue type${d.newIssues.length !== 1 ? 's' : ''} showed up${criticalNew > 0 ? ' (' + criticalNew + ' high-severity)' : ''} — likely from new content or a site change.`);
  }

  // Persistent
  if (d.persistent.length > 0) {
    points.push(`${d.persistent.length} issue type${d.persistent.length !== 1 ? 's' : ''} still need${d.persistent.length === 1 ? 's' : ''} attention — these were present in both scans.`);
  }

  // AEO
  if (d.aeoLater !== d.aeoEarlier) {
    const dir = d.aeoLater > d.aeoEarlier ? 'improved' : 'dropped';
    points.push(`AI search visibility ${dir} from ${d.aeoEarlier} to ${d.aeoLater} out of 100.`);
  }

  return points;
}

function friendlyDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    return url || 'This site';
  }
}

module.exports = { compareScans };
