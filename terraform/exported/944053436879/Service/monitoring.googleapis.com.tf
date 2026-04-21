resource "google_project_service" "monitoring_googleapis_com" {
  project = "944053436879"
  service = "monitoring.googleapis.com"
}
# terraform import google_project_service.monitoring_googleapis_com 944053436879/monitoring.googleapis.com
