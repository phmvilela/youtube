resource "google_project_service" "cloudtrace_googleapis_com" {
  project = "944053436879"
  service = "cloudtrace.googleapis.com"
}
# terraform import google_project_service.cloudtrace_googleapis_com 944053436879/cloudtrace.googleapis.com
