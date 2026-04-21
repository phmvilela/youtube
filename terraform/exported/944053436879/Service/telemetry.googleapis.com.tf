resource "google_project_service" "telemetry_googleapis_com" {
  project = "944053436879"
  service = "telemetry.googleapis.com"
}
# terraform import google_project_service.telemetry_googleapis_com 944053436879/telemetry.googleapis.com
