resource "google_project_service" "fcm_googleapis_com" {
  project = "944053436879"
  service = "fcm.googleapis.com"
}
# terraform import google_project_service.fcm_googleapis_com 944053436879/fcm.googleapis.com
