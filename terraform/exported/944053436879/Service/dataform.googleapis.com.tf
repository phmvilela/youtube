resource "google_project_service" "dataform_googleapis_com" {
  project = "944053436879"
  service = "dataform.googleapis.com"
}
# terraform import google_project_service.dataform_googleapis_com 944053436879/dataform.googleapis.com
