resource "google_project_service" "bigquerystorage_googleapis_com" {
  project = "944053436879"
  service = "bigquerystorage.googleapis.com"
}
# terraform import google_project_service.bigquerystorage_googleapis_com 944053436879/bigquerystorage.googleapis.com
