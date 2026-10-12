# Architecture Specification: USAF Acquisition Document Review System

## System Layers
1. **Document Parsing:** Document AI Layout Parser extracts structured Markdown & Tables.
2. **Multi-Tier Representation:**
   - Tier 1: Executive Summary (Markdown)
   - Tier 2: Section Map Outline
   - Tier 3: Dense Verbatim Chunks
3. **Knowledge Store:**
   - Vector Store: Vertex AI Vector Search (Embeddings: `text-embedding-004`)
   - Graph Database: Neo4j (Lineage & Precedence)
4. **Agentic Framework:** Vertex AI Agent Development Kit (ADK) running Orchestrator, Auditor, and Editor agents.
5. **Web Presentation & Ingress Layer:**
   - **Interactive Web Console:** Responsive single-page application (`src/web/`) providing real-time document auditing, side-by-side redline diffs, interactive echelon authority graph visualizations, and formal Issue Memorandum generation.
   - **Hosting Runtime:** Containerized deployment on **Google Cloud Run** with automatic autoscaling, health checks, and HTTPS TLS termination.
   - **Internet Access & Zero-Trust Ingress:** Public internet accessibility routed through Google Cloud Load Balancing with optional **Identity-Aware Proxy (IAP)** enforcing DoD Common Access Card (CAC) / Zero-Trust OAuth identity before traffic reaches the application.
   - **API Gateway & Orchestration:** Lightweight RESTful and asynchronous endpoints connecting user interface actions to Vertex AI ADK agent workflows.

## Precedence Rules Engine
1. **Echelon Hierarchy:** `Federal > DoD > DAF > AFMC > PAE > Program Office`
   - Policies issued by superior echelons strictly override conflicting terms in lower-echelon documents.
2. **Temporal Rule:**
   - Newer effective dates supersede older policies within the same echelon.
   - Temporal precedence cannot override echelon hierarchy.

## Internet Ingress & Deployment Topology
```
[Authorized Users via Internet]
              │
              ▼ HTTPS (443) / Custom Domain
[Google Cloud Load Balancer / CDN]
              │
              ▼ Identity Enforcement (Optional CAC / IAP)
[Google Cloud Identity-Aware Proxy (IAP)]
              │
              ▼ Authenticated Ingress
[Google Cloud Run Service: acquisition-web-console]
              │
              ├── Static Assets (HTML5 / Vanilla CSS / Vanilla JS)
              └── REST API Endpoints (/api/audit, /api/hierarchy, /api/health)
                      │
                      ├──► [Vertex AI ADK Multi-Agent Orchestrator]
                      │         ├── AuditorAgent
                      │         └── EditorAgent
                      │
                      ├──► [Vertex AI Vector Search (text-embedding-004)]
                      └──► [Neo4j Echelon Authority Graph]
```
