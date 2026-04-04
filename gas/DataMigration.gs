/**
 * Migrate existing top-level 'videos' and 'allowed_channels' collections
 * into user-scoped subcollections: users/{uid}/videos and users/{uid}/allowed_channels.
 *
 * Run this once from the GAS Editor after setting TARGET_UID in Script Properties
 * to your Firebase UID (the Google sub claim / user ID).
 */
function migrateDataToUser() {
  var props = PropertiesService.getScriptProperties();
  var uid = props.getProperty('TARGET_UID');
  if (!uid) throw new Error('Set TARGET_UID in Script Properties before running migration');

  var projectId = props.getProperty('FIREBASE_PROJECT_ID');
  var dbId = props.getProperty('FIREBASE_DATABASE_ID') || 'youtube-kids';
  var token = getFirestoreToken();
  var baseUrl = 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/' + dbId + '/documents';

  // --- Migrate allowed_channels ---
  Logger.log('Migrating allowed_channels...');
  var channelsUrl = baseUrl + '/allowed_channels?pageSize=300';
  var channelsRes = UrlFetchApp.fetch(channelsUrl, {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  });

  if (channelsRes.getResponseCode() === 200) {
    var channelDocs = JSON.parse(channelsRes.getContentText()).documents || [];
    Logger.log('Found ' + channelDocs.length + ' channels to migrate');

    channelDocs.forEach(function(doc) {
      var docId = doc.name.split('/').pop();
      var targetUrl = baseUrl + '/users/' + uid + '/allowed_channels/' + docId;
      UrlFetchApp.fetch(targetUrl, {
        method: 'patch',
        headers: { 'Authorization': 'Bearer ' + token },
        contentType: 'application/json',
        payload: JSON.stringify({ fields: doc.fields }),
        muteHttpExceptions: true
      });
    });
    Logger.log('Channels migration complete.');
  }

  // --- Migrate videos (paginated) ---
  Logger.log('Migrating videos...');
  var totalMigrated = 0;
  var nextPageToken = '';
  var commitUrl = baseUrl + ':commit';

  do {
    var videosUrl = baseUrl + '/videos?pageSize=300';
    if (nextPageToken) videosUrl += '&pageToken=' + nextPageToken;

    var videosRes = UrlFetchApp.fetch(videosUrl, {
      method: 'get',
      headers: { 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true
    });

    if (videosRes.getResponseCode() !== 200) {
      Logger.log('Failed to fetch videos: ' + videosRes.getContentText());
      break;
    }

    var videosData = JSON.parse(videosRes.getContentText());
    var videoDocs = videosData.documents || [];
    nextPageToken = videosData.nextPageToken || '';

    // Batch write in chunks of 400
    for (var i = 0; i < videoDocs.length; i += 400) {
      var chunk = videoDocs.slice(i, i + 400);
      var writes = chunk.map(function(doc) {
        var docId = doc.name.split('/').pop();
        return {
          update: {
            name: 'projects/' + projectId + '/databases/' + dbId + '/documents/users/' + uid + '/videos/' + docId,
            fields: doc.fields
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
        Logger.log('Batch write failed: ' + res.getContentText());
      }
    }

    totalMigrated += videoDocs.length;
    Logger.log('Migrated ' + totalMigrated + ' videos so far...');
  } while (nextPageToken);

  Logger.log('Migration complete! Total videos migrated: ' + totalMigrated);
}
