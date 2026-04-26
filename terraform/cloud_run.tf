resource "google_cloud_run_v2_service" "search_service" {
  project  = var.project_id
  location = var.region
  name     = "search-service"
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = "${var.project_number}-compute@developer.gserviceaccount.com"
    timeout         = "300s"

    scaling {
      max_instance_count = 20
    }

    max_instance_request_concurrency = 80

    containers {
      image = var.search_service_image

      ports {
        container_port = 8080
        name           = "http1"
      }

      env {
        name  = "GCS_BUCKET_NAME"
        value = google_storage_bucket.videos.name
      }

      env {
        name  = "FIRESTORE_DATABASE_ID"
        value = var.firestore_database_id
      }

      resources {
        cpu_idle          = true
        startup_cpu_boost = true

        limits = {
          cpu    = "1000m"
          memory = "512Mi"
        }
      }

      startup_probe {
        failure_threshold     = 1
        initial_delay_seconds = 0
        period_seconds        = 240
        timeout_seconds       = 240

        tcp_socket {
          port = 8080
        }
      }
    }
  }

  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }

  lifecycle {
    ignore_changes = [
      client,
      client_version,
      template[0].containers[0].image,
    ]
  }

  depends_on = [google_project_service.services["run.googleapis.com"]]
}
