# Workflow: 4-Week PoC Execution Plan

## Sprint 1: Foundation & Knowledge Store (Days 1–5)
- Apply `terraform/main.tf` to spin up Cloud Storage, Document AI Layout Parser, Vertex AI Vector Search, and Cloud Run service foundations.
- Run `.agents/skills/graph-queries.cypher` on Neo4j to seed echelons.
- Parse public anchor documents listed in `docs/public-anchor-docs.md`.

## Sprint 2: Multi-Agent & Precedence Engine (Days 6–10)
- Implement `AuditorAgent` and `EditorAgent` using Vertex AI ADK.
- Enforce precedence: Federal > DoD > DAF > AFMC > PAE > Program Office.
- Integrate JIT ingestion trigger for unindexed policies.

## Sprint 3: Synthetic Workflow & Web Console (Days 11–15)
- Load sample files from `docs/synthetic-test-docs/`.
- Wire `src/web/` interface to the audit pipeline for real-time conflict inspection, interactive SVG echelon graph visualization, and redline diffs.
- Output redline diffs and downloadable Issue Memorandum (Doc E).

## Sprint 4: Cloud Run Deployment & Validation Demo (Days 16–20)
- Deploy web interface container to Google Cloud Run with HTTPS internet ingress and IAP access control.
- Conduct stakeholder live demo from public/authenticated web URL.
- Benchmark conflict recall and traceability against synthetic ground truth.
- Optimize cost and latency using Gemini 2.5 Flash for summarization tasks.
