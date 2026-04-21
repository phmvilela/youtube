#!/usr/bin/env bash
#
# Bootstrap: create the GCS bucket for Terraform remote state.
# Run this ONCE per GCP organization/account, before the first `terraform init`.
#
# Usage:
#   ./bootstrap.sh <project-id>
#
# Example:
#   ./bootstrap.sh youtube-kids-462502

set -euo pipefail

PROJECT_ID="${1:?Usage: ./bootstrap.sh <project-id>}"
BUCKET_NAME="${PROJECT_ID}-tf-state"
REGION="us-central1"

echo "Creating Terraform state bucket: gs://${BUCKET_NAME}"

gcloud storage buckets create "gs://${BUCKET_NAME}" \
  --project="${PROJECT_ID}" \
  --location="${REGION}" \
  --uniform-bucket-level-access \
  --pap \
  2>/dev/null || echo "Bucket already exists, skipping creation."

# Enable versioning so you can recover from bad state pushes
gcloud storage buckets update "gs://${BUCKET_NAME}" \
  --versioning

echo ""
echo "Done. Initialize Terraform with:"
echo "  cd terraform"
echo "  terraform init -backend-config=\"bucket=${BUCKET_NAME}\" -backend-config=\"prefix=prod\""
