resource "google_project_service" "cloudbuild_googleapis_com" {
  project = "944053436879"
  service = "cloudbuild.googleapis.com"
}
# terraform import google_project_service.cloudbuild_googleapis_com 944053436879/cloudbuild.googleapis.com
