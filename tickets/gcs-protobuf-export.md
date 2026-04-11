# Export synced video batches to GCS as protobuf via Cloud Run

## Goal

Store YouTube video metadata as protobuf files in GCS, organized **per channel** (not per user). When a user triggers a sync for a channel, GAS acquires a lock in GCS, fetches video data from YouTube, and sends batches to a Cloud Run function that writes them as individual protobuf files. These files are the source of truth for a future search feature.

Video data is shared across users — no user-specific fields exist in the protobuf objects.

---

## GCS bucket layout

```
gs://{bucket}/
  channels/
    {channelId}/
      lock                          # Lock object (empty body, presence = synced)
      batch-{sequence}.pb           # Individual batch files (fixed-size, ~400 videos each)
```

- **`lock`** — Created by GAS directly via the GCS JSON API with `ifGenerationMatch: 0` (create-only). Presence means this channel has been synced and **is permanently locked** — users cannot re-trigger a sync for it. The lock is never released by the sync flow. Only out-of-scope periodic systems may manage lock lifecycle.
- **`batch-{sequence}.pb`** — Each file contains a serialized `VideoBatch` protobuf with up to 400 videos. Sequence is zero-padded (e.g., `batch-000.pb`, `batch-001.pb`).

---

## Lock mechanism (user-initiated sync only)

This lock applies to user-initiated syncs only. Periodic/scheduled updates will use a different mechanism (out of scope).

GAS acquires the lock **directly** via the GCS JSON API — no Cloud Run involvement.

1. GAS sends a `POST` to `https://storage.googleapis.com/upload/storage/v1/b/{bucket}/o?name=channels/{channelId}/lock&ifGenerationMatch=0` with an empty body.
   - **Success (HTTP 200):** Lock acquired (object created). GAS proceeds with sync.
   - **Precondition failed (HTTP 412):** Lock object already exists — this channel has already been synced. GAS skips this channel and continues to the next.
2. The lock is **never released** by the sync flow. Once a channel is synced, the lock persists permanently. Users cannot re-trigger a sync for an already-synced channel.
3. Only out-of-scope periodic systems may delete or manage lock objects (e.g., to allow re-sync with updated data).

---

## Data flow

### Sync sequence (GAS orchestrates)

For each channel being synced:

1. **Acquire lock** — GAS calls the GCS JSON API directly with `ifGenerationMatch: 0` to create the lock object. If HTTP 412, skip channel (already synced).
2. **Fetch from YouTube** — GAS fetches all videos from the channel's uploads playlist (existing logic in `VideoSync.gs`).
3. **Write batches to GCS** — GAS chunks videos into batches of 400 and calls Cloud Run sequentially: `POST /writeBatch { channelId, sequence, videos }`. Cloud Run serializes the batch to protobuf and writes `channels/{channelId}/batch-{sequence}.pb`.
4. **Write to Firestore** — GAS writes the same video data to Firestore (existing logic, unchanged).

**No lock release.** The lock persists after sync completes. If GAS crashes mid-sync, the lock remains — the channel will appear as "synced" even if incomplete. Periodic out-of-scope systems are responsible for detecting and reconciling incomplete syncs.

### Error handling

Error reconciliation is handled by out-of-scope periodic systems. In this implementation:
- Cloud Run batch write failures are **logged** in GAS (`Logger.log`).
- Firestore writes proceed regardless of Cloud Run failures (Firestore remains the primary read store until search is migrated).

---

## Authentication

GAS runs server-side and uses a **service account** for all external calls (not Firebase ID tokens).

**GAS → GCS (lock acquisition):**
- GAS uses `ScriptApp.getOAuthToken()` to get an access token.
- The GAS service account needs `roles/storage.objectUser` on the bucket (to create the lock object).

**GAS → Cloud Run (batch writes):**
- Same `ScriptApp.getOAuthToken()` token.
- The Cloud Run function's IAM policy grants `roles/run.invoker` to the GAS service account.
- Cloud Run validates the token via IAM (built-in, no code needed when deployed with `--no-allow-unauthenticated`).

No Firebase ID token verification is needed on the Cloud Run side for these endpoints.

---

## Protobuf schema

Location: `proto/videos.proto` — shared source of truth.

```proto
syntax = "proto3";

message Video {
  string video_id     = 1;
  string title        = 2;
  string channel_name = 3;
  string channel_id   = 4;
  string published_at = 5;
  string thumbnail    = 6;
}

message VideoBatch {
  repeated Video videos = 1;
}
```

**Notes:**
- No `searchWords` field — search indexing is a read-time concern, not storage.
- No user-specific fields — channel video data is shared across all users.
- Each `batch-{sequence}.pb` file contains one serialized `VideoBatch`.

---

## GCS bucket setup

The bucket already contains the proper permissions to be accessed by GAS and Cloud Run function

### Post-deploy: Grant GAS invoker access to Cloud Run (to be run manually)

Run this **after** deploying the Cloud Run function:

```bash
export PROJECT_ID="youtube-kids-462502"
export REGION="us-central1"
export GAS_SA="your-gas-sa@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud run services add-iam-policy-binding youtube-videos-sync \
  --region=${REGION} \
  --member="serviceAccount:${GAS_SA}" \
  --role="roles/run.invoker"
```

---

## Implementation checklist

### `proto/`
- [ ] Add `proto/videos.proto` with the schema above
- [ ] Add `proto/README.md` noting how to regenerate bindings for each consumer

### `functions/` (Cloud Run)

New HTTP handler alongside the existing `streamContents`:

- [ ] **`POST /writeBatch`** — Accepts `{ channelId, sequence, videos }`. Serializes `videos` into a `VideoBatch` protobuf. Writes to `channels/{channelId}/batch-{sequence}.pb` in GCS. Returns 200.
- [ ] Add `@google-cloud/storage` and `protobufjs` dependencies
- [ ] Add `GCS_BUCKET_NAME` env var (read from `process.env`)
- [ ] Deploy with `--no-allow-unauthenticated` (IAM auth only)

### `gas/VideoSync.gs`

Changes to `performChannelSync` (the per-channel sync function):

- [ ] Add `CLOUD_RUN_SYNC_URL` constant at the top of the file
- [ ] Add `GCS_BUCKET_NAME` constant at the top of the file
- [ ] Before YouTube fetch: call the GCS JSON API directly to create `channels/{channelId}/lock` with `ifGenerationMatch: 0`. If HTTP 412, log "channel already synced" and return early.
- [ ] After YouTube fetch, before Firestore write: loop through video chunks and call Cloud Run `POST /writeBatch` for each with the sequence number. Log failures via `Logger.log`.
- [ ] Use `ScriptApp.getOAuthToken()` for the `Authorization: Bearer` header on both GCS and Cloud Run calls.

Changes to `performSync` (the full sync function):

- [ ] The per-channel loop already calls `performChannelSync` — GCS logic is encapsulated there. No structural changes needed to `performSync` itself beyond ensuring it handles the "lock not acquired" case (channel skipped) gracefully.

---

## Out of scope

- **Read-time compose / search** — Composing batch files at read time (including GCS Compose chaining for channels with >32 batches) is a future requirement
- **Periodic sync and lock lifecycle** — Scheduled re-sync of channels, lock deletion/management, and incomplete sync detection are handled by separate periodic systems (run every few minutes)
- **Error reconciliation** — Detecting and retrying failed batch writes is handled by the same periodic systems
- **Batch cleanup** — Removing stale or orphaned batch files
- **Deletion / compaction** — Removing videos that were deleted from YouTube
- **Firestore-to-GCS backfill** — Migrating existing Firestore video data to GCS
- **`searchWords` in protobuf** — Search indexing is deferred to the read/search implementation
