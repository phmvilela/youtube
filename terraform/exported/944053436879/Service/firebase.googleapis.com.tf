resource "google_project_service" "firebase_googleapis_com" {
  project = "944053436879"
  service = "firebase.googleapis.com"
}
# terraform import google_project_service.firebase_googleapis_com 944053436879/firebase.googleapis.com
