resource "google_project_service" "testing_googleapis_com" {
  project = "944053436879"
  service = "testing.googleapis.com"
}
# terraform import google_project_service.testing_googleapis_com 944053436879/testing.googleapis.com
