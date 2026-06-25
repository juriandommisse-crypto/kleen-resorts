import { NextRequest } from "next/server";
import https from "node:https";
import type { IncomingMessage } from "node:http";

const GRAPH = "https://graph.facebook.com";

const SUPPRESS_CSS = `<style>
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
</script>`;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Fetches a URL using Node's https module (no Next.js fetch wrapper). Follows redirects. */
function nodeGet(url: string, depth = 0): Promise<{ ok: boolean; status: number; body: string; err?: string }> {
  return new Promise((resolve) => {
    if (depth > 6) return resolve({ ok: false, status: 0, body: "", err: "too many redirects" });
    try {
      const parsed = new URL(url);
      https.get(
        {
          hostname: parsed.hostname,
          path: parsed.pathname + parsed.search,
          headers: {
            "User-Agent": UA,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
          },
        },
        (res: IncomingMessage) => {
          const status = res.statusCode ?? 0;
          if (status >= 300 && status < 400 && res.headers.location) {
            const next = new URL(res.headers.location, url).href;
            res.resume();
            nodeGet(next, depth + 1).then(resolve);
            return;
          }
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => resolve({ ok: status >= 200 && status < 300, status, body: Buffer.concat(chunks).toString("utf-8") }));
          res.on("error", (e: Error) => resolve({ ok: false, status, body: "", err: String(e) }));
        },
      ).on("error", (e: Error) => resolve({ ok: false, status: 0, body: "", err: String(e) }));
    } catch (e) {
      resolve({ ok: false, status: 0, body: "", err: String(e) });
    }
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const adId = searchParams.get("adId");
  const format = searchParams.get("format") ?? "MOBILE_FEED_STANDARD";
  // Optional: caller may pass the preview_shareable_link directly as extra candidate.
  const callerPreviewUrl = searchParams.get("previewUrl");

  if (!adId) return new Response("adId required", { status: 400 });

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return new Response("not configured", { status: 501 });

  const version = process.env.META_API_VERSION ?? "v21.0";

  // Step 1: get the iframe src URL from Meta's Graph API.
  let apiSrc: string | null = null;
  try {
    const apiParams = new URLSearchParams({ ad_format: format, access_token: token });
    const apiRes = await fetch(`${GRAPH}/${version}/${adId}/previews?${apiParams}`, { cache: "no-store" });
    if (apiRes.ok) {
      const apiJson = (await apiRes.json()) as { data: Array<{ body: string }> };
      const body = apiJson.data?.[0]?.body ?? "";
      const m = body.match(/src="([^"]+)"/);
      if (m?.[1]) apiSrc = m[1].replace(/&amp;/g, "&");
    }
  } catch { /* ignore — we fall through to callerPreviewUrl */ }

  // Step 2: build candidate URLs to try (most specific first).
  const candidates: string[] = [];
  if (apiSrc) {
    candidates.push(apiSrc);
    // Same URL with explicit access_token appended (some previews require it).
    const sep = apiSrc.includes("?") ? "&" : "?";
    candidates.push(`${apiSrc}${sep}access_token=${token}`);
  }
  if (callerPreviewUrl) candidates.push(decodeURIComponent(callerPreviewUrl));

  // Step 3: try each candidate with Node's https module (bypasses Next.js fetch wrapper).
  let html: string | null = null;
  const log: string[] = [];

  for (const url of candidates) {
    const r = await nodeGet(url);
    const snippet = url.replace(/access_token=[^&]+/, "access_token=***").slice(0, 120);
    if (r.ok && r.body.length > 100) {
      html = r.body;
      log.push(`✓ ${snippet} → ${r.status}`);
      break;
    }
    log.push(`✗ ${snippet} → ${r.status} ${r.err ?? ""}`);
  }

  if (!html) {
    // Return visible debug info so we can diagnose from the iframe.
    const debugHtml = `<!doctype html><html><body style="font:11px monospace;padding:8px;word-break:break-all;background:#fff">
<b>Preview unavailable — debug info:</b><br><br>
${log.map((l) => `<div>${l}</div>`).join("")}
<br><div>adId: ${adId} | format: ${format}</div>
</body></html>`;
    return new Response(debugHtml, { headers: { "Content-Type": "text/html" } });
  }

  html = html.includes("</head>") ? html.replace("</head>", `${SUPPRESS_CSS}</head>`) : SUPPRESS_CSS + html;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=1800, s-maxage=1800",
    },
  });
}
