resource "google_project_service" "iam_googleapis_com" {
  project = "944053436879"
  service = "iam.googleapis.com"
}
# terraform import google_project_service.iam_googleapis_com 944053436879/iam.googleapis.com
