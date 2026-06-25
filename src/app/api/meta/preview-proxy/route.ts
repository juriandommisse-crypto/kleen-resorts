import { NextRequest } from "next/server";

const GRAPH = "https://graph.facebook.com";

const SUPPRESS_COOKIE_CSS = `
<style>
  [role="dialog"],
  [data-testid*="cookie"],
  [data-testid*="consent"],
  [aria-label*="cookie" i],
  ._li,
  div[style*="position:fixed"][style*="z-index"],
  div[style*="position: fixed"][style*="z-index"] {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }
  html, body { overflow: hidden; background: #fff; }
</style>
<script>
  document.addEventListener('DOMContentLoaded', function () {
    var candidates = ['[data-testid*="accept"]', '[data-cookiebanner="accept_button"]', 'button[value="accept"]'];
    for (var s of candidates) { var el = document.querySelector(s); if (el) { el.click(); break; } }
  }, { once: true });
</script>
`;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
};

async function tryFetch(url: string): Promise<Response | null> {
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS });
    if (res.ok) return res;
  } catch {}
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const adId = searchParams.get("adId");
  const format = searchParams.get("format") ?? "MOBILE_FEED_STANDARD";

  if (!adId) return new Response("adId required", { status: 400 });

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return new Response("not configured", { status: 501 });

  const version = process.env.META_API_VERSION ?? "v21.0";

  // Step 1: get the iframe src from Meta's API.
  const apiParams = new URLSearchParams({ ad_format: format, access_token: token });
  let apiRes: Response;
  try {
    apiRes = await fetch(`${GRAPH}/${version}/${adId}/previews?${apiParams}`);
  } catch (e) {
    return new Response(`Meta API unreachable: ${e}`, { status: 502 });
  }
  if (!apiRes.ok) return new Response(`Meta API error ${apiRes.status}`, { status: 502 });

  const apiJson = (await apiRes.json()) as { data: Array<{ body: string }> };
  const body = apiJson.data?.[0]?.body ?? "";
  const srcMatch = body.match(/src="([^"]+)"/);
  if (!srcMatch) return new Response("No preview src in API response", { status: 404 });
  const src = srcMatch[1].replace(/&amp;/g, "&");

  // Step 2: fetch the preview page server-side.
  // Many Meta preview URLs require the access token; try both variants.
  const withToken = src.includes("?") ? `${src}&access_token=${token}` : `${src}?access_token=${token}`;
  const pageRes = (await tryFetch(src)) ?? (await tryFetch(withToken));

  if (!pageRes) {
    return new Response("Preview page unavailable", { status: 502 });
  }

  let html = await pageRes.text();

  html = html.includes("</head>")
    ? html.replace("</head>", `${SUPPRESS_COOKIE_CSS}</head>`)
    : SUPPRESS_COOKIE_CSS + html;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=1800, s-maxage=1800",
    },
  });
}
