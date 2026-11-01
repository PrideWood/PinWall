import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { required } from "./config.js";
let client: S3Client | undefined;
function storage() {
  return (client ??= new S3Client({
    endpoint: required("S3_ENDPOINT"),
    region: process.env.S3_REGION || "auto",
    credentials: {
      accessKeyId: required("S3_ACCESS_KEY_ID"),
      secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    },
    forcePathStyle: true,
  }));
}
export async function putImage(key: string, bytes: Uint8Array, mime: string) {
  await storage().send(
    new PutObjectCommand({
      Bucket: required("S3_BUCKET"),
      Key: key,
      Body: bytes,
      ContentType: mime,
    }),
  );
}
export async function readImage(key: string) {
  const result = await storage().send(
    new GetObjectCommand({ Bucket: required("S3_BUCKET"), Key: key }),
  );
  if (!result.Body) throw new Error("Image file is missing");
  return result.Body.transformToByteArray();
}
export async function deleteImages(keys: string[]) {
  for (let i = 0; i < keys.length; i += 1000) {
    const result = await storage().send(
      new DeleteObjectsCommand({
        Bucket: required("S3_BUCKET"),
        Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) },
      }),
    );
    if (result.Errors?.length)
      throw new Error("Some image files could not be deleted. Please retry.");
  }
}
