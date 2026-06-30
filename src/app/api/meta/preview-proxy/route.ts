import { NextRequest } from "next/server";

const GRAPH = "https://graph.facebook.com";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Verbergt + accepteert automatisch de cookie-melding. Dit script draait alleen
// in MODE A (HTML wordt first-party vanaf ONS domein geserveerd), waar we wél
// in het document mogen scripten — cross-origin in een Facebook-iframe kan dat niet.
// Stuurt ook de echte contenthoogte via postMessage zodat het iframe zich aanpast.
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

  // Stuur de echte paginahoogte naar de parent zodat het iframe zich aanpast.
  function reportHeight(){
    var h=document.documentElement.scrollHeight||document.body.scrollHeight;
    if(h>50) window.parent.postMessage({type:'iframe-height',height:h},'*');
  }
  window.addEventListener('load', function(){ setTimeout(reportHeight,300); setTimeout(reportHeight,1200); });
  new MutationObserver(reportHeight).observe(document.body||document.documentElement,{childList:true,subtree:true,attributes:true});
</script>`;

/** Haalt de preview-HTML server-side op (zonder cookie — de URL is publiek gesigneerd). */
async function fetchRendered(url: string): Promise<{ html: string | null; reason: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Referer: "https://business.facebook.com/",
      },
      redirect: "follow",
      cache: "no-store",
    });
    if (!res.ok) return { html: null, reason: `http-${res.status}` };
    const html = await res.text();
    if (html.length <= 500) return { html: null, reason: `too-short-${html.length}` };
    return { html, reason: "ok" };
  } catch (e) {
    return { html: null, reason: `fetch-error-${String(e).slice(0, 80)}` };
  }
}

function modeBWrap(previewSrc: string, mode: string): string {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><style>
  *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:320px; background:#fff; margin:0; }
  iframe { display:block; border:0; width:320px; height:700px; }
</style></head>
<body>
  <!-- mode:${mode} -->
  <iframe src="${previewSrc}" scrolling="no" sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
    onload="window.parent.postMessage({type:'iframe-height',height:700},'*')"></iframe>
</body>
</html>`;
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

  const headersA = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=1800, s-maxage=1800",
  };
  // MODE B-responses nooit cachen: als MODE A later beschikbaar komt (cookie toegevoegd),
  // moet de browser/CDN direct de nieuwe versie ophalen.
  const headersB = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  };

  // MODE A — banner-vrij: haal de preview-HTML server-side op (zonder cookie, de URL
  // is publiek gesigneerd via de Graph API) en serveer first-party vanaf ons domein.
  // Onze SUPPRESS-CSS/JS verbergt de cookiebanner omdat we nu in hetzelfde origin zitten.
  const { html, reason } = await fetchRendered(previewSrc);
  if (html) {
    const out = html.includes("<head>")
      ? html.replace("<head>", `<head><base href="https://www.facebook.com/">${SUPPRESS}`)
      : `<base href="https://www.facebook.com/">${SUPPRESS}${html}`;
    return new Response(out, { headers: { ...headersA, "X-Preview-Mode": "A-anon" } });
  }

  // MODE B — fallback: Facebook geeft geen bruikbare HTML terug; embed de iframe direct.
  const modeB = `B-fetch-failed:${reason}`;
  const wrap = modeBWrap(previewSrc, modeB);
  return new Response(wrap, { headers: { ...headersB, "X-Preview-Mode": modeB } });
}
