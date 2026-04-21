resource "google_project_service" "runtimeconfig_googleapis_com" {
  project = "944053436879"
  service = "runtimeconfig.googleapis.com"
}
# terraform import google_project_service.runtimeconfig_googleapis_com 944053436879/runtimeconfig.googleapis.com
