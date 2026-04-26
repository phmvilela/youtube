terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    # Configured per environment via -backend-config flags:
    #   terraform init \
    #     -backend-config="bucket=<your-tf-state-bucket>" \
    #     -backend-config="prefix=<environment>"
    #
    # Example:
    #   terraform init -backend-config="bucket=youtube-kids-tf-state" -backend-config="prefix=prod"
    #
    # The state bucket must be created before first init. See bootstrap.sh.
  }
}

provider "google" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
}
