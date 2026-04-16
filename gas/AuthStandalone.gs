// AuthStandalone.gs - Standalone GAS web app for authentication
//
// Deploy this as its own Apps Script project (NOT linked to GCP).
//
// Required Script Properties:
//   GOOGLE_CLIENT_ID       - OAuth 2.0 Client ID (Web application type)
//   GOOGLE_CLIENT_SECRET   - OAuth 2.0 Client Secret
//   FIREBASE_PROJECT_ID    - e.g. "youtube-kids-462502"
//   FIREBASE_DATABASE_ID   - e.g. "youtube-kids"
//   SERVICE_ACCOUNT_JSON   - Full service account JSON key

function doPost(e) {
  try {
    var req = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    var action = req.action || '';

    var result;
    switch (action) {
      case 'exchangeCode':
        result = exchangeAuthCode(req);
        break;
      case 'refreshAccessToken':
        result = refreshAccessToken(req);
        break;
      case 'revokeTokens':
        result = revokeUserTokens(req);
        break;
      case 'requestDeviceCode':
        result = requestDeviceCode(req);
        break;
      case 'pollDeviceToken':
        result = pollDeviceToken(req);
        break;
      default:
        throw new Error('Unknown action: ' + action);
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
// Auth handlers
// ---------------------------------------------------------------------------

function exchangeAuthCode(req) {
  var props = PropertiesService.getScriptProperties();
  var clientId = props.getProperty('GOOGLE_CLIENT_ID');
  var clientSecret = props.getProperty('GOOGLE_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in Script Properties');
  }

  var tokenResponse = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      code: req.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: req.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: req.codeVerifier
    },
    muteHttpExceptions: true
  });

  var tokenData = JSON.parse(tokenResponse.getContentText());

  if (tokenResponse.getResponseCode() !== 200) {
    throw new Error('Token exchange failed: ' + (tokenData.error_description || tokenData.error));
  }

  var userInfo = getGoogleUserInfo(tokenData.access_token);

  storeUserTokens(userInfo.sub, {
    refreshToken: tokenData.refresh_token,
    accessToken: tokenData.access_token,
    expiresAt: Date.now() + (tokenData.expires_in * 1000),
    scope: tokenData.scope
  });

  var firebaseToken = createFirebaseCustomToken(userInfo.sub, {
    email: userInfo.email,
    name: userInfo.name,
    picture: userInfo.picture
  });

  return {
    success: true,
    firebaseToken: firebaseToken,
    accessToken: tokenData.access_token,
    expiresIn: tokenData.expires_in,
    displayName: userInfo.name || null,
    photoURL: userInfo.picture || null,
    user: {
      uid: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture
    }
  };
}

function refreshAccessToken(req) {
  var uid = verifyFirebaseIdToken(req.firebaseIdToken);

  var props = PropertiesService.getScriptProperties();
  var clientId = props.getProperty('GOOGLE_CLIENT_ID');
  var clientSecret = props.getProperty('GOOGLE_CLIENT_SECRET');

  var storedTokens = getUserTokens(uid);
  if (!storedTokens || !storedTokens.refreshToken) {
    throw new Error('No refresh token found for user. Re-authentication required.');
  }

  var tokenResponse = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: storedTokens.refreshToken,
      grant_type: 'refresh_token'
    },
    muteHttpExceptions: true
  });

  var tokenData = JSON.parse(tokenResponse.getContentText());

  if (tokenResponse.getResponseCode() !== 200) {
    throw new Error('Token refresh failed: ' + (tokenData.error_description || tokenData.error));
  }

  updateUserAccessToken(uid, {
    accessToken: tokenData.access_token,
    expiresAt: Date.now() + (tokenData.expires_in * 1000)
  });

  return {
    success: true,
    accessToken: tokenData.access_token,
    expiresIn: tokenData.expires_in
  };
}

function revokeUserTokens(req) {
  var uid = verifyFirebaseIdToken(req.firebaseIdToken);

  var storedTokens = getUserTokens(uid);
  if (storedTokens && storedTokens.refreshToken) {
    UrlFetchApp.fetch('https://oauth2.googleapis.com/revoke?token=' + storedTokens.refreshToken, {
      method: 'post',
      muteHttpExceptions: true
    });
  }

  deleteUserTokens(uid);

  return { success: true };
}

// ---------------------------------------------------------------------------
// Device Authorization Grant (TV / big-screen flow)
// ---------------------------------------------------------------------------

/**
 * Step 1: Request a device code from Google.
 * Returns a user_code and verification_url for display on the TV screen.
 *
 * Prerequisite: Create an OAuth 2.0 client of type "TVs and Limited Input
 * devices" in the Google Cloud Console and store its credentials as
 * DEVICE_CLIENT_ID / DEVICE_CLIENT_SECRET in Script Properties.
 * Falls back to the regular web client if those are not set.
 */
function requestDeviceCode(req) {
  var props = PropertiesService.getScriptProperties();
  var clientId = props.getProperty('DEVICE_CLIENT_ID') || props.getProperty('GOOGLE_CLIENT_ID');

  var scopes = [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/youtube.readonly'
  ].join(' ');

  var response = UrlFetchApp.fetch('https://oauth2.googleapis.com/device/code', {
    method: 'post',
    payload: {
      client_id: clientId,
      scope: scopes
    },
    muteHttpExceptions: true
  });

  var data = JSON.parse(response.getContentText());

  if (response.getResponseCode() !== 200) {
    throw new Error('Device code request failed: ' + (data.error_description || data.error));
  }

  return {
    success: true,
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUrl: data.verification_url,
    expiresIn: data.expires_in,
    interval: data.interval
  };
}

/**
 * Step 2: Poll Google's token endpoint with the device code.
 * Returns { pending: true } while the user hasn't authorized yet.
 * Once authorized, exchanges tokens, stores them server-side, creates a
 * Firebase custom token, and returns it — same as exchangeAuthCode.
 */
function pollDeviceToken(req) {
  var props = PropertiesService.getScriptProperties();
  var clientId = props.getProperty('DEVICE_CLIENT_ID') || props.getProperty('GOOGLE_CLIENT_ID');
  var clientSecret = props.getProperty('DEVICE_CLIENT_SECRET') || props.getProperty('GOOGLE_CLIENT_SECRET');

  var tokenResponse = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      client_id: clientId,
      client_secret: clientSecret,
      device_code: req.deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    },
    muteHttpExceptions: true
  });

  var tokenData = JSON.parse(tokenResponse.getContentText());

  // User hasn't authorized yet — keep polling
  if (tokenData.error === 'authorization_pending') {
    return { success: true, pending: true };
  }

  if (tokenData.error === 'slow_down') {
    return { success: true, pending: true, slowDown: true };
  }

  if (tokenData.error === 'access_denied') {
    throw new Error('Access denied by user');
  }

  if (tokenData.error === 'expired_token') {
    throw new Error('Device code expired. Please try again.');
  }

  if (tokenData.error) {
    throw new Error('Token error: ' + (tokenData.error_description || tokenData.error));
  }

  // Success — got tokens. Same post-processing as exchangeAuthCode.
  var userInfo = getGoogleUserInfo(tokenData.access_token);

  storeUserTokens(userInfo.sub, {
    refreshToken: tokenData.refresh_token,
    accessToken: tokenData.access_token,
    expiresAt: Date.now() + (tokenData.expires_in * 1000),
    scope: tokenData.scope
  });

  var firebaseToken = createFirebaseCustomToken(userInfo.sub, {
    email: userInfo.email,
    name: userInfo.name,
    picture: userInfo.picture
  });

  return {
    success: true,
    pending: false,
    firebaseToken: firebaseToken,
    accessToken: tokenData.access_token,
    expiresIn: tokenData.expires_in,
    displayName: userInfo.name || null,
    photoURL: userInfo.picture || null
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGoogleUserInfo(accessToken) {
  var res = UrlFetchApp.fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { 'Authorization': 'Bearer ' + accessToken },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Failed to fetch user info: ' + res.getContentText());
  }
  return JSON.parse(res.getContentText());
}

function createFirebaseCustomToken(uid, claims) {
  var props = PropertiesService.getScriptProperties();
  var saJson = JSON.parse(props.getProperty('SERVICE_ACCOUNT_JSON'));

  var now = Math.floor(Date.now() / 1000);

  var header = { alg: 'RS256', typ: 'JWT' };
  var payload = {
    iss: saJson.client_email,
    sub: saJson.client_email,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now,
    exp: now + 3600,
    uid: uid,
    claims: claims
  };

  var toSign =
    Utilities.base64EncodeWebSafe(JSON.stringify(header)).replace(/=+$/, '') +
    '.' +
    Utilities.base64EncodeWebSafe(JSON.stringify(payload)).replace(/=+$/, '');

  var signatureBytes = Utilities.computeRsaSha256Signature(toSign, saJson.private_key);
  var signature = Utilities.base64EncodeWebSafe(signatureBytes).replace(/=+$/, '');

  return toSign + '.' + signature;
}

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
// Firestore service-account token
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Firestore token storage
// ---------------------------------------------------------------------------

function _tokenDocUrl(uid) {
  var props = PropertiesService.getScriptProperties();
  var projectId = props.getProperty('FIREBASE_PROJECT_ID');
  var dbId = props.getProperty('FIREBASE_DATABASE_ID') || 'youtube-kids';
  return (
    'https://firestore.googleapis.com/v1/projects/' + projectId +
    '/databases/' + dbId +
    '/documents/user_tokens/' + uid
  );
}

function storeUserTokens(uid, tokens) {
  var token = getFirestoreToken();

  var fields = {
    refreshToken: { stringValue: tokens.refreshToken },
    accessToken:  { stringValue: tokens.accessToken },
    expiresAt:    { integerValue: String(tokens.expiresAt) },
    scope:        { stringValue: tokens.scope || '' },
    updatedAt:    { timestampValue: new Date().toISOString() }
  };

  UrlFetchApp.fetch(_tokenDocUrl(uid), {
    method: 'patch',
    headers: { 'Authorization': 'Bearer ' + token },
    contentType: 'application/json',
    payload: JSON.stringify({ fields: fields }),
    muteHttpExceptions: true
  });
}

function getUserTokens(uid) {
  var token = getFirestoreToken();

  var res = UrlFetchApp.fetch(_tokenDocUrl(uid), {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) return null;

  var doc = JSON.parse(res.getContentText());
  if (!doc.fields) return null;

  return {
    refreshToken: doc.fields.refreshToken.stringValue,
    accessToken:  doc.fields.accessToken.stringValue,
    expiresAt:    parseInt(doc.fields.expiresAt.integerValue, 10),
    scope:        doc.fields.scope ? doc.fields.scope.stringValue : ''
  };
}

function updateUserAccessToken(uid, tokenUpdate) {
  var token = getFirestoreToken();

  var url =
    _tokenDocUrl(uid) +
    '?updateMask.fieldPaths=accessToken' +
    '&updateMask.fieldPaths=expiresAt' +
    '&updateMask.fieldPaths=updatedAt';

  var fields = {
    accessToken: { stringValue: tokenUpdate.accessToken },
    expiresAt:   { integerValue: String(tokenUpdate.expiresAt) },
    updatedAt:   { timestampValue: new Date().toISOString() }
  };

  UrlFetchApp.fetch(url, {
    method: 'patch',
    headers: { 'Authorization': 'Bearer ' + token },
    contentType: 'application/json',
    payload: JSON.stringify({ fields: fields }),
    muteHttpExceptions: true
  });
}

function deleteUserTokens(uid) {
  var token = getFirestoreToken();

  UrlFetchApp.fetch(_tokenDocUrl(uid), {
    method: 'delete',
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  });
}
