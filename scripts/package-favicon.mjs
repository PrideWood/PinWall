import { readFile, writeFile } from "node:fs/promises";
const entries = await Promise.all(
  [
    [16, "public/favicon-16x16.png"],
    [32, "public/favicon-32x32.png"],
    [48, "public/icons/favicon-48x48.png"],
    [256, "public/icons/favicon-256x256.png"],
  ].map(async ([size, path]) => ({ size, bytes: await readFile(path) })),
);
const header = Buffer.alloc(6 + entries.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(entries.length, 4);
let offset = header.length;
entries.forEach(({ size, bytes }, index) => {
  const at = 6 + index * 16;
  header[at] = header[at + 1] = size === 256 ? 0 : size;
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(24, at + 6);
  header.writeUInt32LE(bytes.length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += bytes.length;
});
await writeFile(
  "public/favicon.ico",
  Buffer.concat([header, ...entries.map((entry) => entry.bytes)]),
);
// Keep the legacy SVG URL usable, with the exact raster artwork embedded.
const raster = entries.at(-1).bytes.toString("base64");
await writeFile(
  "public/favicon.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><image width="256" height="256" href="data:image/png;base64,${raster}"/></svg>\n`,
);
