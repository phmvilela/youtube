// Sync.gs - YouTube channel video sync to Firestore
//
// Uses shared helpers from Router.gs: getFirestoreToken(), toFirestoreValue()
//
// Required Script Properties:
//   FIREBASE_PROJECT_ID   - Firebase project ID
//   FIREBASE_DATABASE_ID  - Firestore database ID (defaults to 'youtube-kids')
//   SERVICE_ACCOUNT_JSON  - Service account credentials JSON
//
// Also requires the YouTube Data API v3 advanced service enabled in the GAS project.

var CLOUD_RUN_SYNC_URL = 'https://us-central1-youtube-kids-462502.cloudfunctions.net/youtube-videos-sync';
var GCS_BUCKET_NAME = 'youtube-kids-462502-videos';

/**
 * Helper to test the sync manually from the GAS Editor.
 * Set TEST_UID in Script Properties to your Firebase UID.
 */
function testSync() {
  console.log('Starting Manual Test Sync...');
  var props = PropertiesService.getScriptProperties();
  var dbId = props.getProperty('FIREBASE_DATABASE_ID') || 'youtube-kids';
  var uid = props.getProperty('TEST_UID');
  if (!uid) throw new Error('Set TEST_UID in Script Properties to test sync');
  try {
    var count = performSync(uid, 'videos', dbId);
    console.log('Success! Total videos synced: ' + count);
  } catch (e) {
    console.error('Test Failed: ' + e.toString());
    console.error('Stack: ' + e.stack);
  }
}

/**
 * Main sync logic.
 * Fetches allowed channels from Firestore, pulls their uploads from YouTube,
 * and batch-writes video metadata back to Firestore.
 *
 * @param {string} uid - The authenticated user's UID (scopes data under users/{uid}/)
 * @param {string} collectionName - Target sub-collection for videos (default 'videos')
 * @param {string} databaseId - Firestore database ID
 */
/**
 * Write or update the sync status document in Firestore so the frontend
 * can display real-time progress via onSnapshot.
 *
 * @param {string} statusDocUrl - Full REST URL for the sync_status/current document
 * @param {string} token - Firestore Bearer token
 * @param {Object} fields - Key/value pairs to write (merged into Firestore fields)
 */
function writeSyncStatus(statusDocUrl, token, fields) {
  var firestoreFields = {};
  for (var k in fields) {
    firestoreFields[k] = toFirestoreValue(fields[k]);
  }

  var updateMask = Object.keys(fields).map(function(k) { return 'updateMask.fieldPaths=' + k; }).join('&');
  var url = statusDocUrl + '?' + updateMask;

  var res = UrlFetchApp.fetch(url, {
    method: 'patch',
    headers: { 'Authorization': 'Bearer ' + token },
    contentType: 'application/json',
    payload: JSON.stringify({ fields: firestoreFields }),
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    console.error('writeSyncStatus failed (HTTP ' + res.getResponseCode() + '): ' + res.getContentText());
  }
}

function performSync(uid, collectionName, databaseId, userAccessToken) {
  if (!uid) throw new Error('uid is required for performSync');

  var props = PropertiesService.getScriptProperties();
  var projectId = props.getProperty('FIREBASE_PROJECT_ID');
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID not set in Script Properties');

  var dbId = databaseId || props.getProperty('FIREBASE_DATABASE_ID') || '(default)';
  console.log('Project ID: ' + projectId);
  console.log('Database ID: ' + dbId);
  console.log('User UID: ' + uid);

  var token = getFirestoreToken();
  var baseUrl = 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/' + dbId + '/documents';
  var userBase = baseUrl + '/users/' + uid;

  // Status document URL for progress tracking
  var statusDocUrl = userBase + '/sync_status/current';

  // Write initial status
  writeSyncStatus(statusDocUrl, token, {
    status: 'fetching_videos',
    total: 0,
    synced: 0,
    message: 'Fetching channels...',
    startedAt: new Date().toISOString()
  });

  // Step A: Fetch allowed channels from Firestore (user-scoped)
  var channelsUrl = userBase + '/allowed_channels?pageSize=100';
  console.log('Fetching channels from: ' + channelsUrl);

  var channelsRes = UrlFetchApp.fetch(channelsUrl, {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  });

  var channelsResponseText = channelsRes.getContentText();
  if (channelsRes.getResponseCode() !== 200) {
    throw new Error('Failed to fetch channels (HTTP ' + channelsRes.getResponseCode() + '): ' + channelsResponseText);
  }

  var channelsData = JSON.parse(channelsResponseText);
  var allChannelDocs = channelsData.documents || [];
  // Only sync channels with status 'active' (skip soft-deleted ones)
  var channels = allChannelDocs.filter(function(doc) {
    var statusField = doc.fields && doc.fields.status;
    return statusField && statusField.stringValue === 'active';
  });
  console.log('Found ' + channels.length + ' active channels out of ' + allChannelDocs.length + ' total.');

  if (channels.length === 0) {
    console.log('No channels found.');
    writeSyncStatus(statusDocUrl, token, {
      status: 'complete',
      total: 0,
      synced: 0,
      message: 'No channels found.'
    });
    return 0;
  }

  writeSyncStatus(statusDocUrl, token, {
    message: 'Fetching videos from ' + channels.length + ' channel(s)...'
  });

  var allVideos = [];

  // Step B: Fetch videos from YouTube
  channels.forEach(function(doc) {
    var pathParts = doc.name.split('/');
    var channelId = pathParts[pathParts.length - 1];

    try {
      var channelResponse = youtubeApiCall('channels', 'contentDetails,snippet', { id: channelId }, userAccessToken);
      if (!channelResponse.items || channelResponse.items.length === 0) return;

      var uploadsPlaylistId = channelResponse.items[0].contentDetails.relatedPlaylists.uploads;
      var pageToken = '';

      while (pageToken != null) {
        var plParams = { playlistId: uploadsPlaylistId, maxResults: 50 };
        if (pageToken) plParams.pageToken = pageToken;
        var playlistResponse = youtubeApiCall('playlistItems', 'snippet', plParams, userAccessToken);

        var items = playlistResponse.items || [];
        items.forEach(function(item) {
          var snippet = item.snippet;
          var title = snippet.title || '';
          var channelName = snippet.channelTitle || '';
          var rawWords = (title + ' ' + channelName).toLowerCase().split(/\W+/).filter(Boolean);
          var searchWords = rawWords.filter(function(item, pos) { return rawWords.indexOf(item) == pos; });

          var thumbnail = '';
          if (snippet.thumbnails) {
            thumbnail = (snippet.thumbnails.medium && snippet.thumbnails.medium.url) ||
                        (snippet.thumbnails.default && snippet.thumbnails.default.url);
          }

          allVideos.push({
            videoId: snippet.resourceId.videoId,
            title: title,
            channelName: channelName,
            channelId: snippet.channelId,
            publishedAt: snippet.publishedAt,
            thumbnail: thumbnail,
            searchWords: searchWords
          });
        });
        pageToken = playlistResponse.nextPageToken;
        if (allVideos.length > 5000) break;
      }
    } catch (err) {
      console.error('Error processing channel ' + channelId + ': ' + err.toString());
    }
  });

  console.log('Total videos to sync: ' + allVideos.length);

  // Update status with total count after YouTube fetch
  writeSyncStatus(statusDocUrl, token, {
    status: 'writing',
    total: allVideos.length,
    synced: 0,
    message: 'Writing ' + allVideos.length + ' videos to database...'
  });

  // Step C: Batch write to Firestore
  if (allVideos.length > 0) {
    var commitUrl = baseUrl + ':commit';
    var chunkSize = 400;
    var totalSynced = 0;

    for (var i = 0; i < allVideos.length; i += chunkSize) {
      var chunk = allVideos.slice(i, i + chunkSize);
      var writes = chunk.map(function(video) {
        return {
          update: {
            name: 'projects/' + projectId + '/databases/' + dbId + '/documents/users/' + uid + '/' + collectionName + '/' + video.videoId,
            fields: toFirestoreValue(video).mapValue.fields
          }
        };
      });

      var res = UrlFetchApp.fetch(commitUrl, {
        method: 'post',
        headers: { 'Authorization': 'Bearer ' + token },
        contentType: 'application/json',
        payload: JSON.stringify({ writes: writes }),
        muteHttpExceptions: true
      });

      if (res.getResponseCode() !== 200) {
        console.error('Batch write failed: ' + res.getContentText());
      } else {
        totalSynced += chunk.length;
        writeSyncStatus(statusDocUrl, token, {
          synced: totalSynced,
          message: totalSynced + ' of ' + allVideos.length + ' videos synced'
        });
      }
    }
  }

  // Mark sync as complete
  writeSyncStatus(statusDocUrl, token, {
    status: 'complete',
    synced: allVideos.length,
    message: 'Sync complete. ' + allVideos.length + ' videos synced.'
  });

  return allVideos.length;
}

/**
 * Sync videos for a single channel.
 * Writes per-channel progress to sync_status/channel_{channelId}.
 *
 * @param {string} uid - The authenticated user's UID
 * @param {string} channelId - The YouTube channel ID to sync
 * @param {string} collectionName - Target sub-collection for videos (default 'videos')
 * @param {string} databaseId - Firestore database ID
 * @returns {number} Number of videos synced
 */
function performChannelSync(uid, channelId, collectionName, databaseId, userAccessToken, firebaseIdToken) {
  if (!uid) throw new Error('uid is required');
  if (!channelId) throw new Error('channelId is required');

  var props = PropertiesService.getScriptProperties();
  var projectId = props.getProperty('FIREBASE_PROJECT_ID');
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID not set');

  var dbId = databaseId || props.getProperty('FIREBASE_DATABASE_ID') || '(default)';
  var token = getFirestoreToken();
  var baseUrl = 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/' + dbId + '/documents';
  var userBase = baseUrl + '/users/' + uid;
  var statusDocUrl = userBase + '/sync_status/channel_' + channelId;

  // Acquire GCS lock — if lock already exists (HTTP 412), skip this channel
  var gcsToken = getFirestoreToken(); // service account token with cloud-platform scope
  var lockUrl = 'https://storage.googleapis.com/upload/storage/v1/b/' + GCS_BUCKET_NAME +
    '/o?uploadType=media&name=channels/' + channelId + '/lock&ifGenerationMatch=0';
  var lockRes = UrlFetchApp.fetch(lockUrl, {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + gcsToken },
    contentType: 'application/octet-stream',
    payload: '',
    muteHttpExceptions: true
  });
  if (lockRes.getResponseCode() === 412) {
    console.log('Channel ' + channelId + ' already synced (lock exists). Skipping GCS export.');
  } else if (lockRes.getResponseCode() === 200) {
    console.log('Lock acquired for channel ' + channelId);
  } else {
    console.error('Unexpected lock response for channel ' + channelId + ' (HTTP ' + lockRes.getResponseCode() + '): ' + lockRes.getContentText());
  }
  var gcsLockAcquired = (lockRes.getResponseCode() === 200);

  writeSyncStatus(statusDocUrl, token, {
    status: 'fetching_videos',
    total: 0,
    synced: 0,
    message: 'Fetching videos...',
    startedAt: new Date().toISOString()
  });

  var videos = [];

  try {
    var channelResponse = youtubeApiCall('channels', 'contentDetails,snippet', { id: channelId }, userAccessToken);
    if (!channelResponse.items || channelResponse.items.length === 0) {
      writeSyncStatus(statusDocUrl, token, {
        status: 'complete', total: 0, synced: 0,
        message: 'Channel not found on YouTube.'
      });
      return 0;
    }

    var uploadsPlaylistId = channelResponse.items[0].contentDetails.relatedPlaylists.uploads;
    var pageToken = '';

    while (pageToken != null) {
      var plParams = { playlistId: uploadsPlaylistId, maxResults: 50 };
      if (pageToken) plParams.pageToken = pageToken;
      var playlistResponse = youtubeApiCall('playlistItems', 'snippet', plParams, userAccessToken);

      var items = playlistResponse.items || [];
      items.forEach(function(item) {
        var snippet = item.snippet;
        var title = snippet.title || '';
        var channelName = snippet.channelTitle || '';
        var rawWords = (title + ' ' + channelName).toLowerCase().split(/\W+/).filter(Boolean);
        var searchWords = rawWords.filter(function(w, pos) { return rawWords.indexOf(w) == pos; });

        var thumbnail = '';
        if (snippet.thumbnails) {
          thumbnail = (snippet.thumbnails.medium && snippet.thumbnails.medium.url) ||
                      (snippet.thumbnails.default && snippet.thumbnails.default.url);
        }

        videos.push({
          videoId: snippet.resourceId.videoId,
          title: title,
          channelName: channelName,
          channelId: snippet.channelId,
          publishedAt: snippet.publishedAt,
          thumbnail: thumbnail,
          searchWords: searchWords
        });
      });

      pageToken = playlistResponse.nextPageToken;
      if (videos.length > 5000) break;
    }
  } catch (err) {
    console.error('Error syncing channel ' + channelId + ': ' + err.toString());
    writeSyncStatus(statusDocUrl, token, {
      status: 'error',
      message: 'Error: ' + err.toString()
    });
    throw err;
  }

  console.log('Channel ' + channelId + ': ' + videos.length + ' videos to sync');

  // Write batches to GCS via Cloud Run (only if lock was acquired)
  if (gcsLockAcquired && videos.length > 0) {
    var batchSize = 400;
    var totalBatches = Math.ceil(videos.length / batchSize);
    console.log('Writing ' + totalBatches + ' batch(es) to GCS for channel ' + channelId);

    for (var b = 0; b < videos.length; b += batchSize) {
      var batchVideos = videos.slice(b, b + batchSize);
      var sequence = b / batchSize;

      var batchPayload = JSON.stringify({
        channelId: channelId,
        sequence: sequence,
        videos: batchVideos.map(function(v) {
          return {
            videoId: v.videoId,
            title: v.title,
            channelName: v.channelName,
            channelId: v.channelId,
            publishedAt: v.publishedAt,
            thumbnail: v.thumbnail
          };
        })
      });

      var batchRes = UrlFetchApp.fetch(CLOUD_RUN_SYNC_URL + '/writeBatch', {
        method: 'post',
        headers: { 'Authorization': 'Bearer ' + firebaseIdToken },
        contentType: 'application/json',
        payload: batchPayload,
        muteHttpExceptions: true
      });

      if (batchRes.getResponseCode() === 200) {
        console.log('Batch ' + sequence + ' written to GCS for channel ' + channelId);
      } else {
        console.error('Failed to write batch ' + sequence + ' for channel ' + channelId +
          ' (HTTP ' + batchRes.getResponseCode() + '): ' + batchRes.getContentText());
      }
    }
  }

  writeSyncStatus(statusDocUrl, token, {
    status: 'writing',
    total: videos.length,
    synced: 0,
    message: 'Writing ' + videos.length + ' videos...'
  });

  if (videos.length > 0) {
    var commitUrl = baseUrl + ':commit';
    var chunkSize = 400;
    var totalSynced = 0;

    for (var i = 0; i < videos.length; i += chunkSize) {
      var chunk = videos.slice(i, i + chunkSize);
      var writes = chunk.map(function(video) {
        return {
          update: {
            name: 'projects/' + projectId + '/databases/' + dbId + '/documents/users/' + uid + '/' + collectionName + '/' + video.videoId,
            fields: toFirestoreValue(video).mapValue.fields
          }
        };
      });

      var res = UrlFetchApp.fetch(commitUrl, {
        method: 'post',
        headers: { 'Authorization': 'Bearer ' + token },
        contentType: 'application/json',
        payload: JSON.stringify({ writes: writes }),
        muteHttpExceptions: true
      });

      if (res.getResponseCode() === 200) {
        totalSynced += chunk.length;
        writeSyncStatus(statusDocUrl, token, {
          synced: totalSynced,
          message: totalSynced + ' of ' + videos.length + ' videos synced'
        });
      } else {
        console.error('Batch write failed for channel ' + channelId + ': ' + res.getContentText());
      }
    }
  }

  writeSyncStatus(statusDocUrl, token, {
    status: 'complete',
    synced: videos.length,
    total: videos.length,
    message: 'Sync complete. ' + videos.length + ' videos synced.'
  });

  return videos.length;
}
