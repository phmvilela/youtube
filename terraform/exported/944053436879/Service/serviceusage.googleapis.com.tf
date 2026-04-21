resource "google_project_service" "serviceusage_googleapis_com" {
  project = "944053436879"
  service = "serviceusage.googleapis.com"
}
# terraform import google_project_service.serviceusage_googleapis_com 944053436879/serviceusage.googleapis.com
