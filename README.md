# USAF Acquisition Document Review System (PoC)

An intelligent, multi-agent document review and compliance auditing platform built on **Google Antigravity**, **Vertex AI**, and **Google Cloud**. The system ingests defense acquisition documents, models echelon authority and precedence relationships in a knowledge graph, and automatically audits candidate requirement documents against higher-echelon mandates to detect policy conflicts, compute compliance scores, and generate redline resolutions.

---

## Table of Contents
- [Overview](#overview)
- [Precedence Rules Engine](#precedence-rules-engine)
- [Repository Structure](#repository-structure)
- [System Architecture](#system-architecture)
- [Web Interface & Internet Access](#web-interface--internet-access)
- [Quickstart Guide](#quickstart-guide)
  - [1. Running the Web Interface Locally](#1-running-the-web-interface-locally)
  - [2. Deploying to Google Cloud Run (Internet Access)](#2-deploying-to-google-cloud-run-internet-access)
- [Synthetic Test Scenario](#synthetic-test-scenario)
- [Sprint Roadmap](#sprint-roadmap)

---

## Overview

Modern defense acquisition programs operate under dense, multi-echelon regulatory frameworks spanning Federal law down to program-office specifications. Changes to high-level operational concepts (e.g., Agile Combat Employment) often conflict with draft System Requirements Documents (SRDs) without immediate visibility.

This system provides:
1. **Automated Document Layout Parsing**: Multi-tier extraction (summaries, section outlines, verbatim chunks) via Document AI.
2. **Echelon Precedence Modeling**: Graph-based lineage enforcing legal and operational authority over requirements.
3. **Multi-Agent Conflict Detection**: Vertex AI ADK agents (`AuditorAgent`, `EditorAgent`) that locate conflicting thresholds, calculate compliance scores, and propose redlines.
4. **Internet-Accessible Web Console**: A dark-mode, responsive user interface allowing program managers, systems engineers, and auditors to review findings, visualize authority graphs, and export formal Issue Memorandums.

---

## Precedence Rules Engine

Policy and requirements conflicts are resolved using two strict operational heuristics:

### 1. Echelon Authority Hierarchy
Higher-echelon policies strictly supersede lower-echelon documents:
```
Federal (Level 1)
   └── DoD (Level 2)
        └── DAF - Department of the Air Force (Level 3)
             └── AFMC - Air Force Materiel Command (Level 4)
                  └── PAE_C3BM - PEO C3BM (Level 5)
                       └── Program_Office (Level 6)
```

### 2. Temporal Precedence Rule
Within the same echelon, newer effective dates supersede older requirements, while never overriding mandates from a superior echelon.

---

## Repository Structure

```text
acquisition_knowledgebase/
├── .agents/
│   ├── skills/
│   │   ├── audit-schema.json          # Draft-07 JSON Schema for structured audit reports
│   │   └── graph-queries.cypher        # Neo4j Cypher queries establishing the 6-level echelon graph
│   └── workflows/
│       └── 01-sprint-plan.md          # 4-Week PoC execution plan across Sprints 1 to 4
├── docs/
│   ├── architecture.md               # 5-Layer system specification and ingress design
│   ├── public-anchor-docs.md         # Baseline spine authority documents (NDS, DoDD 5000.01, etc.)
│   └── synthetic-test-docs/
│       ├── Doc_A_ACE_Concept.md       # DAF-level ACE concept (3-second SATCOM failover threshold)
│       └── Doc_D_Target_SRD.md        # Program Office draft SRD (60-second timer - intentional conflict)
├── src/
│   ├── agents/                       # Multi-agent orchestrators, Auditor, and Editor agents
│   ├── tools/                        # Integration tools (Vertex AI Vector Search, Neo4j driver)
│   └── web/                          # Internet-accessible Web Interface application
│       ├── index.html                # Responsive console UI shell
│       ├── styles.css                # Premium dark-mode aerospace styling & design tokens
│       ├── app.js                    # Dynamic dashboard, SVG hierarchy graph & audit runner
│       └── server.py                 # Zero-dependency Python HTTP server & REST API
├── terraform/
│   └── main.tf                       # GCP provisioning (GCS, Document AI, Cloud Run internet service)
├── antigravity-initialize-poc.sh     # Bootstrapping script for workspace scaffolding
├── Dockerfile                        # Production container image for Google Cloud Run deployment
├── mcp_config.json                   # Model Context Protocol configuration (Cloud Run & Vertex AI)
└── .gitignore                        # Git ignore rules for Python, Node, Terraform, and secrets
```

---

## System Architecture

The system is organized into five decoupled layers:

```
┌────────────────────────────────────────────────────────────────────────┐
│               LAYER 5: Web Presentation & Ingress                      │
│   Cloud Run (HTTPS / IAP)  ──  Web Console (Dashboard / Diffs / Graph) │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ REST / WebSocket
┌────────────────────────────────────▼───────────────────────────────────┐
│               LAYER 4: Multi-Agent Orchestration                       │
│    Vertex AI ADK: OrchestratorAgent  ──  AuditorAgent  ──  EditorAgent │
└──────────────────────┬───────────────────────────────┬─────────────────┘
                       │                               │
┌──────────────────────▼──────────┐ ┌──────────────────▼─────────────────┐
│  LAYER 3A: Vector Knowledge     │ │   LAYER 3B: Precedence Graph       │
│  Vertex AI Vector Search        │ │   Neo4j ([:AUTHORITY_OVER] Graph)  │
│  (text-embedding-004)           │ │   Echelon & Temporal Hierarchy     │
└─────────────────────────────────┘ └────────────────────────────────────┘
                       ▲
                       │ Multi-Tier Chunks (Summaries / Outlines / Verbatim)
┌──────────────────────┴─────────────────────────────────────────────────┐
│               LAYER 1 & 2: Parsing & Representation                    │
│   Document AI Layout Parser  ──  Markdown, Structured Tables, Metadata │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Web Interface & Internet Access

The Web Console provides an intuitive, web-accessible interface for operational personnel:

- **Audit Overview Dashboard**: Key metrics, compliance gauge, missing policy notices, and conflict counters.
- **Echelon Precedence Graph**: Interactive SVG visualization of the authority hierarchy and relationship edges.
- **Side-by-Side Redline Diff**: Live comparative analysis between higher-echelon mandates (e.g., Doc A) and target requirements (e.g., Doc D) highlighting parameter discrepancies.
- **Schema-Compliant Reporting**: Generates structured reports conforming to [.agents/skills/audit-schema.json](.agents/skills/audit-schema.json) with downloadable Issue Memorandums.
- **Internet Access Topology**:
  - Hosted as a serverless container on **Google Cloud Run**.
  - Accessible via internet HTTPS with custom domain mapping (`https://acquisition-audit.mil` or Cloud Run URL).
  - Integrates with **Google Cloud Identity-Aware Proxy (IAP)** to enforce DoD Common Access Card (CAC) / Zero-Trust OAuth identity before granting ingress.

---

## Quickstart Guide

### 1. Running the Web Interface Locally

You can run the web console immediately without any third-party dependencies using Python 3:

```bash
# Navigate to repository root
cd acquisition_knowledgebase

# Launch the lightweight web server (defaults to port 8080)
python3 src/web/server.py

# Or specify a custom port
PORT=9000 python3 src/web/server.py
```

Open your browser to:
👉 **`http://localhost:8080`**

From the web console, click **"Run Audit Simulation"** to trigger a real-time audit comparing `Doc A` against `Doc D`.

---

### 2. Deploying to Google Cloud Run (Internet Access)

To deploy the container to Google Cloud Run for public or authenticated internet access:

```bash
# Set your GCP Project ID
export PROJECT_ID="your-gcp-project-id"
export REGION="us-central1"

# 1. Build and push container to Google Artifact Registry
gcloud builds submit --tag ${REGION}-docker.pkg.dev/${PROJECT_ID}/acquisition-repo/web-console:latest .

# 2. Deploy to Cloud Run
gcloud run deploy acquisition-web-console \
  --image ${REGION}-docker.pkg.dev/${PROJECT_ID}/acquisition-repo/web-console:latest \
  --region ${REGION} \
  --platform managed \
  --allow-unauthenticated \
  --port 8080

# 3. View the live URL printed by Cloud Run:
# https://acquisition-web-console-xxxxx-uc.a.run.app
```

Alternatively, use the provided Terraform manifest:
```bash
cd terraform
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

---

## Synthetic Test Scenario

The repository includes a benchmark conflict scenario in `docs/synthetic-test-docs/`:

1. **[Doc_A_ACE_Concept.md](docs/synthetic-test-docs/Doc_A_ACE_Concept.md)** (*Echelon: DAF, Level 3*):
   > "All tactical communications systems SHALL provide automated fallback to local mesh networking within **3 seconds** of SATCOM degradation."
2. **[Doc_D_Target_SRD.md](docs/synthetic-test-docs/Doc_D_Target_SRD.md)** (*Echelon: Program Office, Level 6*):
   > "the system shall maintain a re-acquisition timer of **60 seconds** before switching operational modes to local tactical data links."

**Expected Audit Finding**:
- **Conflict Severity**: `CRITICAL`
- **Violation**: Lower-echelon SRD (60s) violates higher-echelon DAF requirement (3s).
- **Proposed Redline**: Update Section 4.2 of Doc D to align failover timer to $\le 3\text{ seconds}$.

---

## Sprint Roadmap

- **Sprint 1 (Days 1–5)**: Foundation & Knowledge Store (Terraform, Neo4j echelon seed, Document AI parsing).
- **Sprint 2 (Days 6–10)**: Multi-Agent & Precedence Engine (`AuditorAgent`, `EditorAgent`, JIT ingestion).
- **Sprint 3 (Days 11–15)**: Synthetic Workflow & Web Console (Redline diff UI, Audit reports, Issue Memorandums).
- **Sprint 4 (Days 16–20)**: Cloud Run internet deployment, validation benchmarking, and cost optimization.
