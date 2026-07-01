import { NextRequest } from "next/server";

// Rendert de Facebook ad-preview server-side met een echte headless browser en
// levert een schone PNG. Zo ziet ELKE bezoeker (ook niet-ingelogd, ook mobiel)
// de nieuwste advertentie zónder cookie-melding — die melding verschijnt alleen
// in Facebook's eigen iframe bij bezoekers die niet zijn ingelogd.
//
// Werking:
//  1. Haal de preview-iframe-URL op uit de Graph API (= altijd de laatste versie).
//  2. Start headless Chromium, injecteer de FB-sessiecookie (FB_PREVIEW_COOKIE)
//     zodat Facebook ons als "ingelogd" ziet en geen consent-dialog toont.
//  3. Navigeer, wacht tot alles gerenderd is, en maak een screenshot.
//
// Vereist: FB_PREVIEW_COOKIE (c_user=…; xs=…; datr=…) in de omgeving.

export const runtime = "nodejs";
export const maxDuration = 60;

const GRAPH = "https://graph.facebook.com";

/** Zet "c_user=..; xs=..; datr=.." om naar puppeteer-cookies voor .facebook.com. */
function parseCookies(raw: string) {
  return raw
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const eq = p.indexOf("=");
      const name = p.slice(0, eq).trim();
      const value = p.slice(eq + 1).trim();
      return { name, value, domain: ".facebook.com", path: "/" };
    })
    .filter((c) => c.name && c.value);
}

/** Haal de gesigneerde preview-URL op (altijd de laatste versie van de ad). */
async function getPreviewSrc(adId: string, format: string): Promise<string | null> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return null;
  const version = process.env.META_API_VERSION ?? "v21.0";
  const params = new URLSearchParams({ ad_format: format, access_token: token });
  const res = await fetch(`${GRAPH}/${version}/${adId}/previews?${params}`, { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: Array<{ body?: string }> };
  const body = json.data?.[0]?.body ?? "";
  const m = body.match(/src="([^"]+)"/);
  return m?.[1] ? m[1].replace(/&amp;/g, "&") : null;
}

// Verberg + accepteer een eventuele cookie-dialog (mocht die er tóch zijn).
const HIDE_BANNER = `
  (function(){
    var css = '[data-testid*="cookie"],[data-testid*="consent"],[role="dialog"],._li{display:none!important}';
    var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
    var sels = ['[data-cookiebanner="accept_button"]','[data-testid="cookie-policy-manage-dialog-accept-button"]',
      'button[title*="toestaan" i]','button[title*="Allow" i]','[aria-label*="toestaan" i]'];
    for (var i=0;i<sels.length;i++){var el=document.querySelector(sels[i]); if(el){el.click();break;}}
  })();
`;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const adId = searchParams.get("adId");
  const format = searchParams.get("format") ?? "MOBILE_FEED_STANDARD";
  if (!adId) return new Response("adId required", { status: 400 });

  const cookie = process.env.FB_PREVIEW_COOKIE;
  if (!cookie) return new Response("FB_PREVIEW_COOKIE not configured", { status: 501 });

  const previewSrc = await getPreviewSrc(adId, format);
  if (!previewSrc) return new Response("preview unavailable", { status: 502 });

  // Story/verticale formaten zijn smaller+hoger dan feed-formaten.
  const isStory = /STORY|REELS/i.test(format);
  const width = isStory ? 360 : 380;

  let browser: import("puppeteer-core").Browser | null = null;
  try {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = (await import("puppeteer-core")).default;

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width, height: 900, deviceScaleFactor: 2 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();
    await page.setCookie(...parseCookies(cookie));
    await page.setExtraHTTPHeaders({ "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8" });

    await page.goto(previewSrc, { waitUntil: "networkidle2", timeout: 45000 });
    await page.evaluate(HIDE_BANNER);
    // Korte extra tijd voor lazy afbeeldingen/lettertypen.
    await new Promise((r) => setTimeout(r, 1200));

    // Meet de echte contenthoogte en schiet exact dat gebied.
    const dims = await page.evaluate(() => {
      const b = document.body;
      const h = Math.max(b.scrollHeight, document.documentElement.scrollHeight);
      const w = Math.max(b.scrollWidth, document.documentElement.scrollWidth);
      return { h: Math.min(h, 2400), w };
    });

    const png = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: Math.min(dims.w, width), height: Math.max(dims.h, 200) },
    });

    // Buffer -> Uint8Array zodat het een geldige BodyInit is.
    const bytes = new Uint8Array(png);
    return new Response(bytes, {
      headers: {
        "Content-Type": "image/png",
        // Creatives wijzigen zelden; lang cachen scheelt dure browser-renders.
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (e) {
    return new Response(`render failed: ${e instanceof Error ? e.message : String(e)}`, {
      status: 502,
    });
  } finally {
    if (browser) await browser.close();
  }
}
