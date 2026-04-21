variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "project_number" {
  description = "GCP project number"
  type        = string
}

variable "region" {
  description = "Default GCP region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name (prod, staging, dev)"
  type        = string
}

variable "firestore_database_id" {
  description = "Firestore database ID"
  type        = string
  default     = "youtube-kids"
}

variable "videos_bucket_name" {
  description = "GCS bucket name for video content"
  type        = string
}

variable "search_service_image" {
  description = "Container image for the search-service Cloud Run service"
  type        = string
}

variable "google_oauth_client_id" {
  description = "Google OAuth 2.0 client ID (used for Firebase Auth Google sign-in provider)"
  type        = string
}

variable "google_oauth_client_secret" {
  description = "Google OAuth 2.0 client secret (used for Firebase Auth Google sign-in provider)"
  type        = string
  sensitive   = true
}

variable "gcp_services" {
  description = "List of GCP API services to enable"
  type        = list(string)
}
