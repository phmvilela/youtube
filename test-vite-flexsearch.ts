import FlexSearch from 'flexsearch';
const doc = new FlexSearch.Document({
  document: {
    id: "videoId",
    index: ["title", "channelName"],
    store: true
  }
});
doc.add({ videoId: "1", title: "Test video", channelName: "MyChannel" });
console.log(doc.search("Test"));
