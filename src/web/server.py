#!/usr/bin/env python3
"""
USAF Acquisition Knowledgebase — Web Console Server & REST API
Zero-dependency HTTP server designed for local preview and Google Cloud Run deployment.
"""

import http.server
import json
import os
import sys
from urllib.parse import urlparse

PORT = int(os.environ.get("PORT", 8080))
WEB_DIR = os.path.dirname(os.path.abspath(__file__))

# Ground-truth mock audit data strictly matching .agents/skills/audit-schema.json
AUDIT_DATA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "AuditReport",
    "missing_policies_detected": [
        "MIL-STD-6016C"
    ],
    "conflicts_found": [
        {
            "conflict_id": "CONF-2026-001",
            "higher_precedence_doc": {
                "document_id": "Doc_A_ACE_Concept.md",
                "echelon": "DAF",
                "section": "Section 3: Communications Resilience"
            },
            "lower_precedence_doc": {
                "document_id": "Doc_D_Target_SRD.md",
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

ECHELON_HIERARCHY = [
    {"level": 1, "name": "Federal", "description": "National Defense Strategy, Title 10 USC, Executive Orders"},
    {"level": 2, "name": "DoD", "description": "DoD Directives (DoDD 5000.01), DoD Instructions"},
    {"level": 3, "name": "DAF", "description": "Department of the Air Force Instructions, ACE Doctrine"},
    {"level": 4, "name": "AFMC", "description": "Air Force Materiel Command Acquisition Guidance"},
    {"level": 5, "name": "PAE_C3BM", "description": "Program Executive Office C3BM Architecture Policies"},
    {"level": 6, "name": "Program_Office", "description": "System Requirements Documents (SRD), Statement of Objectives"}
]


class AcquisitionWebHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/health":
            self.send_json_response({"status": "healthy", "service": "acquisition-web-console", "port": PORT})
            return

        if parsed.path == "/api/audit":
            self.send_json_response(AUDIT_DATA)
            return

        if parsed.path == "/api/hierarchy":
            self.send_json_response({"echelons": ECHELON_HIERARCHY})
            return

        # Serve static assets or default to index.html
        if parsed.path in ["", "/"]:
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/audit/resolve":
            resolved_copy = dict(AUDIT_DATA)
            resolved_copy["conflicts_found"] = []
            resolved_copy["missing_policies_detected"] = []
            resolved_copy["compliance_score"] = 1.0
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
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        # Format log cleanly for Cloud Run / terminal stdout
        sys.stdout.write(f"[{self.log_date_time_string()}] {format % args}\n")
        sys.stdout.flush()


def run_server():
    server_address = ("0.0.0.0", PORT)
    httpd = http.server.HTTPServer(server_address, AcquisitionWebHandler)
    print(f"============================================================")
    print(f" USAF Acquisition Knowledgebase — Web Review Console")
    print(f" Listening on: http://0.0.0.0:{PORT}")
    print(f" Serving directory: {WEB_DIR}")
    print(f" Google Cloud Run Ingress: Ready")
    print(f"============================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()


if __name__ == "__main__":
    run_server()
