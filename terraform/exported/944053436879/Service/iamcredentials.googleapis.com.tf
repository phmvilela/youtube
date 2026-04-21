resource "google_project_service" "iamcredentials_googleapis_com" {
  project = "944053436879"
  service = "iamcredentials.googleapis.com"
}
# terraform import google_project_service.iamcredentials_googleapis_com 944053436879/iamcredentials.googleapis.com
