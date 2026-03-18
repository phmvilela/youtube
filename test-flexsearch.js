const { Document } = require("flexsearch");
async function test() {
  const doc = new Document({
    document: {
      id: "videoId",
      index: ["title", "channelName"],
      store: true
    }
  });
  doc.add({ videoId: "1", title: "Test video", channelName: "MyChannel" });
  
  const exports = [];
  await doc.export((key, data) => {
    exports.push({ key, data: data ? data : null });
  });
  console.log("Exports:", exports);
  
  const doc2 = new Document({
    document: {
      id: "videoId",
      index: ["title", "channelName"],
      store: true
    }
  });
  for (const exp of exports) {
    if (exp.data !== null) {
      doc2.import(exp.key, exp.data);
    }
  }
  const results = doc2.search("Test", { enrich: true });
  console.log("Results:", JSON.stringify(results, null, 2));
}
test().catch(console.error);
