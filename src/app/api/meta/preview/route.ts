import { NextRequest, NextResponse } from "next/server";

const GRAPH = "https://graph.facebook.com";

const FORMATS = [
  "MOBILE_FEED_STANDARD",
  "INSTAGRAM_STANDARD",
  "DESKTOP_FEED_STANDARD",
  "INSTAGRAM_STORY",
] as const;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const adId = searchParams.get("adId");
  const format = searchParams.get("format") ?? "MOBILE_FEED_STANDARD";

  if (!adId) return NextResponse.json({ error: "adId required" }, { status: 400 });

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: "not configured" }, { status: 501 });

  const version = process.env.META_API_VERSION ?? "v21.0";
  const params = new URLSearchParams({ ad_format: format, access_token: token });
  const res = await fetch(`${GRAPH}/${version}/${adId}/previews?${params}`);

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text }, { status: res.status });
  }

  const json = (await res.json()) as { data: Array<{ body: string }> };
  const body = json.data?.[0]?.body ?? null;
  // Extraheer de iframe src zodat we die direct kunnen embedden.
  let src: string | null = null;
  if (body) {
    const m = body.match(/src="([^"]+)"/);
    if (m?.[1]) src = m[1].replace(/&amp;/g, "&");
  }
  return NextResponse.json({ body, src, format });
}

