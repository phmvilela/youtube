project_id     = "familytube-prod"
project_number = "652091546311"
region         = "us-central1"
environment    = "prod"

firestore_database_id = "familytube"
videos_bucket_name    = "familytube-prod-videos"

google_oauth_client_id = "652091546311-k97frlt58am583qsr7g2741pd5cjcpmv.apps.googleusercontent.com"

search_service_image = "us-central1-docker.pkg.dev/familytube-prod/cloud-run-source-deploy/search-service:3ef4eb8fbe06b04d1e3a1cad8730afd078486811"

gcp_services = [
  "aiplatform.googleapis.com",
  "analyticshub.googleapis.com",
  "appengine.googleapis.com",
  "artifactregistry.googleapis.com",
  "bigquery.googleapis.com",
  "bigqueryconnection.googleapis.com",
  "bigquerydatapolicy.googleapis.com",
  "bigquerydatatransfer.googleapis.com",
  "bigquerymigration.googleapis.com",
  "bigqueryreservation.googleapis.com",
  "bigquerystorage.googleapis.com",
  "cloudapiregistry.googleapis.com",
  "cloudapis.googleapis.com",
  "cloudasset.googleapis.com",
  "cloudbuild.googleapis.com",
  "cloudfunctions.googleapis.com",
  "cloudresourcemanager.googleapis.com",
  "cloudtrace.googleapis.com",
  "containerregistry.googleapis.com",
  "dataform.googleapis.com",
  "datalineage.googleapis.com",
  "dataplex.googleapis.com",
  "datastore.googleapis.com",
  "drive.googleapis.com",
  "fcm.googleapis.com",
  "fcmregistrations.googleapis.com",
  "firebase.googleapis.com",
  "firebaseappdistribution.googleapis.com",
  "firebasehosting.googleapis.com",
  "firebaseinstallations.googleapis.com",
  "firebaseremoteconfig.googleapis.com",
  "firebaseremoteconfigrealtime.googleapis.com",
  "firebaserules.googleapis.com",
  "firestore.googleapis.com",
  "generativelanguage.googleapis.com",
  "iam.googleapis.com",
  "iamcredentials.googleapis.com",
  "identitytoolkit.googleapis.com",
  "logging.googleapis.com",
  "monitoring.googleapis.com",
  "pubsub.googleapis.com",
  "run.googleapis.com",
  "runtimeconfig.googleapis.com",
  "script.googleapis.com",
  "securetoken.googleapis.com",
  "servicemanagement.googleapis.com",
  "serviceusage.googleapis.com",
  "sql-component.googleapis.com",
  "storage-api.googleapis.com",
  "storage-component.googleapis.com",
  "storage.googleapis.com",
  "telemetry.googleapis.com",
  "testing.googleapis.com",
  "visionai.googleapis.com",
  "youtube.googleapis.com",
]
