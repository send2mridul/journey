import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputDirectory = resolve(process.env.SOCIAL_ARTIFACT_DIR ?? "artifacts/social");
await mkdir(outputDirectory, { recursive: true });

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:3999");
  const requestedName = url.searchParams.get("name") ?? "capture.png";
  const name = requestedName.replace(/[^a-z0-9._-]/gi, "-");
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const outputPath = resolve(outputDirectory, name);
  if (!outputPath.startsWith(outputDirectory)) {
    response.writeHead(400).end("invalid path");
    return;
  }
  await writeFile(outputPath, Buffer.concat(chunks));
  response.writeHead(200, { "content-type": "text/plain", "access-control-allow-origin": "*" });
  response.end(outputPath);
}).listen(3999, "127.0.0.1", () => {
  console.log(`Visual evidence receiver ready at ${outputDirectory}`);
});
