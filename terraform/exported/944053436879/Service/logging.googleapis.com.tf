resource "google_project_service" "logging_googleapis_com" {
  project = "944053436879"
  service = "logging.googleapis.com"
}
# terraform import google_project_service.logging_googleapis_com 944053436879/logging.googleapis.com
