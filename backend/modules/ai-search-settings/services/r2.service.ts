import "server-only";

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getStore } from "@netlify/blobs";

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
    return storeFallbackImage(key, body);
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
      "R2 image upload failed; trying Netlify Blobs:",
      error instanceof Error ? error.message : "unknown error",
    );
    return storeFallbackImage(key, body);
  }
}

async function storeFallbackImage(
  key: string,
  body: Buffer,
): Promise<string | null> {
  try {
    const store = getStore("offer-images");
    const arrayBuffer = body.buffer.slice(
      body.byteOffset,
      body.byteOffset + body.byteLength,
    ) as ArrayBuffer;

    await store.set(key, arrayBuffer, {
      metadata: { contentType: "image/svg+xml" },
    });

    const base =
      process.env.URL ??
      process.env.DEPLOY_PRIME_URL ??
      process.env.NEXT_PUBLIC_SITE_URL;

    if (!base) {
      console.error("Netlify Blobs image stored without a public site URL.");
      return null;
    }

    const encodedKey = key
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");

    return `${base.replace(/\/$/, "")}/api/offers/image/${encodedKey}`;
  } catch (error) {
    console.error(
      "Netlify Blobs image fallback failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return null;
  }
}
