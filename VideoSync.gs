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

/**
 * Helper to test the sync manually from the GAS Editor.
 * Set TEST_UID in Script Properties to your Firebase UID.
 */
function testSync() {
  Logger.log('Starting Manual Test Sync...');
  var props = PropertiesService.getScriptProperties();
  var dbId = props.getProperty('FIREBASE_DATABASE_ID') || 'youtube-kids';
  var uid = props.getProperty('TEST_UID');
  if (!uid) throw new Error('Set TEST_UID in Script Properties to test sync');
  try {
    var count = performSync(uid, 'videos', dbId);
    Logger.log('Success! Total videos synced: ' + count);
  } catch (e) {
    Logger.log('Test Failed: ' + e.toString());
    Logger.log('Stack: ' + e.stack);
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

  UrlFetchApp.fetch(url, {
    method: 'patch',
    headers: { 'Authorization': 'Bearer ' + token },
    contentType: 'application/json',
    payload: JSON.stringify({ fields: firestoreFields }),
    muteHttpExceptions: true
  });
}

function performSync(uid, collectionName, databaseId) {
  if (!uid) throw new Error('uid is required for performSync');

  var props = PropertiesService.getScriptProperties();
  var projectId = props.getProperty('FIREBASE_PROJECT_ID');
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID not set in Script Properties');

  var dbId = databaseId || props.getProperty('FIREBASE_DATABASE_ID') || '(default)';
  Logger.log('Project ID: ' + projectId);
  Logger.log('Database ID: ' + dbId);
  Logger.log('User UID: ' + uid);

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
  Logger.log('Fetching channels from: ' + channelsUrl);

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
  var channels = channelsData.documents || [];
  Logger.log('Found ' + channels.length + ' channels in allowed_channels collection.');

  if (channels.length === 0) {
    Logger.log('No channels found.');
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
      var channelResponse = YouTube.Channels.list('contentDetails,snippet', { id: channelId });
      if (!channelResponse.items || channelResponse.items.length === 0) return;

      var uploadsPlaylistId = channelResponse.items[0].contentDetails.relatedPlaylists.uploads;
      var pageToken = '';

      while (pageToken != null) {
        var playlistResponse = YouTube.PlaylistItems.list('snippet', {
          playlistId: uploadsPlaylistId,
          maxResults: 50,
          pageToken: pageToken
        });

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
      Logger.log('  Error processing channel ' + channelId + ': ' + err.toString());
    }
  });

  Logger.log('Total videos to sync: ' + allVideos.length);

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
        Logger.log('  Batch write failed: ' + res.getContentText());
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
