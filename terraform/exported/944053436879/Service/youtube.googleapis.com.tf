resource "google_project_service" "youtube_googleapis_com" {
  project = "944053436879"
  service = "youtube.googleapis.com"
}
# terraform import google_project_service.youtube_googleapis_com 944053436879/youtube.googleapis.com
