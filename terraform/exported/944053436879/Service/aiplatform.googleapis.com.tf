resource "google_project_service" "aiplatform_googleapis_com" {
  project = "944053436879"
  service = "aiplatform.googleapis.com"
}
# terraform import google_project_service.aiplatform_googleapis_com 944053436879/aiplatform.googleapis.com
