// 1. Entry point for HTTP POST requests from your React app
function doPost(e) {
  Logger.log("doPost triggered");
  try {
    var req = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    var collectionName = req.collectionName || 'videos';
    var databaseId = 'youtube-kids';
    
    Logger.log("Target database: " + databaseId);
    Logger.log("Target collection: " + collectionName);
    
    var syncedCount = performSync(collectionName, databaseId);
    
    return ContentService.createTextOutput(JSON.stringify({ 
      success: true, 
      syncedCount: syncedCount 
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log("Error in doPost: " + error.toString());
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      error: error.toString(),
      stack: error.stack
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 1b. Helper to test the script manually from the GAS Editor
function testSync() {
  Logger.log("Starting Manual Test Sync...");
  var props = PropertiesService.getScriptProperties();
  var dbId = props.getProperty('FIREBASE_DATABASE_ID') || 'youtube-kids'; // Fallback to your known ID
  try {
    var count = performSync('videos', dbId);
    Logger.log("Success! Total videos synced: " + count);
  } catch (e) {
    Logger.log("Test Failed: " + e.toString());
    Logger.log("Stack: " + e.stack);
  }
}

// 2. Main Sync Logic
function performSync(collectionName, databaseId) {
  var props = PropertiesService.getScriptProperties();
  var projectId = props.getProperty('FIREBASE_PROJECT_ID');
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID not set in Script Properties");
  
  var dbId = databaseId || props.getProperty('FIREBASE_DATABASE_ID') || '(default)';
  Logger.log("Project ID: " + projectId);
  Logger.log("Database ID: " + dbId);
  
  var token = getFirestoreToken();
  var baseUrl = 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/' + dbId + '/documents';
  
  // Step A: Fetch allowed channels from Firestore
  var channelsUrl = baseUrl + '/allowed_channels?pageSize=100';
  Logger.log("Fetching channels from: " + channelsUrl);
  
  var channelsRes = UrlFetchApp.fetch(channelsUrl, {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  });
  
  var channelsResponseText = channelsRes.getContentText();
  if (channelsRes.getResponseCode() !== 200) {
    throw new Error("Failed to fetch channels (HTTP " + channelsRes.getResponseCode() + "): " + channelsResponseText);
  }
  
  var channelsData = JSON.parse(channelsResponseText);
  var channels = channelsData.documents || [];
  Logger.log("Found " + channels.length + " channels in allowed_channels collection.");
  
  if (channels.length === 0) {
    Logger.log("No channels found.");
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
          var rawWords = (title + " " + channelName).toLowerCase().split(/\W+/).filter(Boolean);
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
      Logger.log("  Error processing channel " + channelId + ": " + err.toString());
    }
  });
  
  Logger.log("Total videos to sync: " + allVideos.length);

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
        Logger.log("  Batch write failed: " + res.getContentText());
      }
    }
  }
  
  return allVideos.length;
}

// 3. Generate OAuth Bearer Token from Service Account JSON
function getFirestoreToken() {
  var props = PropertiesService.getScriptProperties();
  var saJsonStr = props.getProperty('SERVICE_ACCOUNT_JSON');
  var saJson = JSON.parse(saJsonStr);
  
  var header = { alg: "RS256", typ: "JWT" };
  var now = Math.floor(Date.now() / 1000);
  var claim = {
    iss: saJson.client_email,
    scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };
  
  var toSign = Utilities.base64EncodeWebSafe(JSON.stringify(header)).replace(/=+$/, "") + "." + 
               Utilities.base64EncodeWebSafe(JSON.stringify(claim)).replace(/=+$/, "");
  var signatureBytes = Utilities.computeRsaSha256Signature(toSign, saJson.private_key);
  var signature = Utilities.base64EncodeWebSafe(signatureBytes).replace(/=+$/, "");
  var jwt = toSign + "." + signature;
  
  var res = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    payload: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }
  });
  
  return JSON.parse(res.getContentText()).access_token;
}

// 4. Helper to map JS objects to Firestore REST API types
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
