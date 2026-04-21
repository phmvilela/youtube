resource "google_cloudfunctions2_function" "youtube_videos_sync" {
  project  = var.project_id
  location = var.region
  name     = "youtube-videos-sync"

  build_config {
    runtime     = "nodejs20"
    entry_point = "youtube-videos-sync"

    docker_repository = "projects/${var.project_id}/locations/${var.region}/repositories/gcf-artifacts"

    source {
      storage_source {
        bucket = "gcf-v2-sources-${var.project_number}-${var.region}"
        object = "youtube-videos-sync/function-source.zip"
      }
    }
  }

  service_config {
    available_memory                 = "256M"
    available_cpu                    = "0.1666"
    timeout_seconds                  = 60
    max_instance_count               = 100
    max_instance_request_concurrency = 1
    all_traffic_on_latest_revision   = true
    ingress_settings                 = "ALLOW_ALL"
    service_account_email            = "${var.project_number}-compute@developer.gserviceaccount.com"

    environment_variables = {
      GCS_BUCKET_NAME   = google_storage_bucket.videos.name
      LOG_EXECUTION_ID  = "true"
    }
  }

  # CI/CD deploys new function code, not Terraform.
  lifecycle {
    ignore_changes = [
      build_config[0].source[0].storage_source[0].generation,
    ]
  }

  depends_on = [google_project_service.services["cloudfunctions.googleapis.com"]]
}
