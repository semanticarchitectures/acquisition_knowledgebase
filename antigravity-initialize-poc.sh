#!/usr/bin/env bash
set -e

echo "Initializing Google Antigravity USAF Acquisition PoC Directory Structure..."

# 1. Create Directory Hierarchy
mkdir -p .agents/skills
mkdir -p .agents/workflows
mkdir -p docs/synthetic-test-docs
mkdir -p terraform
mkdir -p src/agents
mkdir -p src/tools

# 2. Create Model Context Protocol (MCP) Configuration
cat << 'EOF' > mcp_config.json
{
  "mcpServers": {
    "cloudrun": {
      "command": "npx",
      "args": ["-y", "@google-cloud/cloud-run-mcp"]
    },
    "vertexai": {
      "command": "npx",
      "args": ["-y", "@google-cloud/vertexai-mcp"]
    }
  }
}
EOF

# 3. Create Cypher Schema Skill File
cat << 'EOF' > .agents/skills/graph-queries.cypher
// Initialize Echelon Hierarchy Nodes
MERGE (f:Echelon {name: 'Federal', level: 1})
MERGE (d:Echelon {name: 'DoD', level: 2})
MERGE (a:Echelon {name: 'DAF', level: 3})
MERGE (m:Echelon {name: 'AFMC', level: 4})
MERGE (p:Echelon {name: 'PAE_C3BM', level: 5})
MERGE (o:Echelon {name: 'Program_Office', level: 6});

// Establish Authority Relationships
MATCH (f:Echelon {name: 'Federal'}), (d:Echelon {name: 'DoD'}) MERGE (f)-[:AUTHORITY_OVER]->(d);
MATCH (d:Echelon {name: 'DoD'}), (a:Echelon {name: 'DAF'}) MERGE (d)-[:AUTHORITY_OVER]->(a);
MATCH (a:Echelon {name: 'DAF'}), (m:Echelon {name: 'AFMC'}) MERGE (a)-[:AUTHORITY_OVER]->(m);
MATCH (m:Echelon {name: 'AFMC'}), (p:Echelon {name: 'PAE_C3BM'}) MERGE (m)-[:AUTHORITY_OVER]->(p);
MATCH (p:Echelon {name: 'PAE_C3BM'}), (o:Echelon {name: 'Program_Office'}) MERGE (p)-[:AUTHORITY_OVER]->(o);
EOF

# 4. Create Pydantic Schema Skill File
cat << 'EOF' > .agents/skills/audit-schema.json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AuditReport",
  "type": "object",
  "properties": {
    "missing_policies_detected": {
      "type": "array",
      "items": { "type": "string" }
    },
    "conflicts_found": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "conflict_id": { "type": "string" },
          "higher_precedence_doc": {
            "type": "object",
            "properties": {
              "document_id": { "type": "string" },
              "echelon": { "type": "string" },
              "section": { "type": "string" }
            },
            "required": ["document_id", "echelon", "section"]
          },
          "lower_precedence_doc": {
            "type": "object",
            "properties": {
              "document_id": { "type": "string" },
              "echelon": { "type": "string" },
              "section": { "type": "string" }
            },
            "required": ["document_id", "echelon", "section"]
          },
          "description": { "type": "string" },
          "proposed_resolution": { "type": "string" },
          "severity": { "type": "string", "enum": ["CRITICAL", "MAJOR", "MINOR"] }
        },
        "required": ["conflict_id", "higher_precedence_doc", "lower_precedence_doc", "description", "proposed_resolution", "severity"]
      }
    },
    "compliance_score": { "type": "number", "minimum": 0.0, "maximum": 1.0 }
  },
  "required": ["missing_policies_detected", "conflicts_found", "compliance_score"]
}
EOF

# 5. Create Antigravity Workflow: 4-Week Sprint Plan
cat << 'EOF' > .agents/workflows/01-sprint-plan.md
# Workflow: 4-Week PoC Execution Plan

## Sprint 1: Foundation & Knowledge Store (Days 1–5)
- Apply `terraform/main.tf` to spin up Cloud Storage, Document AI Layout Parser, and Vertex AI Vector Search.
- Run `.agents/skills/graph-queries.cypher` on Neo4j to seed echelons.
- Parse public anchor documents listed in `docs/public-anchor-docs.md`.

## Sprint 2: Multi-Agent & Precedence Engine (Days 6–10)
- Implement `AuditorAgent` and `EditorAgent` using Vertex AI ADK.
- Enforce precedence: Federal > DoD > DAF > AFMC > PAE > Program Office.
- Integrate JIT ingestion trigger for unindexed policies.

## Sprint 3: Synthetic Workflow Execution (Days 11–15)
- Load sample files from `docs/synthetic-test-docs/`.
- Run audit pipeline and output redline diffs and Issue Memorandum (Doc E).

## Sprint 4: Validation & Demo (Days 16–20)
- Benchmark conflict recall and traceability.
- Optimize cost using Gemini 2.5 Flash for summarization tasks.
EOF

# 6. Create Architecture Reference Doc
cat << 'EOF' > docs/architecture.md
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

## Precedence Rules Engine
1. Echelon Hierarchy: `Federal > DoD > DAF > AFMC > PAE > Program Office`
2. Temporal Rule: Newer effective dates supersede older policies within the same echelon.
EOF

# 7. Create Public Anchor List
cat << 'EOF' > docs/public-anchor-docs.md
# Public Anchor Documents for Core Knowledge Store Spine

1. **National Defense Strategy (NDS) - Unclassified Summary** [Echelon: Federal]
2. **DoD Directive 5000.01 (Defense Acquisition System)** [Echelon: DoD]
3. **AFDP 1-21 Agile Combat Employment (ACE)** [Echelon: DAF]
4. **DAF C3BM Modernization Briefings** [Echelon: PAE_C3BM]
5. **MIL-STD-6016 Tactical Data Link Standards** [Echelon: Federal/Joint]
EOF

# 8. Create Synthetic Test Documents
cat << 'EOF' > docs/synthetic-test-docs/Doc_A_ACE_Concept.md
# Doc A: Updated ACE C2 Operational Concept (2026)

## Section 3: Communications Resilience
Command and Control nodes operating at austere, non-USAF facilities must sustain operations during satellite link dropouts.
All tactical communications systems SHALL provide automated fallback to local mesh networking within **3 seconds** of SATCOM degradation.
EOF

cat << 'EOF' > docs/synthetic-test-docs/Doc_D_Target_SRD.md
# Doc D: Tactical Data Link System Requirements Document (Draft)

## Section 4.2: Link Failover Parameters
In the event of SATCOM signal attenuation or jamming, the system shall maintain a re-acquisition timer of **60 seconds** before switching operational modes to local tactical data links.
EOF

echo "Initialization Complete!"
echo "Structure created under $(pwd)"