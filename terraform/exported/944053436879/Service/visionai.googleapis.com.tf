resource "google_project_service" "visionai_googleapis_com" {
  project = "944053436879"
  service = "visionai.googleapis.com"
}
# terraform import google_project_service.visionai_googleapis_com 944053436879/visionai.googleapis.com
