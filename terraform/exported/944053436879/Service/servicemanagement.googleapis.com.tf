resource "google_project_service" "servicemanagement_googleapis_com" {
  project = "944053436879"
  service = "servicemanagement.googleapis.com"
}
# terraform import google_project_service.servicemanagement_googleapis_com 944053436879/servicemanagement.googleapis.com
