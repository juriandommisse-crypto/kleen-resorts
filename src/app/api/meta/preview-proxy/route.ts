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

  // The proxy returns a wrapper page that embeds Meta's preview URL directly.
  // Meta's preview_iframe.php requires Facebook session cookies so it cannot
  // be fetched server-side — the browser loads it with the user's cookies.
  //
  // The wrapper scales the 320×700 Meta preview to fill the available viewport
  // (using CSS transform on a wrapper div) so the full ad is always visible
  // at any container size — no scrolling needed. The shield div covers the
  // bottom ~160px of the 700px frame where Meta's GDPR cookie banner appears
  // on mobile (no Facebook session), and scales with the content.
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:100%; height:100%; overflow:hidden; background:#f5f5f5; }
  .wrap {
    width:320px; height:700px;
    transform-origin:top center;
    position:relative;
    margin:0 auto;
  }
  iframe { display:block; border:0; width:320px; height:700px; }
  .shield {
    position:absolute; top:540px; left:0;
    width:320px; height:160px;
    background:#fff; z-index:99999;
    pointer-events:none;
  }
</style>
<script>
  function fit() {
    var s = Math.min(window.innerWidth / 320, window.innerHeight / 700);
    document.getElementById('w').style.transform = 'scale(' + s + ')';
  }
  document.addEventListener('DOMContentLoaded', fit);
  window.addEventListener('resize', fit);
</script>
</head>
<body>
  <div id="w" class="wrap">
    <iframe src="${previewSrc}" scrolling="no" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
    <div class="shield"></div>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=1800, s-maxage=1800",
    },
  });
}
