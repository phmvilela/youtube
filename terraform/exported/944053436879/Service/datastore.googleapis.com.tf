resource "google_project_service" "datastore_googleapis_com" {
  project = "944053436879"
  service = "datastore.googleapis.com"
}
# terraform import google_project_service.datastore_googleapis_com 944053436879/datastore.googleapis.com
