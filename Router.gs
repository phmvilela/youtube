// Router.gs - Single doPost entry point + shared Firestore helpers
//
// GAS allows only one doPost across all .gs files in a project.
// This file routes requests by "action" to the appropriate handler
// in Sync.gs or Auth.gs.

function doPost(e) {
  Logger.log('doPost triggered');
  try {
    var req = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    var action = req.action || 'sync';

    var result;
    switch (action) {
      // Auth actions (Auth.gs)
      case 'exchangeCode':
        result = exchangeAuthCode(req);
        break;
      case 'refreshAccessToken':
        result = refreshAccessToken(req);
        break;
      case 'revokeTokens':
        result = revokeUserTokens(req);
        break;

      // Sync actions (Sync.gs)
      case 'sync':
      default:
        var collectionName = req.collectionName || 'videos';
        var databaseId = 'youtube-kids';
        Logger.log('Target database: ' + databaseId);
        Logger.log('Target collection: ' + collectionName);
        var syncedCount = performSync(collectionName, databaseId);
        result = { success: true, syncedCount: syncedCount };
        break;
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error in doPost: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString(),
      stack: error.stack
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ---------------------------------------------------------------------------
// Shared helpers — used by both Sync.gs and Auth.gs
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
