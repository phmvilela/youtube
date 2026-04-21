resource "google_artifact_registry_repository" "gcf_artifacts" {
  description = "This repository is created and used by Cloud Functions for storing function docker images."
  format      = "DOCKER"

  labels = {
    goog-managed-by = "cloudfunctions"
    managed-by-cnrm = "true"
  }

  location      = "us-central1"
  mode          = "STANDARD_REPOSITORY"
  project       = "youtube-kids-462502"
  repository_id = "gcf-artifacts"
}
# terraform import google_artifact_registry_repository.gcf_artifacts projects/youtube-kids-462502/locations/us-central1/repositories/gcf-artifacts
