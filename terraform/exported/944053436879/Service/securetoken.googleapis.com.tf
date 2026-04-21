resource "google_project_service" "securetoken_googleapis_com" {
  project = "944053436879"
  service = "securetoken.googleapis.com"
}
# terraform import google_project_service.securetoken_googleapis_com 944053436879/securetoken.googleapis.com
