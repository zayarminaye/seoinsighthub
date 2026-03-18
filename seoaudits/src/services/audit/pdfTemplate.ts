import type { ReportData } from './reportInsights';

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: '#dc2626',
  SERIOUS: '#ea580c',
  MODERATE: '#ca8a04',
  MINOR: '#2563eb',
};

const STATUS_COLORS: Record<string, string> = {
  good: '#16a34a',
  warning: '#ca8a04',
  poor: '#dc2626',
};

const GRADE_COLORS: Record<string, string> = {
  green: '#16a34a',
  yellow: '#ca8a04',
  red: '#dc2626',
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate a self-contained HTML document for PDF rendering.
 * Uses inline styles only — no external resources needed.
 */
export function generatePdfHtml(
  report: ReportData,
  audit: { targetDomain: string; completedAt: string | null }
): string {
  const { executive, scoreBreakdown, priorityActions, stepInsights, worstPerformers } = report;
  const completedDate = audit.completedAt
    ? new Date(audit.completedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'N/A';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SEO Audit — ${escapeHtml(audit.targetDomain)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; font-size: 12px; line-height: 1.5; padding: 40px; }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
    h2 { font-size: 16px; font-weight: 600; margin-bottom: 12px; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; margin-top: 32px; }
    h3 { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 3px solid #111; padding-bottom: 16px; }
    .header-meta { color: #6b7280; font-size: 11px; }
    .grade-badge { display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 50%; color: white; font-size: 24px; font-weight: 700; }
    .stats-row { display: flex; gap: 24px; margin: 16px 0; }
    .stat { text-align: center; }
    .stat-value { font-size: 20px; font-weight: 700; }
    .stat-label { font-size: 10px; color: #6b7280; text-transform: uppercase; }
    .verdict { font-size: 13px; color: #374151; margin: 12px 0; padding: 12px; background: #f9fafb; border-radius: 6px; }
    .score-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px; }
    .score-card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; }
    .score-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .score-card-name { font-weight: 600; font-size: 11px; }
    .score-card-value { font-size: 16px; font-weight: 700; }
    .score-card-detail { font-size: 10px; color: #6b7280; }
    .action-card { border-left: 4px solid; padding: 10px 12px; margin-bottom: 10px; background: #fafafa; border-radius: 0 6px 6px 0; }
    .action-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
    .severity-badge { display: inline-block; padding: 1px 6px; border-radius: 9999px; color: white; font-size: 9px; font-weight: 600; text-transform: uppercase; }
    .action-problem { font-weight: 600; font-size: 12px; }
    .action-why { font-size: 10px; color: #6b7280; margin: 4px 0; font-style: italic; }
    .action-fix { font-size: 11px; margin: 4px 0; }
    .action-affected { font-size: 10px; color: #6b7280; }
    .step-row { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; margin-bottom: 8px; }
    .step-header { display: flex; justify-content: space-between; align-items: center; }
    .step-name { font-weight: 600; font-size: 12px; }
    .step-badge { font-size: 10px; padding: 2px 8px; border-radius: 9999px; font-weight: 600; }
    .step-metric { font-size: 11px; color: #374151; margin-top: 4px; }
    .step-signals { font-size: 10px; color: #16a34a; margin-top: 2px; }
    .performer-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
    .performer-url { font-size: 11px; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .performer-badges { display: flex; gap: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { background: #f9fafb; text-align: left; padding: 6px 8px; border-bottom: 2px solid #e5e7eb; font-weight: 600; }
    td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; }
    .page-break { page-break-before: always; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div>
      <h1>${escapeHtml(audit.targetDomain)}</h1>
      <div class="header-meta">SEO Audit Report &middot; ${escapeHtml(completedDate)}</div>
    </div>
    <div class="grade-badge" style="background:${GRADE_COLORS[executive.gradeColor]}">
      ${escapeHtml(executive.grade)}
    </div>
  </div>

  <!-- Executive Summary -->
  <h2>Executive Summary</h2>
  <div class="stats-row">
    <div class="stat">
      <div class="stat-value">${executive.overallScore ?? '—'}</div>
      <div class="stat-label">Overall Score</div>
    </div>
    <div class="stat">
      <div class="stat-value">${executive.pagesAudited}</div>
      <div class="stat-label">Pages Audited</div>
    </div>
    <div class="stat">
      <div class="stat-value">${executive.totalIssues}</div>
      <div class="stat-label">Total Issues</div>
    </div>
    <div class="stat">
      <div class="stat-value" style="color:${SEVERITY_COLORS.CRITICAL}">${executive.criticalCount}</div>
      <div class="stat-label">Critical</div>
    </div>
    <div class="stat">
      <div class="stat-value" style="color:${SEVERITY_COLORS.SERIOUS}">${executive.seriousCount}</div>
      <div class="stat-label">Serious</div>
    </div>
  </div>
  <div class="verdict">${escapeHtml(executive.verdict)}</div>

  <!-- Score Breakdown -->
  <h2>Score Breakdown${[
    scoreBreakdown.usabilityScore !== null ? `U: ${Math.round(scoreBreakdown.usabilityScore)}` : '',
    scoreBreakdown.relevanceScore !== null ? `R: ${Math.round(scoreBreakdown.relevanceScore)}` : '',
    scoreBreakdown.authorityScore !== null ? `A: ${Math.round(scoreBreakdown.authorityScore)}` : '',
  ].filter(Boolean).length > 0 ? ` — ${[
    scoreBreakdown.usabilityScore !== null ? `U: ${Math.round(scoreBreakdown.usabilityScore)}` : '',
    scoreBreakdown.relevanceScore !== null ? `R: ${Math.round(scoreBreakdown.relevanceScore)}` : '',
    scoreBreakdown.authorityScore !== null ? `A: ${Math.round(scoreBreakdown.authorityScore)}` : '',
  ].filter(Boolean).join(' | ')}/100` : ''}</h2>
  <div class="score-grid">
    ${scoreBreakdown.components.map((c) => `
    <div class="score-card" style="border-color:${STATUS_COLORS[c.status]}20; border-left:3px solid ${STATUS_COLORS[c.status]}">
      <div class="score-card-header">
        <span class="score-card-name">${escapeHtml(c.name)}</span>
        <span class="score-card-value" style="color:${STATUS_COLORS[c.status]}">${c.score !== null ? Math.round(c.score) : '—'}</span>
      </div>
      <div class="score-card-detail">${escapeHtml(c.weightLabel)} &middot; ${escapeHtml(c.benchmark)}</div>
      <div class="score-card-detail" style="margin-top:2px">${escapeHtml(c.insight)}</div>
    </div>
    `).join('')}
  </div>

  <!-- Priority Actions -->
  <h2>Priority Actions</h2>
  ${priorityActions.length === 0 ? '<p>No priority actions — great job!</p>' : ''}
  ${renderActionGroup(priorityActions.filter((a) => a.group === 'critical-fixes'), 'Critical Fixes', SEVERITY_COLORS.CRITICAL)}
  ${renderActionGroup(priorityActions.filter((a) => a.group === 'quick-wins'), 'Quick Wins', SEVERITY_COLORS.MODERATE)}

  <!-- Step-by-Step Insights -->
  <div class="page-break"></div>
  <h2>Step-by-Step Analysis</h2>
  ${stepInsights.map((s) => `
  <div class="step-row">
    <div class="step-header">
      <span class="step-name">Step ${s.stepNumber}: ${escapeHtml(s.stepName)}</span>
      <span class="step-badge" style="background:${STATUS_COLORS[s.status]}15; color:${STATUS_COLORS[s.status]}">
        ${s.passCount}/${s.totalRelevant} passed
      </span>
    </div>
    ${s.keyMetric ? `<div class="step-metric">${escapeHtml(s.keyMetric.label)}: <strong>${escapeHtml(s.keyMetric.value)}</strong> (${escapeHtml(s.keyMetric.benchmark)})</div>` : ''}
    ${s.positiveSignals.length > 0 ? `<div class="step-signals">${s.positiveSignals.slice(0, 2).map((sig) => `&#10003; ${escapeHtml(sig)}`).join(' &nbsp;&middot;&nbsp; ')}</div>` : ''}
  </div>
  `).join('')}

  <!-- Worst Performers -->
  ${worstPerformers.length > 0 ? `
  <h2>Top Problem Pages</h2>
  ${worstPerformers.map((p, i) => `
  <div class="performer-row">
    <div>
      <strong>${i + 1}.</strong>
      <span class="performer-url">${escapeHtml(p.url)}</span>
    </div>
    <div class="performer-badges">
      ${p.criticalCount > 0 ? `<span class="severity-badge" style="background:${SEVERITY_COLORS.CRITICAL}">${p.criticalCount} critical</span>` : ''}
      ${p.seriousCount > 0 ? `<span class="severity-badge" style="background:${SEVERITY_COLORS.SERIOUS}">${p.seriousCount} serious</span>` : ''}
      <span style="font-size:10px;color:#6b7280">${p.issueCount} total</span>
    </div>
  </div>
  `).join('')}
  ` : ''}

  <!-- Issues Table -->
  <div class="page-break"></div>
  <h2>All Issues (${report.issues.length})</h2>
  <table>
    <thead>
      <tr>
        <th style="width:70px">Severity</th>
        <th style="width:40px">Step</th>
        <th>Category</th>
        <th>Issue</th>
        <th style="width:180px">URL</th>
      </tr>
    </thead>
    <tbody>
      ${report.issues.slice(0, 200).map((issue) => `
      <tr>
        <td><span class="severity-badge" style="background:${SEVERITY_COLORS[issue.severity] ?? '#6b7280'}">${escapeHtml(issue.severity)}</span></td>
        <td class="text-center">${issue.stepNumber}</td>
        <td>${escapeHtml(issue.category)}</td>
        <td>${escapeHtml(issue.message)}</td>
        <td style="font-size:9px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${issue.url ? escapeHtml(issue.url) : '—'}</td>
      </tr>
      `).join('')}
    </tbody>
  </table>
  ${report.issues.length > 200 ? `<p style="color:#6b7280;font-size:10px;margin-top:8px">Showing 200 of ${report.issues.length} issues. Export as CSV for the complete list.</p>` : ''}

  <div class="footer">
    Generated by SEO Audit Tool &middot; ${escapeHtml(completedDate)}
  </div>

</body>
</html>`;
}

function renderActionGroup(
  actions: ReportData['priorityActions'],
  title: string,
  borderColor: string
): string {
  if (actions.length === 0) return '';
  return `
    <h3>${escapeHtml(title)}</h3>
    ${actions.slice(0, 8).map((a) => `
    <div class="action-card" style="border-left-color:${borderColor}">
      <div class="action-header">
        <span class="severity-badge" style="background:${SEVERITY_COLORS[a.severity] ?? '#6b7280'}">${escapeHtml(a.severity)}</span>
        <span class="action-problem">${escapeHtml(a.category)}</span>
      </div>
      <div style="font-size:11px">${escapeHtml(a.problem)}</div>
      <div class="action-why">${escapeHtml(a.whyItMatters)}</div>
      <div class="action-fix"><strong>Fix:</strong> ${escapeHtml(a.howToFix)}</div>
      <div class="action-affected">${a.affectedPageCount} page${a.affectedPageCount !== 1 ? 's' : ''} affected${a.sampleUrls.length > 0 ? ` — e.g. ${a.sampleUrls.slice(0, 2).map((u) => escapeHtml(u)).join(', ')}` : ''}</div>
    </div>
    `).join('')}
  `;
}
