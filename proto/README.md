# Protobuf Schema

`videos.proto` defines the shared schema for YouTube video metadata stored in GCS.

## Regenerating bindings

### JavaScript (Cloud Run functions)

The Cloud Run function uses `protobufjs` which loads `.proto` files at runtime — no code generation needed. The proto file is referenced directly:

```js
const protobuf = require("protobufjs");
const root = await protobuf.load("path/to/videos.proto");
const VideoBatch = root.lookupType("VideoBatch");
```

### Other languages

Use `protoc` to generate bindings:

```bash
# Python
protoc --python_out=./gen proto/videos.proto

# Go
protoc --go_out=./gen proto/videos.proto

# Java
protoc --java_out=./gen proto/videos.proto
```
