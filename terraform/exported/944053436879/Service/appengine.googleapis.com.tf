resource "google_project_service" "appengine_googleapis_com" {
  project = "944053436879"
  service = "appengine.googleapis.com"
}
# terraform import google_project_service.appengine_googleapis_com 944053436879/appengine.googleapis.com
