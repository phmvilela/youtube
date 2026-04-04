// Auth.gs - Server-side authentication for Google OAuth + Firebase
//
// Required Script Properties:
//   GOOGLE_CLIENT_ID       - OAuth 2.0 Client ID (Web application type)
//   GOOGLE_CLIENT_SECRET   - OAuth 2.0 Client Secret
//   FIREBASE_PROJECT_ID    - (already set from Code.gs)
//   SERVICE_ACCOUNT_JSON   - (already set from Code.gs)
//   FIREBASE_DATABASE_ID   - (already set from Code.gs, defaults to 'youtube-kids')
//
// Required OAuth scopes requested on the client:
//   openid, email, profile,
//   https://www.googleapis.com/auth/drive.appfolder,
//   https://www.googleapis.com/auth/script.scriptapp

/**
 * Exchange an authorization code for tokens.
 * Called after the user completes Google OAuth consent.
 *
 * @param {Object} req - { code, codeVerifier, redirectUri }
 * @returns {Object} - { success, firebaseToken, user }
 */
function exchangeAuthCode(req) {
  var props = PropertiesService.getScriptProperties();
  var clientId = props.getProperty('GOOGLE_CLIENT_ID');
  var clientSecret = props.getProperty('GOOGLE_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in Script Properties');
  }

  // Exchange authorization code for tokens at Google's token endpoint
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

  // Get user info from Google
  var userInfo = getGoogleUserInfo(tokenData.access_token);

  // Store refresh token server-side in Firestore (never sent to client)
  storeUserTokens(userInfo.sub, {
    refreshToken: tokenData.refresh_token,
    accessToken: tokenData.access_token,
    expiresAt: Date.now() + (tokenData.expires_in * 1000),
    scope: tokenData.scope
  });

  // Create a Firebase custom token so the client can call signInWithCustomToken()
  var firebaseToken = createFirebaseCustomToken(userInfo.sub, {
    email: userInfo.email,
    name: userInfo.name,
    picture: userInfo.picture
  });

  return {
    success: true,
    firebaseToken: firebaseToken,
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

/**
 * Refresh a user's Google access token using their stored refresh token.
 * Requires a valid Firebase ID token for authentication.
 *
 * @param {Object} req - { firebaseIdToken }
 * @returns {Object} - { success, accessToken, expiresIn }
 */
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

  // Update the stored access token
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

/**
 * Revoke a user's tokens (for logout / account unlinking).
 * Requires a valid Firebase ID token.
 *
 * @param {Object} req - { firebaseIdToken }
 * @returns {Object} - { success }
 */
function revokeUserTokens(req) {
  var uid = verifyFirebaseIdToken(req.firebaseIdToken);

  var storedTokens = getUserTokens(uid);
  if (storedTokens && storedTokens.refreshToken) {
    // Revoke at Google
    UrlFetchApp.fetch('https://oauth2.googleapis.com/revoke?token=' + storedTokens.refreshToken, {
      method: 'post',
      muteHttpExceptions: true
    });
  }

  // Delete from Firestore
  deleteUserTokens(uid);

  return { success: true };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch user profile from Google's userinfo endpoint.
 */
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

/**
 * Create a Firebase custom token (JWT signed with the service account private key).
 * The client uses this with signInWithCustomToken(auth, token).
 */
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

/**
 * Verify a Firebase ID token.
 * Uses Google's tokeninfo endpoint for reliable server-side validation
 * (GAS lacks native RSA public-key verification).
 *
 * @returns {string} The authenticated user's UID.
 */
function verifyFirebaseIdToken(idToken) {
  if (!idToken) throw new Error('No Firebase ID token provided');

  var props = PropertiesService.getScriptProperties();
  var projectId = props.getProperty('FIREBASE_PROJECT_ID');

  // Decode payload for structural checks
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

  // Verify token via Firebase Auth REST API (accounts:lookup validates the
  // token signature server-side and returns user info or an error).
  // Uses service account bearer token for authorization.
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
// Firestore token storage (uses service-account token from Code.gs)
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
  var token = getFirestoreToken(); // from Code.gs

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
