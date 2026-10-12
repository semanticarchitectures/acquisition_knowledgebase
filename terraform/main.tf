terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

variable "project_id" {
  type        = string
  description = "Google Cloud Project ID"
  default     = "usaf-acquisition-poc"
}

variable "region" {
  type        = string
  description = "GCP deployment region"
  default     = "us-central1"
}

variable "allow_unauthenticated" {
  type        = bool
  description = "Allow public internet access to the web interface (set to false when using Identity-Aware Proxy / CAC)"
  default     = true
}

variable "container_image" {
  type        = string
  description = "Container image URI for the web console"
  default     = "us-central1-docker.pkg.dev/usaf-acquisition-poc/acquisition-repo/web-console:latest"
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# 1. Enable Required Cloud APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "documentai.googleapis.com",
    "aiplatform.googleapis.com",
    "storage.googleapis.com",
    "artifactregistry.googleapis.com",
    "iap.googleapis.com"
  ])
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# 2. Cloud Storage Bucket for Document Ingestion
resource "google_storage_bucket" "doc_ingestion" {
  name                     = "${var.project_id}-doc-ingestion"
  location                 = var.region
  force_destroy            = false
  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  depends_on = [google_project_service.apis]
}

# 3. Document AI Processor for Layout Parsing
resource "google_document_ai_processor" "layout_parser" {
  location     = "us"
  display_name = "usaf-doc-layout-parser"
  type         = "LAYOUT_PARSER_PROCESSOR"

  depends_on = [google_project_service.apis]
}

# 4. Google Cloud Run Service for Internet-Accessible Web Interface
resource "google_cloud_run_v2_service" "web_console" {
  name     = "acquisition-web-console"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }

    containers {
      image = var.container_image

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      ports {
        container_port = 8080
      }

      env {
        name  = "PORT"
        value = "8080"
      }
      env {
        name  = "GCS_BUCKET"
        value = google_storage_bucket.doc_ingestion.name
      }
      env {
        name  = "PROJECT_ID"
        value = var.project_id
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [google_project_service.apis]
}

# 5. IAM Policy for Public Internet Access or Restrict to Authorized Members
resource "google_cloud_run_v2_service_iam_member" "public_access" {
  count    = var.allow_unauthenticated ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.web_console.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# 6. Outputs
output "web_console_url" {
  description = "Public or IAP-accessible URL for the Web Console"
  value       = google_cloud_run_v2_service.web_console.uri
}

output "ingestion_bucket_name" {
  description = "GCS Bucket for document uploads"
  value       = google_storage_bucket.doc_ingestion.name
}

output "documentai_processor_id" {
  description = "Document AI Layout Parser Processor ID"
  value       = google_document_ai_processor.layout_parser.id
}
