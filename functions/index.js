const functions = require("@google-cloud/functions-framework");
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const { Storage } = require("@google-cloud/storage");
const protobuf = require("protobufjs");

admin.initializeApp();

const storage = new Storage();

let _videoBatchType = null;

async function getVideoBatchType() {
  if (!_videoBatchType) {
    const root = await protobuf.load(path.join(__dirname, "videos.proto"));
    _videoBatchType = root.lookupType("VideoBatch");
  }
  return _videoBatchType;
}

/**
 * Verifies the Firebase ID token from the Authorization header.
 * Returns the decoded token or null.
 */
async function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const idToken = authHeader.split("Bearer ")[1];
  try {
    return await admin.auth().verifyIdToken(idToken);
  } catch {
    return null;
  }
}

async function handleStreamContents(req, res) {
  // CORS headers
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  // Verify Firebase Auth
  const decodedToken = await verifyAuth(req);
  if (!decodedToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Stream contents.txt line by line
  const filePath = path.join(__dirname, "contents.txt");
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.length > 0);

  res.set("Content-Type", "text/plain; charset=utf-8");
  res.set("Transfer-Encoding", "chunked");
  res.set("Cache-Control", "no-cache");
  res.set("X-Content-Type-Options", "nosniff");

  for (const line of lines) {
    res.write(line + "\n");
    // Small delay to simulate streaming
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  res.end();
}

async function handleWriteBatch(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const decodedToken = await verifyAuth(req);
  if (!decodedToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { channelId, sequence, videos } = req.body;

  if (!channelId || sequence === undefined || sequence === null || !Array.isArray(videos)) {
    res.status(400).json({ error: "Missing required fields: channelId, sequence, videos" });
    return;
  }

  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) {
    res.status(500).json({ error: "GCS_BUCKET_NAME not configured" });
    return;
  }

  const VideoBatch = await getVideoBatchType();

  const batchPayload = {
    videos: videos.map((v) => ({
      videoId: v.videoId || "",
      title: v.title || "",
      channelName: v.channelName || "",
      channelId: v.channelId || "",
      publishedAt: v.publishedAt || "",
      thumbnail: v.thumbnail || "",
    })),
  };

  const errMsg = VideoBatch.verify(batchPayload);
  if (errMsg) {
    res.status(400).json({ error: "Invalid protobuf payload: " + errMsg });
    return;
  }

  const message = VideoBatch.create(batchPayload);
  const buffer = VideoBatch.encode(message).finish();

  const paddedSequence = String(sequence).padStart(3, "0");
  const objectName = `channels/${channelId}/batch-${paddedSequence}.pb`;

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);

  await file.save(Buffer.from(buffer), {
    contentType: "application/x-protobuf",
  });

  res.status(200).json({ written: objectName, videoCount: videos.length });
}

functions.http("youtube-videos-sync", async (req, res) => {
  const route = req.path.replace(/^\/+/, "");
  if (route === "writeBatch") {
    return handleWriteBatch(req, res);
  }
  return handleStreamContents(req, res);
});
