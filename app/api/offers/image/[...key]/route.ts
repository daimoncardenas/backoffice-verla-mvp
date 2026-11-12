import { NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";

interface RouteContext {
  params: Promise<{ key: string[] }>;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { key } = await params;
  const objectKey = key.join("/");

  try {
    const store = getStore("offer-images");
    const image = await store.get(objectKey, { type: "arrayBuffer" });

    if (!image) {
      return new NextResponse("Not found", { status: 404 });
    }

    return new NextResponse(image, {
      headers: {
        "content-type": "image/svg+xml",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error(
      "Netlify Blobs image read failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return new NextResponse("Not found", { status: 404 });
  }
}
