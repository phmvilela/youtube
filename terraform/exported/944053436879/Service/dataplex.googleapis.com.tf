resource "google_project_service" "dataplex_googleapis_com" {
  project = "944053436879"
  service = "dataplex.googleapis.com"
}
# terraform import google_project_service.dataplex_googleapis_com 944053436879/dataplex.googleapis.com
