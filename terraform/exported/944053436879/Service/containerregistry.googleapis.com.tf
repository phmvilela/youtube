resource "google_project_service" "containerregistry_googleapis_com" {
  project = "944053436879"
  service = "containerregistry.googleapis.com"
}
# terraform import google_project_service.containerregistry_googleapis_com 944053436879/containerregistry.googleapis.com
