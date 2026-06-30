import { NextRequest } from "next/server";

const GRAPH = "https://graph.facebook.com";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const adId = searchParams.get("adId");
  const format = searchParams.get("format") ?? "MOBILE_FEED_STANDARD";

  if (!adId) return new Response("adId required", { status: 400 });

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return new Response("not configured", { status: 501 });

  const version = process.env.META_API_VERSION ?? "v21.0";

  // Get the preview iframe src URL from Meta's Graph API.
  let previewSrc: string | null = null;
  try {
    const apiParams = new URLSearchParams({ ad_format: format, access_token: token });
    const apiRes = await fetch(`${GRAPH}/${version}/${adId}/previews?${apiParams}`, { cache: "no-store" });
    if (apiRes.ok) {
      const json = (await apiRes.json()) as { data: Array<{ body: string }> };
      const body = json.data?.[0]?.body ?? "";
      const m = body.match(/src="([^"]+)"/);
      if (m?.[1]) previewSrc = m[1].replace(/&amp;/g, "&");
    }
  } catch { /* fall through */ }

  if (!previewSrc) {
    return new Response(
      `<!doctype html><html><body style="font:12px sans-serif;padding:16px;color:#999;text-align:center;padding-top:40px">Preview niet beschikbaar</body></html>`,
      { headers: { "Content-Type": "text/html" } },
    );
  }

  // Embed Meta's preview URL directly so the browser loads it with the user's
  // own Facebook cookies (the preview_iframe.php endpoint requires a Facebook
  // session and cannot be fetched server-side — it returns 400). We render at
  // the preview's natural width (320px) and a generous height so the full ad
  // — and, when shown, Facebook's cookie-consent dialog with its accept button
  // — are always reachable by the embedding page's scroll container.
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:320px; background:#fff; }
  iframe { display:block; border:0; width:320px; height:1000px; }
</style>
</head>
<body>
  <iframe src="${previewSrc}" scrolling="no" sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-storage-access-by-user-activation"></iframe>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=1800, s-maxage=1800",
    },
  });
}
