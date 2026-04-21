resource "google_project_service" "run_googleapis_com" {
  project = "944053436879"
  service = "run.googleapis.com"
}
# terraform import google_project_service.run_googleapis_com 944053436879/run.googleapis.com
