resource "google_project_service" "firestore_googleapis_com" {
  project = "944053436879"
  service = "firestore.googleapis.com"
}
# terraform import google_project_service.firestore_googleapis_com 944053436879/firestore.googleapis.com
