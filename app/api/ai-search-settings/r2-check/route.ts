import { NextResponse } from "next/server";

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

import { getSessionFromCookies } from "@/backend/modules/auth/services/session.service";


export async function GET() {
  const context = await getSessionFromCookies();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (context.account_type !== "ORGANIZATION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const endpoint = process.env.R2_ENDPOINT;
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const publicBase = process.env.R2_PUBLIC_BASE;

  if (
    !endpoint ||
    !bucket ||
    !accessKeyId ||
    !secretAccessKey ||
    !publicBase
  ) {
    return NextResponse.json(
      { ok: false, error: "R2 environment is incomplete" },
      { status: 500 },
    );
  }

  try {
    const client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });

    const key = `diagnostics/r2-check-${Date.now()}.txt`;

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: Buffer.from("ok", "utf-8"),
        ContentType: "text/plain",
      }),
    );

    return NextResponse.json({
      ok: true,
      key,
      url: `${publicBase.replace(/\/$/, "")}/${key}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        name: error instanceof Error ? error.name : "UnknownError",
        error: error instanceof Error ? error.message : "unknown error",
      },
      { status: 500 },
    );
  }
}
