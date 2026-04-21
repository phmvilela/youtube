resource "google_project_service" "datalineage_googleapis_com" {
  project = "944053436879"
  service = "datalineage.googleapis.com"
}
# terraform import google_project_service.datalineage_googleapis_com 944053436879/datalineage.googleapis.com
