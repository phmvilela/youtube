// Router.gs - Single doPost entry point + shared Firestore helpers
//
// GAS allows only one doPost across all .gs files in a project.
// This file routes requests by "action" to the appropriate handler
// in Sync.gs or Auth.gs.

function doPost(e) {
  console.log('doPost triggered');
  try {
    var req = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    var action = req.action || 'sync';

    var accessToken = req.accessToken || null;

    var result;
    switch (action) {
      // Channel actions (Channels.gs)
      case 'searchChannels':
        var searchUid = verifyFirebaseIdToken(req.firebaseIdToken);
        result = searchChannels(req.query, accessToken);
        break;
      case 'addChannel':
        var addUid = verifyFirebaseIdToken(req.firebaseIdToken);
        result = addChannel(addUid, req.channel);
        break;

      // Sync actions (Sync.gs)
      case 'syncChannel':
        var syncChUid = verifyFirebaseIdToken(req.firebaseIdToken);
        var chCollectionName = req.collectionName || 'videos';
        var chDatabaseId = 'youtube-kids';
        try {
          var chSyncedCount = performChannelSync(syncChUid, req.channelId, chCollectionName, chDatabaseId, accessToken, req.firebaseIdToken);
          result = { success: true, syncedCount: chSyncedCount };
        } catch (chSyncError) {
          throw chSyncError;
        }
        break;

      case 'sync':
      default:
        var uid = verifyFirebaseIdToken(req.firebaseIdToken);
        var collectionName = req.collectionName || 'videos';
        var databaseId = 'youtube-kids';
        console.log('Target database: ' + databaseId);
        console.log('Target collection: ' + collectionName);
        console.log('User UID: ' + uid);
        try {
          var syncedCount = performSync(uid, collectionName, databaseId, accessToken);
          result = { success: true, syncedCount: syncedCount };
        } catch (syncError) {
          // Write error status to Firestore so frontend can display it
          try {
            var props = PropertiesService.getScriptProperties();
            var projectId = props.getProperty('FIREBASE_PROJECT_ID');
            var token = getFirestoreToken();
            var statusDocUrl = 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/' + databaseId + '/documents/users/' + uid + '/sync_status/current';
            writeSyncStatus(statusDocUrl, token, {
              status: 'error',
              message: syncError.toString()
            });
          } catch (statusErr) {
            console.error('Failed to write error status: ' + statusErr.toString());
          }
          throw syncError;
        }
        break;
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.error('Error in doPost: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString(),
      stack: error.stack
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ---------------------------------------------------------------------------
// Firebase ID token verification
// ---------------------------------------------------------------------------

/**
 * Verify a Firebase ID token.
 * Decodes the JWT payload for structural checks, then validates the token
 * via the Firebase Auth REST API (accounts:lookup).
 *
 * @param {string} idToken - Firebase ID token from the client
 * @returns {string} The authenticated user's UID.
 */
function verifyFirebaseIdToken(idToken) {
  if (!idToken) throw new Error('No Firebase ID token provided');

  var props = PropertiesService.getScriptProperties();
  var projectId = props.getProperty('FIREBASE_PROJECT_ID');

  var parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed ID token');

  var payload = JSON.parse(
    Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[1])).getDataAsString()
  );

  var now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error('Token expired');
  if (payload.aud !== projectId) throw new Error('Invalid audience');
  if (payload.iss !== 'https://securetoken.google.com/' + projectId) throw new Error('Invalid issuer');
  if (!payload.sub) throw new Error('Missing subject claim');

  var token = getFirestoreToken();
  var res = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup',
    {
      method: 'post',
      headers: { 'Authorization': 'Bearer ' + token },
      contentType: 'application/json',
      payload: JSON.stringify({ idToken: idToken }),
      muteHttpExceptions: true
    }
  );

  if (res.getResponseCode() !== 200) {
    throw new Error('ID token verification failed: ' + res.getContentText());
  }

  var data = JSON.parse(res.getContentText());
  if (!data.users || data.users.length === 0) {
    throw new Error('No user found for ID token');
  }

  return payload.sub;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Generate an OAuth Bearer token from the service-account JSON stored in
 * Script Properties.  Scopes cover Firestore + Cloud Platform.
 */
function getFirestoreToken() {
  var props = PropertiesService.getScriptProperties();
  var saJsonStr = props.getProperty('SERVICE_ACCOUNT_JSON');
  var saJson = JSON.parse(saJsonStr);

  var header = { alg: 'RS256', typ: 'JWT' };
  var now = Math.floor(Date.now() / 1000);
  var claim = {
    iss: saJson.client_email,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  var toSign =
    Utilities.base64EncodeWebSafe(JSON.stringify(header)).replace(/=+$/, '') + '.' +
    Utilities.base64EncodeWebSafe(JSON.stringify(claim)).replace(/=+$/, '');
  var signatureBytes = Utilities.computeRsaSha256Signature(toSign, saJson.private_key);
  var signature = Utilities.base64EncodeWebSafe(signatureBytes).replace(/=+$/, '');
  var jwt = toSign + '.' + signature;

  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }
  });

  return JSON.parse(res.getContentText()).access_token;
}

/**
 * Call the YouTube Data API v3 using a user-provided OAuth access token.
 * This lets the script run as "me" while charging YouTube quota to the user.
 *
 * @param {string} endpoint - e.g. 'search', 'channels', 'playlistItems'
 * @param {string} part - e.g. 'snippet', 'contentDetails,snippet'
 * @param {Object} params - query parameters (excluding 'part' and 'key')
 * @param {string} userAccessToken - the user's Google OAuth access token
 * @returns {Object} parsed JSON response
 */
function youtubeApiCall(endpoint, part, params, userAccessToken) {
  var qs = 'part=' + encodeURIComponent(part);
  for (var k in params) {
    qs += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }
  var url = 'https://www.googleapis.com/youtube/v3/' + endpoint + '?' + qs;

  var res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + userAccessToken },
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    throw new Error('YouTube API ' + endpoint + ' failed (HTTP ' + res.getResponseCode() + '): ' + res.getContentText());
  }

  return JSON.parse(res.getContentText());
}

/**
 * Convert a JS value to a Firestore REST API value object.
 */
function toFirestoreValue(val) {
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'number') return { doubleValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } };
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (val === null) return { nullValue: null };
  if (typeof val === 'object') {
    var fields = {};
    for (var k in val) { fields[k] = toFirestoreValue(val[k]); }
    return { mapValue: { fields: fields } };
  }
  return { stringValue: String(val) };
}
