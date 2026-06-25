import { NextRequest } from "next/server";

const GRAPH = "https://graph.facebook.com";

// CSS injected into every proxied preview to suppress Meta's cookie consent overlay.
// The ad content is already in the initial HTML; only the overlay needs to be hidden.
const SUPPRESS_COOKIE_CSS = `
<style>
  [role="dialog"],
  [data-testid*="cookie"],
  [data-testid*="consent"],
  [aria-label*="cookie" i],
  [aria-label*="Cookie"],
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
  // Auto-click accept if the popup renders despite the CSS
  document.addEventListener('DOMContentLoaded', function () {
    var candidates = [
      '[data-testid*="accept"]',
      '[data-cookiebanner="accept_button"]',
      'button[value="accept"]',
    ];
    for (var s of candidates) {
      var el = document.querySelector(s);
      if (el) { el.click(); break; }
    }
  }, { once: true });
</script>
`;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const adId = searchParams.get("adId");
  const format = searchParams.get("format") ?? "MOBILE_FEED_STANDARD";

  if (!adId) return new Response("adId required", { status: 400 });

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return new Response("not configured", { status: 501 });

  const version = process.env.META_API_VERSION ?? "v21.0";

  // Fetch the preview iframe src from Meta's API (server-side — no cookie issues).
  const apiParams = new URLSearchParams({ ad_format: format, access_token: token });
  const apiRes = await fetch(`${GRAPH}/${version}/${adId}/previews?${apiParams}`);
  if (!apiRes.ok) return new Response("Meta preview API error", { status: 502 });

  const apiJson = (await apiRes.json()) as { data: Array<{ body: string }> };
  const body = apiJson.data?.[0]?.body ?? "";
  const srcMatch = body.match(/src="([^"]+)"/);
  if (!srcMatch) return new Response("No preview src", { status: 404 });
  const src = srcMatch[1].replace(/&amp;/g, "&");

  // Fetch the actual preview HTML server-side so it comes from our domain.
  const pageRes = await fetch(src, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
    },
  });

  if (!pageRes.ok) return new Response("Failed to fetch preview", { status: 502 });

  let html = await pageRes.text();

  // Inject cookie suppression before </head>.
  html = html.includes("</head>")
    ? html.replace("</head>", `${SUPPRESS_COOKIE_CSS}</head>`)
    : SUPPRESS_COOKIE_CSS + html;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Cache 30 minutes — preview content changes infrequently.
      "Cache-Control": "public, max-age=1800, s-maxage=1800",
    },
  });
}
