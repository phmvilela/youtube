const functions = require("@google-cloud/functions-framework");
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

admin.initializeApp();

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

functions.http("streamContents", async (req, res) => {
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
});
