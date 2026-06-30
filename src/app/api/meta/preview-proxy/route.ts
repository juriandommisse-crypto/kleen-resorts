import { NextRequest } from "next/server";

const GRAPH = "https://graph.facebook.com";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Verbergt + accepteert automatisch de cookie-melding. Dit script draait alleen
// in MODE A (HTML wordt first-party vanaf ONS domein geserveerd), waar we wél
// in het document mogen scripten — cross-origin in een Facebook-iframe kan dat niet.
const SUPPRESS = `<style>
  [data-testid*="cookie"], [data-testid*="consent"], [role="dialog"], ._li,
  div[data-nosnippet] { display:none !important; visibility:hidden !important; }
  html, body { overflow:hidden; background:#fff; margin:0; }
</style>
<script>
  function acceptCookies(){
    var sels=[
      '[data-testid="cookie-policy-manage-dialog-accept-button"]',
      '[data-cookiebanner="accept_button"]',
      'button[title*="toestaan" i]','button[title*="Allow" i]','button[title*="Accept" i]',
      '[aria-label*="toestaan" i]','[aria-label*="Allow" i]'
    ];
    for(var i=0;i<sels.length;i++){var el=document.querySelector(sels[i]); if(el){el.click(); return true;}}
    return false;
  }
  var n=0, t=setInterval(function(){ if(acceptCookies()||++n>40) clearInterval(t); }, 150);
  document.addEventListener('DOMContentLoaded', acceptCookies);
</script>`;

/** Haalt de gerenderde preview-HTML server-side op MET een Facebook-sessiecookie,
 *  zodat Facebook geen cookie-melding toont (we zijn dan "ingelogd"). */
async function fetchRendered(url: string, cookie: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Cookie: cookie,
        "User-Agent": UA,
        "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Referer: "https://business.facebook.com/",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const html = await res.text();
    return html.length > 200 ? html : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const adId = searchParams.get("adId");
  const format = searchParams.get("format") ?? "MOBILE_FEED_STANDARD";

  if (!adId) return new Response("adId required", { status: 400 });

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return new Response("not configured", { status: 501 });

  const version = process.env.META_API_VERSION ?? "v21.0";

  // Stap 1: haal de preview-iframe-URL op uit de Graph API (= ALTIJD de laatste versie).
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
  } catch {
    /* val door naar foutmelding */
  }

  if (!previewSrc) {
    return new Response(
      `<!doctype html><html><body style="font:12px sans-serif;padding:16px;color:#999;text-align:center;padding-top:40px">Preview niet beschikbaar</body></html>`,
      { headers: { "Content-Type": "text/html" } },
    );
  }

  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=1800, s-maxage=1800",
  };

  // MODE A — banner-vrij: render server-side met een opgeslagen Facebook-cookie en
  // serveer de HTML first-party vanaf ons domein. Geen cookie-melding op géén enkel
  // apparaat. Vereist secret FB_PREVIEW_COOKIE (zie uitleg).
  const fbCookie = process.env.FB_PREVIEW_COOKIE;
  if (fbCookie) {
    const html = await fetchRendered(previewSrc, fbCookie);
    if (html) {
      const out = html.includes("<head>")
        ? html.replace("<head>", `<head><base href="https://www.facebook.com/">${SUPPRESS}`)
        : `<base href="https://www.facebook.com/">${SUPPRESS}${html}`;
      return new Response(out, { headers });
    }
    // cookie ongeldig/verlopen → val terug op MODE B
  }

  // MODE B — fallback: embed Facebook's preview-iframe direct. Toont ALTIJD de
  // laatste versie; op mobiel kan Facebook (zonder geldige sessie) wél de
  // cookie-melding tonen. Voeg FB_PREVIEW_COOKIE toe om dit volledig te omzeilen.
  const wrap = `<!doctype html>
<html>
<head><meta charset="utf-8"><style>
  *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:320px; background:#fff; }
  iframe { display:block; border:0; width:320px; height:1000px; }
</style></head>
<body>
  <iframe src="${previewSrc}" scrolling="no" sandbox="allow-scripts allow-same-origin allow-popups allow-forms"></iframe>
</body>
</html>`;
  return new Response(wrap, { headers });
}
