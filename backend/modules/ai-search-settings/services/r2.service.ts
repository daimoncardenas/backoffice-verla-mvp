import "server-only";

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export async function uploadOfferImage(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string | null> {
  const endpoint = process.env.R2_ENDPOINT?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const publicBase = process.env.R2_PUBLIC_BASE?.trim();

  if (
    !endpoint ||
    !bucket ||
    !accessKeyId ||
    !secretAccessKey ||
    !publicBase
  ) {
    return null;
  }

  try {
    const client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    return `${publicBase.replace(/\/$/, "")}/${key}`;
  } catch (error) {
    console.error(
      "R2 image upload failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return null;
  }
}
