resource "google_project_service" "cloudfunctions_googleapis_com" {
  project = "944053436879"
  service = "cloudfunctions.googleapis.com"
}
# terraform import google_project_service.cloudfunctions_googleapis_com 944053436879/cloudfunctions.googleapis.com
