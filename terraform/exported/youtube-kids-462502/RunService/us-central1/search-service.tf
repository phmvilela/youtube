resource "google_cloud_run_v2_service" "search_service" {
  client         = "gcloud"
  client_version = "563.0.0"
  ingress        = "INGRESS_TRAFFIC_ALL"

  labels = {
    managed-by-cnrm = "true"
  }

  launch_stage = "GA"
  location     = "us-central1"
  name         = "search-service"
  project      = "youtube-kids-462502"

  template {
    containers {
      env {
        name  = "GCS_BUCKET_NAME"
        value = "youtube-kids-462502-videos"
      }

      env {
        name  = "FIRESTORE_DATABASE_ID"
        value = "youtube-kids"
      }

      image = "us-central1-docker.pkg.dev/youtube-kids-462502/cloud-run-source-deploy/search-service@sha256:fb85b564302637529f4bda6239a6db9f145ad08e517b19e09f7fb32d0523b05b"

      ports {
        container_port = 8080
        name           = "http1"
      }

      resources {
        cpu_idle = true

        limits = {
          cpu    = "1000m"
          memory = "512Mi"
        }

        startup_cpu_boost = true
      }

      startup_probe {
        failure_threshold     = 1
        initial_delay_seconds = 0
        period_seconds        = 240

        tcp_socket {
          port = 8080
        }

        timeout_seconds = 240
      }
    }

    max_instance_request_concurrency = 80

    scaling {
      max_instance_count = 20
    }

    service_account = "944053436879-compute@developer.gserviceaccount.com"
    timeout         = "300s"
  }

  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }
}
# terraform import google_cloud_run_v2_service.search_service projects/youtube-kids-462502/locations/us-central1/services/search-service
