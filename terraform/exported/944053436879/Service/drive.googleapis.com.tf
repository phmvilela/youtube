resource "google_project_service" "drive_googleapis_com" {
  project = "944053436879"
  service = "drive.googleapis.com"
}
# terraform import google_project_service.drive_googleapis_com 944053436879/drive.googleapis.com
