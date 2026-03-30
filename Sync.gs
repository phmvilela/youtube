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
 */
function testSync() {
  Logger.log('Starting Manual Test Sync...');
  var props = PropertiesService.getScriptProperties();
  var dbId = props.getProperty('FIREBASE_DATABASE_ID') || 'youtube-kids';
  try {
    var count = performSync('videos', dbId);
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
 */
function performSync(collectionName, databaseId) {
  var props = PropertiesService.getScriptProperties();
  var projectId = props.getProperty('FIREBASE_PROJECT_ID');
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID not set in Script Properties');

  var dbId = databaseId || props.getProperty('FIREBASE_DATABASE_ID') || '(default)';
  Logger.log('Project ID: ' + projectId);
  Logger.log('Database ID: ' + dbId);

  var token = getFirestoreToken();
  var baseUrl = 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/' + dbId + '/documents';

  // Step A: Fetch allowed channels from Firestore
  var channelsUrl = baseUrl + '/allowed_channels?pageSize=100';
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
    return 0;
  }

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

  // Step C: Batch write to Firestore
  if (allVideos.length > 0) {
    var commitUrl = baseUrl + ':commit';
    var chunkSize = 400;

    for (var i = 0; i < allVideos.length; i += chunkSize) {
      var chunk = allVideos.slice(i, i + chunkSize);
      var writes = chunk.map(function(video) {
        return {
          update: {
            name: 'projects/' + projectId + '/databases/' + dbId + '/documents/' + collectionName + '/' + video.videoId,
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
      }
    }
  }

  return allVideos.length;
}
