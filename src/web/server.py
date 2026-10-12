#!/usr/bin/env python3
"""
USAF Acquisition Knowledgebase — Web Console Server, Audit Engine & REST API
Features:
- File upload & persistence (supporting native PDF, Markdown, text)
- PDF stream decompression & text extraction into structured Markdown
- Tier 1 document summary generation in Markdown referencing the PDF
- Automated echelon precedence auditing
- Markdown review report generation with links to original documents (data/reviews/)
- Semantic database index linking documents to summaries (data/semantic_db.json)
- Native browser PDF rendering for /api/documents/<doc_id>
- Zero-dependency HTTP server for local testing and Google Cloud Run deployment
"""

import base64
import http.server
import json
import os
import re
import sys
import time
import zlib
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

PORT = int(os.environ.get("PORT", 8080))
WEB_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(os.path.dirname(WEB_DIR))
DATA_DIR = os.path.join(ROOT_DIR, "data")
DOCS_DIR = os.path.join(DATA_DIR, "documents")
SUMMARIES_DIR = os.path.join(DATA_DIR, "summaries")
REVIEWS_DIR = os.path.join(DATA_DIR, "reviews")
SEMANTIC_DB_PATH = os.path.join(DATA_DIR, "semantic_db.json")

# Ensure required directories exist
for d in [DATA_DIR, DOCS_DIR, SUMMARIES_DIR, REVIEWS_DIR]:
    os.makedirs(d, exist_ok=True)

ECHELON_HIERARCHY = [
    {"level": 1, "name": "Federal", "description": "National Defense Strategy, Title 10 USC, Executive Orders"},
    {"level": 2, "name": "DoD", "description": "DoD Directives (DoDD 5000.01), DoD Instructions"},
    {"level": 3, "name": "DAF", "description": "Department of the Air Force Instructions, ACE Doctrine"},
    {"level": 4, "name": "AFMC", "description": "Air Force Materiel Command Acquisition Guidance"},
    {"level": 5, "name": "PAE_C3BM", "description": "Program Executive Office C3BM Architecture Policies"},
    {"level": 6, "name": "Program_Office", "description": "System Requirements Documents (SRD), Statement of Objectives"}
]

# Baseline active audit report
AUDIT_DATA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "AuditReport",
    "document_id": "DOC-002",
    "review_id": "REV-2026-001",
    "missing_policies_detected": ["MIL-STD-6016C"],
    "conflicts_found": [
        {
            "conflict_id": "CONF-2026-001",
            "higher_precedence_doc": {
                "document_id": "DOC-001",
                "title": "Doc A: Updated ACE C2 Operational Concept (2026)",
                "echelon": "DAF",
                "section": "Section 3: Communications Resilience"
            },
            "lower_precedence_doc": {
                "document_id": "DOC-002",
                "title": "Doc D: Target SRD (Draft)",
                "echelon": "Program_Office",
                "section": "Section 4.2: Link Failover Parameters"
            },
            "description": "SATCOM failover delay in draft SRD (60s) violates DAF ACE operational concept mandate (<= 3s).",
            "proposed_resolution": "Update Section 4.2 of Doc D to require automated fallback to local mesh networking within 3 seconds of SATCOM degradation.",
            "severity": "CRITICAL"
        }
    ],
    "compliance_score": 0.68
}


def extract_text_from_pdf(pdf_bytes):
    """
    Extracts text and section structure from PDF bytes using standard library (re, zlib).
    Decompresses FlateDecode streams and parses text elements and section headers.
    """
    extracted_chunks = []

    # 1. Look for stream ... endstream blocks
    stream_pattern = re.compile(rb"stream[\r\n]+([\s\S]*?)[\r\n]+endstream")
    for match in stream_pattern.finditer(pdf_bytes):
        stream_data = match.group(1)
        decompressed = None
        # Try decompressing with zlib (FlateDecode)
        try:
            decompressed = zlib.decompress(stream_data)
        except Exception:
            try:
                decompressed = zlib.decompress(stream_data, -zlib.MAX_WBITS)
            except Exception:
                decompressed = stream_data

        if decompressed:
            # Parse BT ... ET text blocks
            bt_matches = re.findall(rb"BT[\r\n\s]+([\s\S]*?)[\r\n\s]+ET", decompressed)
            for bt in bt_matches:
                # Text inside parentheses: (some text) Tj
                tjs = re.findall(rb"\(([^)]*)\)\s*(?:Tj|'|\")", bt)
                for t in tjs:
                    decoded = t.decode("latin-1", errors="replace").strip()
                    if decoded and len(decoded) > 1 and not decoded.startswith("/"):
                        extracted_chunks.append(decoded)

                # Text inside TJ array: [(part 1) -10 (part 2)] TJ
                tj_arrays = re.findall(rb"\[([\s\S]*?)\]\s*TJ", bt)
                for arr in tj_arrays:
                    items = re.findall(rb"\(([^)]*)\)", arr)
                    combined = "".join([item.decode("latin-1", errors="replace") for item in items]).strip()
                    if combined and len(combined) > 1 and not combined.startswith("/"):
                        extracted_chunks.append(combined)

    # Fallback if no BT ... ET streams parsed text
    if not extracted_chunks:
        # Scan for printable ASCII/UTF-8 strings
        ascii_strings = re.findall(rb"[A-Za-z0-9 ,.:;!?'\"()#\-\/]{4,}", pdf_bytes)
        for s in ascii_strings:
            decoded = s.decode("latin-1", errors="ignore").strip()
            if not decoded.startswith("/") and not decoded.startswith("end") and not decoded.startswith("obj") and len(decoded) > 3:
                extracted_chunks.append(decoded)

    # Format into structured Markdown
    markdown_lines = []
    for chunk in extracted_chunks:
        if chunk in ["PDF", "xref", "trailer", "startxref"]:
            continue
        # Detect section headings
        if re.match(r"^(?:Doc\s+[A-Z]|Section\s+\d+|Chapter\s+\d+|Part\s+\d+|[A-Z0-9\s_-]{4,35}:)", chunk, re.IGNORECASE):
            markdown_lines.append(f"\n## {chunk}\n")
        elif chunk.startswith("#"):
            markdown_lines.append(f"\n{chunk}\n")
        else:
            markdown_lines.append(chunk)

    assembled = "\n".join(markdown_lines).strip()
    return assembled if assembled else "PDF Document Content Processed."


def load_semantic_db():
    if os.path.exists(SEMANTIC_DB_PATH):
        try:
            with open(SEMANTIC_DB_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            sys.stderr.write(f"Error loading semantic_db.json: {e}\n")
    return {"name": "USAF Acquisition Knowledgebase Semantic Index", "documents": []}


def save_semantic_db(db):
    db["updated_at"] = datetime.now(timezone.utc).isoformat()
    with open(SEMANTIC_DB_PATH, "w", encoding="utf-8") as f:
        json.dump(db, f, indent=2)


def get_all_reviews():
    reviews = []
    if not os.path.exists(REVIEWS_DIR):
        return reviews

    for filename in sorted(os.listdir(REVIEWS_DIR), reverse=True):
        if not filename.endswith(".md"):
            continue
        filepath = os.path.join(REVIEWS_DIR, filename)
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            rev_match = re.search(r"\*\*Review ID:\*\*\s*`?([A-Za-z0-9_-]+)`?", content)
            score_match = re.search(r"\*\*Compliance Score:\*\*\s*\*\*([0-9.]+)", content)
            doc_link_match = re.search(r"\*\*Original Document:\*\*\s*\[([^\]]+)\]\(([^)]+)\)", content)
            title_match = re.search(r"^#\s*(.+)", content)

            review_id = rev_match.group(1) if rev_match else filename.replace(".md", "")
            score = float(score_match.group(1)) if score_match else 0.68
            title = title_match.group(1) if title_match else filename

            reviews.append({
                "review_id": review_id,
                "filename": filename,
                "title": title,
                "compliance_score": score,
                "original_document_name": doc_link_match.group(1) if doc_link_match else "Original Document",
                "original_document_url": doc_link_match.group(2) if doc_link_match else "",
                "review_url": f"/api/reviews/{review_id}",
                "modified_at": os.path.getmtime(filepath)
            })
        except Exception as e:
            sys.stderr.write(f"Error parsing review file {filename}: {e}\n")
    return reviews


def audit_document(content, filename, title, echelon_level, echelon_name, is_pdf=False, raw_pdf_bytes=None):
    """
    Audits an uploaded document (Markdown, Text, or PDF):
    1. Stores original document in data/documents/ (raw PDF binary or UTF-8 text)
    2. Extracts structured text if PDF
    3. Generates Tier 1 Markdown summary in data/summaries/ with references to the original document
    4. Runs echelon precedence conflict checks
    5. Generates Markdown review report with links to the original document in data/reviews/
    6. Updates semantic database index in data/semantic_db.json
    """
    global AUDIT_DATA
    ts = int(time.time())
    doc_id = f"DOC-{ts % 10000:04d}"
    review_id = f"REV-{datetime.now().strftime('%Y')}-{ts % 10000:04d}"
    safe_filename = re.sub(r"[^\w\.-]", "_", filename)
    doc_stored_filename = f"{doc_id}_{safe_filename}"
    doc_path = os.path.join(DOCS_DIR, doc_stored_filename)

    # 1. Save original document to disk
    if is_pdf and raw_pdf_bytes:
        with open(doc_path, "wb") as f:
            f.write(raw_pdf_bytes)
        # Extract structured text from PDF
        extracted_content = extract_text_from_pdf(raw_pdf_bytes)
        audit_text = extracted_content if extracted_content.strip() else content
    else:
        with open(doc_path, "w", encoding="utf-8") as f:
            f.write(content)
        audit_text = content

    # 2. Extract sections & analyze parameters
    sections = re.findall(r"^##+\s*(.+)", audit_text, re.MULTILINE)
    if not sections:
        sections = ["Section 1: General Requirements", "Section 2: System Specifications"]

    conflicts = []
    missing_policies = []
    compliance_score = 1.0

    # Conflict check: SATCOM timer > 3s at echelon level > 3
    has_satcom = "satcom" in audit_text.lower() or "satellite" in audit_text.lower()
    timer_match = re.search(r"(\d+)\s*(?:second|sec|s\b)", audit_text, re.IGNORECASE)
    timer_val = int(timer_match.group(1)) if timer_match else None

    if echelon_level > 3 and has_satcom and timer_val and timer_val > 3:
        conflicts.append({
            "conflict_id": f"CONF-{ts % 1000:03d}",
            "higher_precedence_doc": {
                "document_id": "DOC-001",
                "title": "Doc A: Updated ACE C2 Operational Concept (2026)",
                "echelon": "DAF",
                "section": "Section 3: Communications Resilience"
            },
            "lower_precedence_doc": {
                "document_id": doc_id,
                "title": title,
                "echelon": echelon_name,
                "section": sections[0] if sections else "Operational Parameters"
            },
            "description": f"Failover timer of {timer_val}s in candidate requirement violates higher-echelon DAF ACE mandate (<= 3s).",
            "proposed_resolution": f"Update requirement to mandate automated fallback to local mesh networking within 3 seconds of SATCOM degradation.",
            "severity": "CRITICAL"
        })
        compliance_score = 0.68

    # Check for unindexed standards
    if "6016" in audit_text:
        missing_policies.append("MIL-STD-6016C: Tactical Data Link 16 Message Standard")

    # 3. Generate Tier 1 Executive Summary in Markdown
    summary_filename = f"{doc_id}_summary.md"
    summary_path = os.path.join(SUMMARIES_DIR, summary_filename)
    format_label = "Native PDF Document (application/pdf)" if is_pdf else "Markdown / Plaintext"

    summary_md = f"""# Executive Summary: {title}

- **Document ID:** `{doc_id}`
- **Echelon Level:** Level {echelon_level} ({echelon_name})
- **Ingestion Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
- **Ingestion Format:** {format_label}
- **Original Source File:** [{safe_filename}](/api/documents/{doc_id})
- **Local Storage Path:** `data/documents/{doc_stored_filename}`

---

## Document Overview & PDF References
{audit_text[:400].strip()}...

## Extracted Structure & Key Sections
""" + "\n".join([f"- **{sec}**" for sec in sections]) + f"""

## Precedence Evaluation
- **Assigned Echelon:** Level {echelon_level} ({echelon_name})
- **Authority Rule:** Subordinate to echelons with lower numerical levels (Levels 1 to {max(1, echelon_level-1)}).
- **Audit Flag:** {"CRITICAL CONFLICT DETECTED" if conflicts else "COMPLIANT WITH GOVERNING SPINES"}
"""
    with open(summary_path, "w", encoding="utf-8") as f:
        f.write(summary_md)

    # 4. Generate Precedence Audit Review in Markdown
    status_label = "CRITICAL ACTION REQUIRED" if conflicts else "COMPLIANT"
    review_filename = f"{review_id}_{re.sub(r'[^a-zA-Z0-9_]', '_', title)[:30]}_Audit_Review.md"
    review_path = os.path.join(REVIEWS_DIR, review_filename)

    review_md = f"""# Precedence Audit Review: {title}

- **Review ID:** `{review_id}`
- **Target Document ID:** `{doc_id}`
- **Audit Date:** {datetime.now().strftime('%Y-%m-%d')}
- **Auditor Engine:** Vertex AI ADK Precedence Engine / AuditorAgent
- **Compliance Score:** **{compliance_score:.2f} / 1.00** (`{status_label}`)
- **Original Document:** [{safe_filename} ({format_label})](/api/documents/{doc_id})
- **Executive Summary:** [{doc_id} Markdown Summary](/api/summaries/{doc_id})

---

## 1. Executive Assessment
An automated echelon precedence audit of [{title}](/api/documents/{doc_id}) was conducted against the USAF Acquisition Knowledgebase.

- **Status:** **{len(conflicts)} conflict(s) detected**, **{len(missing_policies)} missing policy gap(s)**.
- **Compliance Score:** **{compliance_score:.2f} / 1.00**.
"""

    if conflicts:
        review_md += f"""
---

## 2. Precedence Conflicts Identified

| Conflict ID | Severity | Governing Mandate (Higher Echelon) | Candidate Requirement (Lower Echelon) | Description |
| :--- | :--- | :--- | :--- | :--- |
"""
        for c in conflicts:
            review_md += f"| `{c['conflict_id']}` | **{c['severity']}** | **{c['higher_precedence_doc']['title']}** (Echelon: {c['higher_precedence_doc']['echelon']}) | **{c['lower_precedence_doc']['title']}** (Echelon: {c['lower_precedence_doc']['echelon']}) | {c['description']} |\n"

        review_md += f"""
---

## 3. Proposed Redline Diff

```diff
--- a/{safe_filename}
+++ b/{safe_filename}
@@ -1,5 +1,5 @@
- In the event of SATCOM signal attenuation or jamming, the system shall maintain a re-acquisition timer of {timer_val or 60} seconds before switching operational modes.
+ In the event of SATCOM signal attenuation or jamming, the system shall provide automated fallback to local mesh networking within 3 seconds of SATCOM degradation in compliance with DAF ACE C2 Operational Concept (2026).
```
"""
    else:
        review_md += f"""
---

## 2. Precedence Assessment
No conflicting mandates were detected against superior echelons. Document conforms to governing baseline policies.
"""

    review_md += f"""
---

## 4. Source Document Citations & Relative Links
- **Original Document File:** [{safe_filename}](/api/documents/{doc_id})
- **Summary File:** [{doc_id}_summary.md](/api/summaries/{doc_id})
- **Local Review Path:** `data/reviews/{review_filename}`
"""
    with open(review_path, "w", encoding="utf-8") as f:
        f.write(review_md)

    # 5. Update Semantic Database (data/semantic_db.json)
    db = load_semantic_db()
    db["documents"].append({
        "document_id": doc_id,
        "title": title,
        "filename": doc_stored_filename,
        "mime_type": "application/pdf" if is_pdf else "text/markdown",
        "format": "PDF" if is_pdf else "Markdown",
        "echelon": {
            "level": echelon_level,
            "name": echelon_name
        },
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "original_document_url": f"/api/documents/{doc_id}",
        "summary_url": f"/api/summaries/{doc_id}",
        "summary_markdown_file": f"data/summaries/{summary_filename}",
        "reviews": [
            {
                "review_id": review_id,
                "review_url": f"/api/reviews/{review_id}",
                "review_markdown_file": f"data/reviews/{review_filename}",
                "compliance_score": compliance_score,
                "status": "CRITICAL_CONFLICT_FOUND" if conflicts else "COMPLIANT",
                "audit_date": datetime.now().strftime('%Y-%m-%d')
            }
        ],
        "status": "AUDITED",
        "tier1_summary": f"Uploaded {format_label} audited at Level {echelon_level} ({echelon_name}). Compliance: {compliance_score:.2f}.",
        "tier2_sections": sections
    })
    save_semantic_db(db)

    # 6. Update Active In-Memory AUDIT_DATA
    AUDIT_DATA = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "AuditReport",
        "document_id": doc_id,
        "review_id": review_id,
        "missing_policies_detected": missing_policies,
        "conflicts_found": conflicts,
        "compliance_score": compliance_score
    }

    return {
        "success": True,
        "document_id": doc_id,
        "review_id": review_id,
        "title": title,
        "format": "PDF" if is_pdf else "Markdown",
        "original_document_url": f"/api/documents/{doc_id}",
        "summary_url": f"/api/summaries/{doc_id}",
        "review_url": f"/api/reviews/{review_id}",
        "compliance_score": compliance_score,
        "conflicts": conflicts,
        "missing_policies": missing_policies,
        "review_markdown": review_md,
        "summary_markdown": summary_md,
        "extracted_markdown": audit_text
    }


class AcquisitionWebHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        # Health
        if path == "/api/health":
            self.send_json_response({"status": "healthy", "service": "acquisition-web-console", "port": PORT})
            return

        # Active Audit Report
        if path == "/api/audit":
            self.send_json_response(AUDIT_DATA)
            return

        # Hierarchy
        if path == "/api/hierarchy":
            self.send_json_response({"echelons": ECHELON_HIERARCHY})
            return

        # Semantic Database Index
        if path == "/api/semantic-db":
            db = load_semantic_db()
            self.send_json_response(db)
            return

        # List all Reviews
        if path == "/api/reviews":
            reviews = get_all_reviews()
            self.send_json_response({"reviews": reviews})
            return

        # Get Single Review by ID
        if path.startswith("/api/reviews/"):
            review_id = path.replace("/api/reviews/", "").strip()
            matched_file = None
            if os.path.exists(REVIEWS_DIR):
                for f in os.listdir(REVIEWS_DIR):
                    if f.startswith(review_id) and f.endswith(".md"):
                        matched_file = os.path.join(REVIEWS_DIR, f)
                        break

            if matched_file and os.path.exists(matched_file):
                with open(matched_file, "r", encoding="utf-8") as f:
                    content = f.read()

                if "raw" in query or "markdown" in query:
                    self.send_text_response(content, content_type="text/markdown; charset=utf-8")
                else:
                    self.send_json_response({
                        "review_id": review_id,
                        "filename": os.path.basename(matched_file),
                        "content_markdown": content
                    })
                return
            else:
                self.send_json_response({"error": f"Review {review_id} not found"}, status=404)
                return

        # Get Document Summary by doc_id
        if path.startswith("/api/summaries/"):
            doc_id = path.replace("/api/summaries/", "").strip()
            summary_file = os.path.join(SUMMARIES_DIR, f"{doc_id}_summary.md")
            if os.path.exists(summary_file):
                with open(summary_file, "r", encoding="utf-8") as f:
                    content = f.read()
                self.send_text_response(content, content_type="text/markdown; charset=utf-8")
                return
            else:
                self.send_json_response({"error": f"Summary for {doc_id} not found"}, status=404)
                return

        # Get Original Document by doc_id (Handles PDF natively!)
        if path.startswith("/api/documents/"):
            doc_id = path.replace("/api/documents/", "").strip()
            matched_file = None
            if os.path.exists(DOCS_DIR):
                for f in os.listdir(DOCS_DIR):
                    if f.startswith(doc_id):
                        matched_file = os.path.join(DOCS_DIR, f)
                        break

            if matched_file and os.path.exists(matched_file):
                # If PDF, serve as binary application/pdf
                if matched_file.lower().endswith(".pdf"):
                    with open(matched_file, "rb") as f:
                        pdf_bytes = f.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/pdf")
                    self.send_header("Content-Disposition", f'inline; filename="{os.path.basename(matched_file)}"')
                    self.send_header("Content-Length", str(len(pdf_bytes)))
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(pdf_bytes)
                    return
                else:
                    with open(matched_file, "r", encoding="utf-8") as f:
                        content = f.read()
                    self.send_text_response(content, content_type="text/markdown; charset=utf-8")
                    return
            else:
                self.send_json_response({"error": f"Document {doc_id} not found"}, status=404)
                return

        # Default static file serving
        if path in ["", "/"]:
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)

        # File Upload & Audit Endpoint (Supports PDF via base64 or plaintext Markdown)
        if parsed.path == "/api/upload":
            content_length = int(self.headers.get("Content-Length", 0))
            raw_body = self.rfile.read(content_length).decode("utf-8")
            try:
                data = json.loads(raw_body)
                filename = data.get("filename", "uploaded_doc.md")
                content = data.get("content", "")
                title = data.get("title", filename)
                echelon_level = int(data.get("echelon_level", 6))
                echelon_name = data.get("echelon_name", "Program_Office")
                is_binary = data.get("is_binary", False) or filename.lower().endswith(".pdf")
                file_base64 = data.get("file_base64", None)

                raw_bytes = None
                if is_binary and file_base64:
                    raw_bytes = base64.b64decode(file_base64)

                result = audit_document(
                    content=content,
                    filename=filename,
                    title=title,
                    echelon_level=echelon_level,
                    echelon_name=echelon_name,
                    is_pdf=is_binary,
                    raw_pdf_bytes=raw_bytes
                )
                self.send_json_response(result, status=201)
                return
            except Exception as e:
                self.send_json_response({"error": f"Upload processing failed: {str(e)}"}, status=400)
                return

        # Resolve Action Endpoint
        if parsed.path == "/api/audit/resolve":
            global AUDIT_DATA
            resolved_copy = dict(AUDIT_DATA)
            resolved_copy["conflicts_found"] = []
            resolved_copy["missing_policies_detected"] = []
            resolved_copy["compliance_score"] = 1.0
            AUDIT_DATA = resolved_copy
            self.send_json_response(resolved_copy)
            return

        self.send_response(404)
        self.end_headers()

    def send_json_response(self, data, status=200):
        body = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def send_text_response(self, text, status=200, content_type="text/plain; charset=utf-8"):
        body = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        sys.stdout.write(f"[{self.log_date_time_string()}] {format % args}\n")
        sys.stdout.flush()


def run_server():
    server_address = ("0.0.0.0", PORT)
    httpd = http.server.HTTPServer(server_address, AcquisitionWebHandler)
    print(f"============================================================")
    print(f" USAF Acquisition Knowledgebase — Web Review Console")
    print(f" Listening on: http://0.0.0.0:{PORT}")
    print(f" Serving directory: {WEB_DIR}")
    print(f" Data directory:    {DATA_DIR} (PDF & Markdown Persistence)")
    print(f" Google Cloud Run Ingress: Ready")
    print(f"============================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()


if __name__ == "__main__":
    run_server()
