#!/usr/bin/env bash
#
# Import existing UAT resources into Terraform state.
# Run ONCE after `terraform init` to adopt current infrastructure.
#
# Prerequisites:
#   1. Run bootstrap.sh to create the state bucket
#   2. Run: terraform init -backend-config="bucket=youtube-kids-462502-tf-state" -backend-config="prefix=uat"
#   3. Run: ./import-uat.sh
#
# Each command is idempotent — re-running skips already-imported resources.

set -euo pipefail

PROJECT_ID="youtube-kids-462502"
PROJECT_NUMBER="944053436879"
REGION="us-central1"

import() {
  local addr="$1"
  local id="$2"
  echo "Importing ${addr}..."
  terraform import -var-file=environments/uat.tfvars "$addr" "$id" 2>&1 || {
    if grep -q "Resource already managed" <<< "$(terraform import -var-file=environments/uat.tfvars "$addr" "$id" 2>&1)"; then
      echo "  Already imported, skipping."
    else
      echo "  WARNING: import failed for ${addr}"
    fi
  }
}

echo "=== GCP API Services ==="
SERVICES=(
  "aiplatform.googleapis.com"
  "analyticshub.googleapis.com"
  "appengine.googleapis.com"
  "artifactregistry.googleapis.com"
  "bigquery.googleapis.com"
  "bigqueryconnection.googleapis.com"
  "bigquerydatapolicy.googleapis.com"
  "bigquerydatatransfer.googleapis.com"
  "bigquerymigration.googleapis.com"
  "bigqueryreservation.googleapis.com"
  "bigquerystorage.googleapis.com"
  "cloudapiregistry.googleapis.com"
  "cloudapis.googleapis.com"
  "cloudasset.googleapis.com"
  "cloudbuild.googleapis.com"
  "cloudfunctions.googleapis.com"
  "cloudresourcemanager.googleapis.com"
  "cloudtrace.googleapis.com"
  "containerregistry.googleapis.com"
  "dataform.googleapis.com"
  "datalineage.googleapis.com"
  "dataplex.googleapis.com"
  "datastore.googleapis.com"
  "drive.googleapis.com"
  "fcm.googleapis.com"
  "fcmregistrations.googleapis.com"
  "firebase.googleapis.com"
  "firebaseappdistribution.googleapis.com"
  "firebasehosting.googleapis.com"
  "firebaseinstallations.googleapis.com"
  "firebaseremoteconfig.googleapis.com"
  "firebaseremoteconfigrealtime.googleapis.com"
  "firebaserules.googleapis.com"
  "firestore.googleapis.com"
  "generativelanguage.googleapis.com"
  "iam.googleapis.com"
  "iamcredentials.googleapis.com"
  "identitytoolkit.googleapis.com"
  "logging.googleapis.com"
  "monitoring.googleapis.com"
  "pubsub.googleapis.com"
  "run.googleapis.com"
  "runtimeconfig.googleapis.com"
  "script.googleapis.com"
  "securetoken.googleapis.com"
  "servicemanagement.googleapis.com"
  "serviceusage.googleapis.com"
  "sql-component.googleapis.com"
  "storage-api.googleapis.com"
  "storage-component.googleapis.com"
  "storage.googleapis.com"
  "telemetry.googleapis.com"
  "testing.googleapis.com"
  "visionai.googleapis.com"
  "youtube.googleapis.com"
)

for svc in "${SERVICES[@]}"; do
  import "google_project_service.services[\"${svc}\"]" "${PROJECT_ID}/${svc}"
done

echo ""
echo "=== Firestore Database ==="
import "google_firestore_database.main" "projects/${PROJECT_ID}/databases/youtube-kids"

echo ""
echo "=== Service Accounts ==="
import "google_service_account.video_sync_function" \
  "projects/${PROJECT_ID}/serviceAccounts/video-sync-function-sa@${PROJECT_ID}.iam.gserviceaccount.com"

import "google_service_account.gas_firestore_sync" \
  "projects/${PROJECT_ID}/serviceAccounts/gas-firestore-sync@${PROJECT_ID}.iam.gserviceaccount.com"

import "google_service_account.video_sync_gas" \
  "projects/${PROJECT_ID}/serviceAccounts/video-sync-gas-sa@${PROJECT_ID}.iam.gserviceaccount.com"

echo ""
echo "=== Storage Buckets ==="
import "google_storage_bucket.videos" "${PROJECT_ID}-videos"

echo ""
echo "=== Artifact Registry ==="
import "google_artifact_registry_repository.cloud_run_source_deploy" \
  "projects/${PROJECT_ID}/locations/${REGION}/repositories/cloud-run-source-deploy"

echo ""
echo "=== Cloud Functions ==="
import "google_cloudfunctions2_function.youtube_videos_sync" \
  "projects/${PROJECT_ID}/locations/${REGION}/functions/youtube-videos-sync"

echo ""
echo "=== Cloud Run ==="
import "google_cloud_run_v2_service.search_service" \
  "projects/${PROJECT_ID}/locations/${REGION}/services/search-service"

echo ""
echo "=== Import complete ==="
echo "Run 'terraform plan -var-file=environments/uat.tfvars' to verify — a clean plan means the import matches reality."
