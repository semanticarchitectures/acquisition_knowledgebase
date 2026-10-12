/**
 * USAF Acquisition Knowledgebase — Document Review Console Application
 * Client-side Controller, File Upload Handler, Markdown Renderer & Persistence Engine
 */

document.addEventListener('DOMContentLoaded', () => {
  // Application State
  const state = {
    isAuditing: false,
    isResolved: false,
    complianceScore: 0.68,
    uploadedFile: null,
    conflicts: [
      {
        conflict_id: "CONF-2026-001",
        higher_precedence_doc: {
          document_id: "DOC-001",
          title: "Doc A: Updated ACE C2 Operational Concept (2026)",
          echelon: "DAF",
          section: "Section 3: Communications Resilience"
        },
        lower_precedence_doc: {
          document_id: "DOC-002",
          title: "Doc D: Target SRD (Draft)",
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

  // DOM Elements - Navigation & Core Controls
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

  // Upload Panel Elements
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const dropzoneFileInfo = document.getElementById('dropzone-file-info');
  const selectedFileName = document.getElementById('selected-file-name');
  const inputDocTitle = document.getElementById('input-doc-title');
  const selectDocEchelon = document.getElementById('select-doc-echelon');
  const textareaDocContent = document.getElementById('textarea-doc-content');
  const btnSubmitUpload = document.getElementById('btn-submit-upload');
  const btnLoadSampleDoc = document.getElementById('btn-load-sample-doc');
  const uploadResultContainer = document.getElementById('upload-result-container');
  const resultReviewHeading = document.getElementById('result-review-heading');
  const resultLinksBar = document.getElementById('result-links-bar');
  const markdownRenderedView = document.getElementById('markdown-rendered-view');

  // History & Semantic DB Elements
  const semanticDbTbody = document.getElementById('semantic-db-tbody');
  const btnRefreshHistory = document.getElementById('btn-refresh-history');
  const historyReviewViewerCard = document.getElementById('history-review-viewer-card');
  const historyViewerTitle = document.getElementById('history-viewer-title');
  const historyMarkdownViewer = document.getElementById('history-markdown-viewer');
  const btnCloseHistoryViewer = document.getElementById('btn-close-history-viewer');

  // 1. Tab Navigation
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

    if (targetTabId === 'history') {
      loadSemanticDbAndHistory();
    }
  }

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const target = button.getAttribute('data-target');
      switchTab(target);
    });
  });

  // 2. Compliance Gauge Updates
  function updateGauge(score, isResolvedState) {
    const circumference = 314;
    const offset = circumference - (circumference * score);
    gaugeProgressCircle.style.strokeDashoffset = offset;
    complianceScoreVal.textContent = score.toFixed(2);
    if (memoComplianceScore) {
      memoComplianceScore.textContent = `${score.toFixed(2)} / 1.00`;
    }

    if (score >= 0.95 || isResolvedState) {
      gaugeProgressCircle.style.stroke = 'var(--status-success)';
      complianceStatusBadge.className = 'badge badge-success';
      complianceStatusBadge.textContent = 'ALL POLICIES COMPLIANT';
    } else {
      gaugeProgressCircle.style.stroke = 'var(--status-warning)';
      complianceStatusBadge.className = 'badge badge-warning';
      complianceStatusBadge.textContent = 'ACTION REQUIRED';
    }
  }

  // 3. Lightweight Markdown-to-HTML Renderer
  function renderMarkdown(md) {
    if (!md) return '';
    let lines = md.split('\n');
    let html = '';
    let inTable = false;
    let inCode = false;
    let codeBuffer = '';

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Code blocks
      if (line.trim().startsWith('```')) {
        if (inCode) {
          inCode = false;
          html += `<pre><code>${escapeHtml(codeBuffer)}</code></pre>\n`;
          codeBuffer = '';
        } else {
          inCode = true;
          codeBuffer = '';
        }
        continue;
      }
      if (inCode) {
        codeBuffer += line + '\n';
        continue;
      }

      // Tables
      if (line.trim().startsWith('|')) {
        if (!inTable) {
          inTable = true;
          html += '<table class="data-table"><tbody>';
        }
        if (line.includes('---')) {
          continue; // Separator row
        }
        let cells = line.split('|').filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
        let isHeader = (i > 0 && lines[i+1] && lines[i+1].includes('---'));
        html += '<tr>' + cells.map(c => {
          let cellContent = formatInline(c.trim());
          return isHeader ? `<th>${cellContent}</th>` : `<td>${cellContent}</td>`;
        }).join('') + '</tr>\n';
        continue;
      } else if (inTable) {
        inTable = false;
        html += '</tbody></table>\n';
      }

      // Headers
      if (line.startsWith('### ')) {
        html += `<h3>${formatInline(line.substring(4))}</h3>\n`;
      } else if (line.startsWith('## ')) {
        html += `<h2>${formatInline(line.substring(3))}</h2>\n`;
      } else if (line.startsWith('# ')) {
        html += `<h1>${formatInline(line.substring(2))}</h1>\n`;
      } else if (line.startsWith('- ')) {
        html += `<li>${formatInline(line.substring(2))}</li>\n`;
      } else if (line.trim() === '---') {
        html += '<hr style="border:none; border-top:1px solid rgba(255,255,255,0.1); margin:1.25rem 0;">\n';
      } else if (line.trim().length > 0) {
        html += `<p>${formatInline(line)}</p>\n`;
      }
    }

    if (inTable) html += '</tbody></table>\n';
    if (inCode) html += `<pre><code>${escapeHtml(codeBuffer)}</code></pre>\n`;
    return html;
  }

  function formatInline(str) {
    return str
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="code-pill">$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="table-link">$1 ↗</a>');
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // 4. File Upload & Ingestion Logic
  dropzone?.addEventListener('click', () => fileInput.click());

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone?.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  fileInput?.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  });

  function handleFileSelected(file) {
    state.uploadedFile = file;
    dropzoneFileInfo.style.display = 'flex';
    selectedFileName.textContent = file.name;
    inputDocTitle.value = file.name.replace(/\.[^/.]+$/, "").replace(/_/g, " ");

    const reader = new FileReader();
    reader.onload = (evt) => {
      textareaDocContent.value = evt.target.result;
    };
    reader.readAsText(file);
  }

  // Load Sample Doc
  btnLoadSampleDoc?.addEventListener('click', () => {
    inputDocTitle.value = "Doc D: Tactical Data Link System Requirements Document (Draft)";
    selectDocEchelon.value = "6";
    selectedFileName.textContent = "Doc_D_Target_SRD.md";
    dropzoneFileInfo.style.display = 'flex';
    textareaDocContent.value = `# Doc D: Tactical Data Link System Requirements Document (Draft)

## Section 4.2: Link Failover Parameters
In the event of SATCOM signal attenuation or jamming, the system shall maintain a re-acquisition timer of 60 seconds before switching operational modes to local tactical data links.`;
  });

  // Submit Upload & Audit
  btnSubmitUpload?.addEventListener('click', async () => {
    const filename = state.uploadedFile ? state.uploadedFile.name : (selectedFileName.textContent || "uploaded_doc.md");
    const content = textareaDocContent.value.trim();
    const title = inputDocTitle.value.trim() || filename;
    const echelonLevel = parseInt(selectDocEchelon.value, 10);
    const echelonOption = selectDocEchelon.options[selectDocEchelon.selectedIndex];
    const echelonName = echelonOption.getAttribute('data-name') || "Program_Office";

    if (!content) {
      alert("Please provide document content to upload and audit.");
      return;
    }

    btnSubmitUpload.disabled = true;
    btnSubmitUpload.innerHTML = `
      <svg class="btn-icon" style="animation: spin 1s linear infinite;" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
      </svg>
      <span>Ingesting &amp; Auditing via Vertex AI ADK...</span>
    `;

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: filename,
          content: content,
          title: title,
          echelon_level: echelonLevel,
          echelon_name: echelonName
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const result = await response.json();

      // Show result card
      uploadResultContainer.style.display = 'block';
      resultReviewHeading.textContent = `Review Generated: ${result.review_id} for ${result.document_id}`;

      resultLinksBar.innerHTML = `
        <a href="${result.original_document_url}" target="_blank" class="table-link">📄 Original Document (${result.document_id}) ↗</a>
        <a href="${result.summary_url}" target="_blank" class="table-link text-cyan">📋 Tier 1 Summary.md ↗</a>
        <button class="btn btn-xs btn-secondary" id="btn-download-new-review" type="button">⬇ Download Review.md</button>
      `;

      document.getElementById('btn-download-new-review')?.addEventListener('click', () => {
        downloadTextFile(`${result.review_id}_Audit_Review.md`, result.review_markdown);
      });

      // Render Markdown review report
      markdownRenderedView.innerHTML = renderMarkdown(result.review_markdown);

      // Update state & overview
      state.complianceScore = result.compliance_score;
      updateGauge(result.compliance_score, result.compliance_score >= 0.95);

      // Update overview target document info
      const overviewDocName = document.getElementById('overview-target-doc-name');
      if (overviewDocName) overviewDocName.textContent = title;

      // Update conflicts table
      if (result.conflicts && result.conflicts.length > 0) {
        conflictsCountVal.textContent = result.conflicts.length;
        conflictsCountVal.className = 'metric-number text-danger';
        conflictsCountBadge.textContent = `${result.conflicts.length} CRITICAL`;
        conflictsCountBadge.className = 'badge badge-danger';
        conflictsTableBody.innerHTML = result.conflicts.map(c => `
          <tr>
            <td><code>${c.conflict_id}</code></td>
            <td><span class="badge badge-danger">${c.severity}</span></td>
            <td>
              <strong>${c.higher_precedence_doc.title}</strong><br>
              <small class="text-muted">Echelon: ${c.higher_precedence_doc.echelon} • ${c.higher_precedence_doc.section}</small>
            </td>
            <td>
              <strong>${c.lower_precedence_doc.title}</strong><br>
              <small class="text-muted">Echelon: ${c.lower_precedence_doc.echelon} • ${c.lower_precedence_doc.section}</small>
            </td>
            <td>${c.description}</td>
            <td><button class="btn btn-xs btn-primary btn-resolve-row" data-conflict="${c.conflict_id}">Review &amp; Redline</button></td>
          </tr>
        `).join('');
      } else {
        conflictsCountVal.textContent = '0';
        conflictsCountVal.className = 'metric-number text-success';
        conflictsCountBadge.textContent = '0 ACTIVE';
        conflictsCountBadge.className = 'badge badge-success';
        conflictsTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#10b981;">No active conflicts. Document conforms to echelon rules.</td></tr>`;
      }

      // Scroll to review result
      uploadResultContainer.scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
      alert(`Error during upload and audit: ${err.message}`);
    } finally {
      btnSubmitUpload.disabled = false;
      btnSubmitUpload.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <span>Ingest Document &amp; Run Automated Review</span>
      `;
    }
  });

  // 5. Semantic Database & History Loader
  async function loadSemanticDbAndHistory() {
    try {
      const response = await fetch('/api/semantic-db');
      if (!response.ok) return;
      const data = await response.json();
      const docs = data.documents || [];

      semanticDbTbody.innerHTML = docs.map(doc => {
        const review = (doc.reviews && doc.reviews.length > 0) ? doc.reviews[0] : null;
        const reviewCell = review
          ? `<button class="btn btn-xs btn-primary btn-open-review-modal" data-review="${review.review_id}" type="button">${review.review_id}.md ↗</button>`
          : `<span class="text-muted">— Governing Anchor —</span>`;

        const complianceBadge = review
          ? (review.compliance_score >= 0.95 ? `<span class="badge badge-success">${review.compliance_score.toFixed(2)} COMPLIANT</span>` : `<span class="badge badge-danger">${review.compliance_score.toFixed(2)} ACTION REQ</span>`)
          : `<span class="badge badge-success">ANCHOR</span>`;

        return `
          <tr>
            <td><code>${doc.document_id}</code></td>
            <td>
              <strong>${doc.title}</strong><br>
              <small class="text-muted">${doc.filename}</small>
            </td>
            <td><span class="badge badge-neutral">Level ${doc.echelon.level} (${doc.echelon.name})</span></td>
            <td><a href="${doc.original_document_url}" target="_blank" class="table-link">Original Doc ↗</a></td>
            <td><a href="${doc.summary_url}" target="_blank" class="table-link text-cyan">Summary.md ↗</a></td>
            <td>${reviewCell}</td>
            <td>${complianceBadge}</td>
          </tr>
        `;
      }).join('');

      // Wire review reader buttons
      document.querySelectorAll('.btn-open-review-modal').forEach(btn => {
        btn.addEventListener('click', () => {
          const revId = btn.getAttribute('data-review');
          openReviewViewer(revId);
        });
      });

    } catch (err) {
      console.error("Failed to load semantic database:", err);
    }
  }

  // Open review viewer in history panel
  async function openReviewViewer(reviewId) {
    try {
      const res = await fetch(`/api/reviews/${reviewId}?raw=1`);
      if (!res.ok) throw new Error("Could not load review");
      const md = await res.text();

      historyReviewViewerCard.style.display = 'block';
      historyViewerTitle.textContent = `Review Document: ${reviewId}`;
      historyMarkdownViewer.innerHTML = renderMarkdown(md);
      historyReviewViewerCard.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      alert(`Failed to load review: ${e.message}`);
    }
  }

  btnCloseHistoryViewer?.addEventListener('click', () => {
    historyReviewViewerCard.style.display = 'none';
  });

  btnRefreshHistory?.addEventListener('click', loadSemanticDbAndHistory);

  // 6. Redline Resolution Simulation
  function applyResolution() {
    state.isResolved = true;
    state.complianceScore = 1.0;
    updateGauge(1.0, true);

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

    conflictsCountBadge.className = 'badge badge-success';
    conflictsCountBadge.textContent = '0 ACTIVE';
    conflictsCountVal.className = 'metric-number text-success';
    conflictsCountVal.textContent = '0';

    if (targetDocBadge) {
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

    // Call server resolve API
    fetch('/api/audit/resolve', { method: 'POST' }).catch(() => {});
  }

  function resetResolution() {
    state.isResolved = false;
    state.complianceScore = 0.68;
    updateGauge(0.68, false);
    location.reload();
  }

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

  // 8. Download Helper
  function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  btnExportJson?.addEventListener('click', () => {
    const reportData = {
      "$schema": "http://json-schema.org/draft-07/schema#",
      "title": "AuditReport",
      "timestamp": new Date().toISOString(),
      "missing_policies_detected": state.isResolved ? [] : state.missingPolicies,
      "conflicts_found": state.isResolved ? [] : state.conflicts,
      "compliance_score": state.complianceScore
    };
    downloadTextFile(`audit-report-${Date.now()}.json`, JSON.stringify(reportData, null, 2));
  });

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
    downloadTextFile(`Issue_Memorandum_Doc_E_${Date.now()}.md`, memoContent);
  });

  // 9. Initial Load
  updateGauge(state.complianceScore, false);
  loadSemanticDbAndHistory();
});
