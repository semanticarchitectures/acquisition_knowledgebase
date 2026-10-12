/**
 * USAF Acquisition Knowledgebase — Document Review Console Application
 * Client-side Controller & Simulation Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // Application State
  const state = {
    isAuditing: false,
    isResolved: false,
    complianceScore: 0.68,
    conflicts: [
      {
        conflict_id: "CONF-2026-001",
        higher_precedence_doc: {
          document_id: "Doc_A_ACE_Concept.md",
          echelon: "DAF",
          section: "Section 3: Communications Resilience"
        },
        lower_precedence_doc: {
          document_id: "Doc_D_Target_SRD.md",
          echelon: "Program_Office",
          section: "Section 4.2: Link Failover Parameters"
        },
        description: "Draft requirement in Doc D maintains a 60-second re-acquisition timer during SATCOM degradation, violating Doc A higher-echelon mandate requiring automated mesh fallback within 3 seconds.",
        proposed_resolution: "Update Doc D Section 4.2 to require automated fallback to local mesh networking within <= 3 seconds of SATCOM degradation.",
        severity: "CRITICAL"
      }
    ],
    missingPolicies: [
      "MIL-STD-6016C: Tactical Data Link 16 Message Standard"
    ]
  };

  // DOM Elements
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabPanels = document.querySelectorAll('.tab-panel');
  const btnRunAudit = document.getElementById('btn-run-audit');
  const btnInspectConflict = document.getElementById('btn-inspect-conflict');
  const btnAutoResolve = document.getElementById('btn-auto-resolve');
  const btnApplyRedline = document.getElementById('btn-apply-redline-diff');
  const btnResetDiff = document.getElementById('btn-reset-diff');
  const btnExportJson = document.getElementById('btn-export-json');
  const btnCopyMemo = document.getElementById('btn-copy-memo');
  const btnDownloadMemo = document.getElementById('btn-download-memo');
  const btnTriggerJit = document.getElementById('btn-trigger-jit');
  const resolveRowButtons = document.querySelectorAll('.btn-resolve-row');

  // Gauge & Stat Elements
  const gaugeProgressCircle = document.getElementById('gauge-progress-circle');
  const complianceScoreVal = document.getElementById('compliance-score-val');
  const complianceStatusBadge = document.getElementById('compliance-status-badge');
  const conflictsCountBadge = document.getElementById('conflicts-count-badge');
  const conflictsCountVal = document.getElementById('conflicts-count-val');
  const missingPoliciesVal = document.getElementById('missing-policies-val');
  const auditBanner = document.getElementById('audit-banner');
  const conflictsTableBody = document.getElementById('conflicts-table-body');
  const memoComplianceScore = document.getElementById('memo-compliance-score');

  // Diff Elements
  const targetDocBadge = document.getElementById('target-doc-badge');
  const targetHighlightBox = document.getElementById('target-highlight-box');
  const targetHighlightTag = document.getElementById('target-highlight-tag');
  const targetRequirementText = document.getElementById('target-requirement-text');
  const diffCodeDisplay = document.getElementById('diff-code-display');

  // 1. Tab Switching System
  function switchTab(targetTabId) {
    tabButtons.forEach(btn => {
      const isTarget = btn.getAttribute('data-target') === targetTabId;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    tabPanels.forEach(panel => {
      const isTarget = panel.id === `panel-${targetTabId}`;
      panel.classList.toggle('active', isTarget);
    });
  }

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const target = button.getAttribute('data-target');
      switchTab(target);
    });
  });

  // 2. Compliance Gauge Updates
  function updateGauge(score, isResolvedState) {
    // Circumference = 2 * PI * 50 = 314
    const circumference = 314;
    const offset = circumference - (circumference * score);
    gaugeProgressCircle.style.strokeDashoffset = offset;
    complianceScoreVal.textContent = score.toFixed(2);
    memoComplianceScore.textContent = `${score.toFixed(2)} / 1.00`;

    if (isResolvedState) {
      gaugeProgressCircle.style.stroke = 'var(--status-success)';
      complianceStatusBadge.className = 'badge badge-success';
      complianceStatusBadge.textContent = 'ALL POLICIES COMPLIANT';
    } else {
      gaugeProgressCircle.style.stroke = 'var(--status-warning)';
      complianceStatusBadge.className = 'badge badge-warning';
      complianceStatusBadge.textContent = 'ACTION REQUIRED';
    }
  }

  // 3. Resolve Redline Logic
  function applyResolution() {
    state.isResolved = true;
    state.complianceScore = 1.0;

    // Update gauge
    updateGauge(1.0, true);

    // Update Banner
    if (auditBanner) {
      auditBanner.className = 'audit-banner alert-resolved';
      auditBanner.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(14, 21, 38, 0.95))';
      auditBanner.style.borderColor = 'rgba(16, 185, 129, 0.35)';
      auditBanner.innerHTML = `
        <div class="banner-icon" style="color: var(--status-success);">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        </div>
        <div class="banner-content">
          <h2 class="banner-title" style="color: #6ee7b7;">Precedence Conflict Resolved: Doc D Aligned to DAF ACE C2</h2>
          <p class="banner-description">
            Failover timer successfully updated from 60 seconds to &le; 3 seconds. Requirement is fully compliant with Level 3 DAF doctrine.
          </p>
        </div>
        <div class="banner-actions">
          <button class="btn btn-secondary btn-sm" id="btn-banner-view-diff" type="button">Inspect Redlines</button>
        </div>
      `;
      document.getElementById('btn-banner-view-diff')?.addEventListener('click', () => switchTab('diff'));
    }

    // Update Stats
    conflictsCountBadge.className = 'badge badge-success';
    conflictsCountBadge.textContent = '0 ACTIVE';
    conflictsCountVal.className = 'metric-number text-success';
    conflictsCountVal.textContent = '0';

    // Update Table
    conflictsTableBody.innerHTML = `
      <tr>
        <td><code>CONF-2026-001</code></td>
        <td><span class="badge badge-success">RESOLVED</span></td>
        <td>
          <strong>Doc A: ACE C2 Concept</strong><br>
          <small class="text-muted">Echelon: DAF (Level 3) • Sec 3</small><br>
          <span class="code-pill">Threshold: 3 sec max</span>
        </td>
        <td>
          <strong>Doc D: Target SRD (Redlined)</strong><br>
          <small class="text-muted">Echelon: Program Office (Level 6) • Sec 4.2</small><br>
          <span class="code-pill" style="background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.3); color: #6ee7b7;">Aligned: &le; 3 sec</span>
        </td>
        <td>
          Redline applied. Automated fallback aligned with DAF ACE C2 communications doctrine.
        </td>
        <td>
          <span class="badge badge-success">COMPLETED</span>
        </td>
      </tr>
    `;

    // Update Diff Pane
    targetDocBadge.className = 'badge badge-success';
    targetDocBadge.textContent = 'COMPLIANT REDLINE';
    targetHighlightBox.className = 'diff-highlight-box mandate-box';
    targetHighlightTag.className = 'highlight-tag';
    targetHighlightTag.textContent = 'ALIGNED THRESHOLD';
    targetRequirementText.innerHTML = `"In the event of SATCOM signal attenuation or jamming, the system shall provide automated fallback to local mesh networking within <mark class="mark-mandate">3 seconds</mark> of SATCOM degradation in compliance with DAF ACE C2 Operational Concept (2026)."`;

    diffCodeDisplay.innerHTML = `<code>--- a/Doc_D_Target_SRD.md (Section 4.2: Link Failover Parameters)
+++ b/Doc_D_Target_SRD.md (Section 4.2: Link Failover Parameters)
@@ -1,5 +1,5 @@
- In the event of SATCOM signal attenuation or jamming, the system shall maintain a re-acquisition timer of 60 seconds before switching operational modes to local tactical data links.
+ In the event of SATCOM signal attenuation or jamming, the system shall provide automated fallback to local mesh networking within 3 seconds of SATCOM degradation in compliance with DAF ACE C2 Operational Concept (2026).

[STATUS: REDLINE APPROVED AND APPLIED]</code>`;
  }

  // 4. Reset Diff to Original
  function resetResolution() {
    state.isResolved = false;
    state.complianceScore = 0.68;
    updateGauge(0.68, false);
    location.reload();
  }

  // 5. Run Full Audit Simulation
  btnRunAudit?.addEventListener('click', () => {
    btnRunAudit.disabled = true;
    btnRunAudit.innerHTML = `
      <svg class="btn-icon" style="animation: spin 1s linear infinite;" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="2" x2="12" y2="6"></line>
        <line x1="12" y1="18" x2="12" y2="22"></line>
        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
        <line x1="2" y1="12" x2="6" y2="12"></line>
        <line x1="18" y1="12" x2="22" y2="12"></line>
        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
        <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
      </svg>
      <span>Auditing Knowledge Store...</span>
    `;

    setTimeout(() => {
      btnRunAudit.disabled = false;
      btnRunAudit.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span>Run Audit Simulation</span>
      `;
      alert("Vertex AI ADK Audit Completed.\nScanned: 7 Documents.\nResult: 1 Precedence Conflict Detected (CONF-2026-001).");
    }, 1200);
  });

  // 6. Event Listeners for Actions
  btnInspectConflict?.addEventListener('click', () => switchTab('diff'));
  btnAutoResolve?.addEventListener('click', () => {
    applyResolution();
    switchTab('diff');
  });
  btnApplyRedline?.addEventListener('click', applyResolution);
  btnResetDiff?.addEventListener('click', resetResolution);

  resolveRowButtons.forEach(btn => {
    btn.addEventListener('click', () => switchTab('diff'));
  });

  // 7. JIT Ingestion Simulation
  btnTriggerJit?.addEventListener('click', () => {
    btnTriggerJit.disabled = true;
    btnTriggerJit.textContent = 'Parsing & Indexing...';
    setTimeout(() => {
      btnTriggerJit.textContent = 'Indexed in Vector Search';
      missingPoliciesVal.textContent = '0';
      missingPoliciesVal.className = 'metric-number text-success';
      const item = document.querySelector('.policy-item');
      if (item) {
        item.innerHTML = `
          <div class="policy-icon" style="color: var(--status-success);">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <div class="policy-info">
            <div class="policy-name">MIL-STD-6016C: Tactical Data Link (TDL) 16 Message Standard</div>
            <div class="policy-meta">Indexed in Vertex AI Vector Search • Embeddings: text-embedding-004</div>
          </div>
          <span class="badge badge-success">INDEXED</span>
        `;
      }
    }, 1000);
  });

  // 8. Export JSON (Compliant with audit-schema.json)
  btnExportJson?.addEventListener('click', () => {
    const reportData = {
      "$schema": "http://json-schema.org/draft-07/schema#",
      "title": "AuditReport",
      "timestamp": new Date().toISOString(),
      "missing_policies_detected": state.isResolved ? [] : state.missingPolicies,
      "conflicts_found": state.isResolved ? [] : state.conflicts,
      "compliance_score": state.complianceScore
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-report-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // 9. Copy & Download Memorandum (Doc E)
  btnCopyMemo?.addEventListener('click', () => {
    const memoText = document.getElementById('memo-paper-content')?.innerText || '';
    navigator.clipboard.writeText(memoText).then(() => {
      const origText = btnCopyMemo.textContent;
      btnCopyMemo.textContent = 'Copied to Clipboard!';
      setTimeout(() => btnCopyMemo.textContent = origText, 2000);
    });
  });

  btnDownloadMemo?.addEventListener('click', () => {
    const memoContent = document.getElementById('memo-paper-content')?.innerText || '';
    const blob = new Blob([memoContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Issue_Memorandum_Doc_E_${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Interactive Node clicks in hierarchy
  document.querySelectorAll('.echelon-node').forEach(node => {
    node.addEventListener('click', () => {
      const level = node.getAttribute('data-level');
      const title = node.querySelector('.node-title')?.textContent;
      const doc = node.querySelector('.node-doc')?.textContent;
      alert(`Echelon Level ${level}: ${title}\nAuthority: Strict precedence over lower numeric levels.\nActive Document: ${doc}`);
    });
  });

  // Initial render of gauge
  updateGauge(state.complianceScore, false);
});
