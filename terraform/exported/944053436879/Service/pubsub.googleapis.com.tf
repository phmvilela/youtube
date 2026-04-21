resource "google_project_service" "pubsub_googleapis_com" {
  project = "944053436879"
  service = "pubsub.googleapis.com"
}
# terraform import google_project_service.pubsub_googleapis_com 944053436879/pubsub.googleapis.com
