import { z } from "zod";
export const maxImageBytes = 3 * 1024 * 1024;
export const sceneSchema = z.object({
  elements: z.array(z.record(z.string(), z.unknown())).max(20000),
  appState: z
    .object({
      viewBackgroundColor: z.string().max(80).optional(),
      gridSize: z.number().nullable().optional(),
    })
    .passthrough(),
});
export const saveSchema = z.object({
  version: z.number().int().nonnegative(),
  scene: sceneSchema,
});
export const titleSchema = z.object({
  title: z.string().trim().min(1).max(120),
});
export const fileIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export function imageMime(bytes: Uint8Array): string | null {
  if (bytes.length > maxImageBytes || bytes.length < 12) return null;
  if (
    bytes[0] === 0x89 &&
    Buffer.from(bytes.subarray(1, 8)).equals(Buffer.from("PNG\r\n\x1a\n"))
  )
    return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (/^GIF8[79]a/.test(Buffer.from(bytes.subarray(0, 6)).toString()))
    return "image/gif";
  if (
    Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP"
  )
    return "image/webp";
  return null;
}
export function referencedImages(elements: Record<string, unknown>[]) {
  return [
    ...new Set(
      elements
        .filter(
          (e) =>
            e.type === "image" && !e.isDeleted && typeof e.fileId === "string",
        )
        .map((e) => e.fileId as string),
    ),
  ];
}
