resource "google_identity_platform_config" "auth" {
  project = var.project_id

  sign_in {
    allow_duplicate_emails = false
  }

  authorized_domains = [
    "localhost",
    "${var.project_id}.firebaseapp.com",
    "${var.project_id}.web.app",
  ]

  depends_on = [google_project_service.services["identitytoolkit.googleapis.com"]]
}

resource "google_identity_platform_default_supported_idp_config" "google" {
  project  = var.project_id
  enabled  = true
  idp_id   = "google.com"

  client_id     = var.google_oauth_client_id
  client_secret = var.google_oauth_client_secret

  depends_on = [google_identity_platform_config.auth]
}
