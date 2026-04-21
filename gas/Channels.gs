// Channels.gs - YouTube channel search and management
//
// Uses shared helpers from Router.gs: getFirestoreToken(), toFirestoreValue()
// Requires the YouTube Data API v3 advanced service enabled in the GAS project.

/**
 * Search YouTube for channels matching a query string.
 *
 * @param {string} queryStr - The search query
 * @returns {Object} { success: true, channels: [{id, name, thumbnail}] }
 */
function searchChannels(queryStr, userAccessToken) {
  if (!queryStr || queryStr.trim().length < 2) {
    return { success: true, channels: [] };
  }

  var response = youtubeApiCall('search', 'snippet', {
    q: queryStr,
    type: 'channel',
    maxResults: 10
  }, userAccessToken);

  var channels = (response.items || []).map(function(item) {
    return {
      id: item.snippet.channelId,
      name: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails && item.snippet.thumbnails.default
        ? item.snippet.thumbnails.default.url
        : ''
    };
  });

  return { success: true, channels: channels };
}

/**
 * Add a channel to the user's allowed_channels collection in Firestore.
 *
 * @param {string} uid - The authenticated user's UID
 * @param {Object} channel - { id, name, thumbnail }
 * @returns {Object} { success: true }
 */
function addChannel(uid, channel) {
  if (!uid) throw new Error('uid is required');
  if (!channel || !channel.id) throw new Error('channel.id is required');

  var props = PropertiesService.getScriptProperties();
  var projectId = props.getProperty('FIREBASE_PROJECT_ID');
  var dbId = props.getProperty('FIREBASE_DATABASE_ID');
  if (!dbId) throw new Error('FIREBASE_DATABASE_ID not set in Script Properties');
  var token = getFirestoreToken();

  var docUrl = 'https://firestore.googleapis.com/v1/projects/' + projectId +
    '/databases/' + dbId + '/documents/users/' + uid +
    '/allowed_channels/' + channel.id;

  var fields = toFirestoreValue({
    id: channel.id,
    name: channel.name || '',
    thumbnail: channel.thumbnail || '',
    status: 'active'
  }).mapValue.fields;

  var res = UrlFetchApp.fetch(docUrl, {
    method: 'patch',
    headers: { 'Authorization': 'Bearer ' + token },
    contentType: 'application/json',
    payload: JSON.stringify({ fields: fields }),
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    throw new Error('Failed to add channel: ' + res.getContentText());
  }

  return { success: true };
}
