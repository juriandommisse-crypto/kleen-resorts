"use client";

import { useEffect, useRef, useState } from "react";
import type { AdPerformance } from "@/lib/types";
import { fmtEur, fmtEur2, fmtNum, fmtPct } from "@/lib/format";

function statusClasses(status: string): string {
  const s = status.toLowerCase();
  if (s.startsWith("actief")) return "bg-brand text-white";
  if (s.startsWith("leren")) return "bg-amber-400 text-amber-950";
  if (["gepauzeerd", "afgekeurd", "gearchiveerd", "verwijderd"].some((x) => s.includes(x)))
    return "bg-rose-100 text-rose-700";
  return "bg-black/10 text-ink";
}

/** Scaled-down Meta ad preview; lazy-loads via IntersectionObserver. */
function AdCardPreview({ adId }: { adId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [scale, setScale] = useState(0);
  const [loading, setLoading] = useState(true);

  // Facebook mobile feed preview has ~130px of header (profile + "Advertentie" label)
  // before the actual ad image. Skip it so the visual fills the card.
  const HEADER_OFFSET = 130;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        setScale(el.offsetWidth / 375);
        fetch(`/api/meta/preview?adId=${encodeURIComponent(adId)}&format=MOBILE_FEED_STANDARD`)
          .then((r) => r.json())
          .then((d: { src?: string }) => {
            if (d.src) setIframeSrc(d.src);
            setLoading(false);
          })
          .catch(() => setLoading(false));
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [adId]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-neutral-100">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      )}
      {!loading && !iframeSrc && (
        <div className="absolute inset-0 flex items-center justify-center text-3xl text-brand/40">🖼️</div>
      )}
      {iframeSrc && scale > 0 && (
        <div className="absolute inset-0 overflow-hidden">
          <div style={{ position: "absolute", top: `-${Math.round(HEADER_OFFSET * scale)}px`, left: 0, pointerEvents: "none" }}>
            <div style={{ width: 375, height: 700, transformOrigin: "top left", transform: `scale(${scale})` }}>
              <iframe src={iframeSrc} width={375} height={700} style={{ border: 0, display: "block" }} scrolling="no" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdCard({
  ad,
  rank,
  onOpen,
}: {
  ad: AdPerformance;
  rank: number;
  onOpen: () => void;
}) {
  return (
    <div id={`ad-${ad.adId}`} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
      {/* Creative-visual — klik om te vergroten */}
      <button
        type="button"
        onClick={onOpen}
        className="group relative block aspect-[4/3] w-full cursor-zoom-in bg-brand-light"
        aria-label={`Vergroot advertentie ${ad.adName}`}
      >
        {ad.platform === "meta" ? (
          <AdCardPreview adId={ad.adId} />
        ) : ad.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ad.thumbnailUrl}
            alt={ad.adName}
            loading="lazy"
            className="h-full w-full object-cover transition group-hover:opacity-90"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl text-brand/40">
            🖼️
          </div>
        )}
        <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-xs font-bold text-brand-dark shadow">
          {rank}
        </span>
        <span
          className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClasses(ad.status)}`}
        >
          {ad.status}
        </span>
      </button>

      {/* Info */}
      <div className="p-3">
        <p className="truncate text-sm font-medium text-ink" title={ad.adName}>
          {ad.adName || "—"}
        </p>
        <p className="truncate text-xs text-muted">
          {ad.campaignName}
          {ad.adsetName ? ` · ${ad.adsetName}` : ""}
        </p>

        <div className="mt-2 flex items-end justify-between">
          <div>
            <span className="text-xl font-bold text-ink">{fmtNum(ad.results)}</span>
            <span className="ml-1 text-xs text-muted">resultaten</span>
          </div>
          <span className="rounded-full bg-brand-light px-2 py-0.5 text-xs font-semibold text-brand-dark">
            {ad.cpl ? `${fmtEur(ad.cpl)} p/res` : "—"}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          <span>Spend {fmtEur(ad.spendEur)}</span>
          <span>CTR {fmtPct(ad.ctr)}</span>
          <span>CPC {fmtEur2(ad.cpc)}</span>
        </div>
      </div>
    </div>
  );
}

const FORMATS = [
  { key: "MOBILE_FEED_STANDARD", label: "Facebook" },
  { key: "INSTAGRAM_STANDARD", label: "Instagram" },
  { key: "DESKTOP_FEED_STANDARD", label: "Desktop" },
  { key: "INSTAGRAM_STORY", label: "Story" },
] as const;

function Lightbox({
  ad,
  period,
  onClose,
}: {
  ad: AdPerformance;
  period: string;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<string>("MOBILE_FEED_STANDARD");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    if (ad.platform !== "meta") return;
    setLoading(true);
    setPreviewHtml(null);
    fetch(`/api/meta/preview?adId=${encodeURIComponent(ad.adId)}&format=${format}`)
      .then((r) => r.json())
      .then((d: { body?: string }) => setPreviewHtml(d.body ?? null))
      .catch(() => setPreviewHtml(null))
      .finally(() => setLoading(false));
  }, [ad.adId, ad.platform, format]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex h-[55vh] shrink-0 items-center justify-center bg-neutral-100 sm:h-[65vh]">
          {loading ? (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted">Laden…</div>
          ) : previewHtml ? (
            <div
              className="flex h-full w-full items-center justify-center overflow-hidden [&_iframe]:max-h-full [&_iframe]:border-0"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          ) : ad.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ad.thumbnailUrl} alt={ad.adName} className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-5xl text-neutral-300">🖼️</div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg font-bold text-ink shadow hover:bg-white"
            aria-label="Sluiten"
          >
            ✕
          </button>
          <span
            className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(ad.status)}`}
          >
            {ad.status}
          </span>
        </div>

        {ad.platform === "meta" && (
          <div className="flex gap-1 border-b border-black/5 px-4 py-2">
            {FORMATS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFormat(f.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  format === f.key
                    ? "bg-brand text-white"
                    : "text-muted hover:bg-brand-light hover:text-ink"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        <div className="overflow-y-auto p-5">
          <h3 className="text-base font-semibold text-ink">{ad.adName || "—"}</h3>
          <p className="text-sm text-muted">
            {ad.campaignName}
            {ad.adsetName ? ` · ${ad.adsetName}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted">Cijfers over {period}</p>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Resultaten" value={fmtNum(ad.results)} />
            <Stat label="Kosten / resultaat" value={ad.cpl ? fmtEur(ad.cpl) : "—"} />
            <Stat label="Spend" value={fmtEur(ad.spendEur)} />
            <Stat label="CTR" value={fmtPct(ad.ctr)} />
            <Stat label="Vertoningen" value={fmtNum(ad.impressions)} />
            <Stat label="Klikken" value={fmtNum(ad.clicks)} />
            <Stat label="CPC" value={fmtEur2(ad.cpc)} />
            <Stat label="Status" value={ad.status} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-brand-light/50 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}

/** Startaantal kaarten op basis van schermbreedte (minder op mobiel). */
function initialPageSize(): number {
  if (typeof window === "undefined") return 8;
  const w = window.innerWidth;
  if (w < 640) return 4; // telefoon
  if (w < 1024) return 6; // tablet
  if (w < 1280) return 8; // desktop
  return 12; // breed scherm
}

export function TopAdsTable({
  ads,
  period,
}: {
  ads: AdPerformance[];
  period: string;
}) {
  const [selected, setSelected] = useState<AdPerformance | null>(null);
  const [pageSize, setPageSize] = useState(8);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const update = () => setPageSize(initialPageSize());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Reset naar de eerste "pagina" als de selectie (en dus de lijst) wijzigt.
  useEffect(() => {
    setPage(1);
  }, [period, ads.length]);

  // Open lightbox vanuit InsightPanel anchor-links.
  useEffect(() => {
    const handler = (e: Event) => {
      const { adId } = (e as CustomEvent<{ adId: string }>).detail;
      const ad = ads.find((a) => a.adId === adId);
      if (ad) setSelected(ad);
    };
    document.addEventListener("open-ad", handler);
    return () => document.removeEventListener("open-ad", handler);
  }, [ads]);

  const visibleCount = page * pageSize;
  const visible = ads.slice(0, visibleCount);
  const remaining = ads.length - visible.length;

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <h2 className="text-sm font-semibold text-ink">Best presterende advertenties</h2>
      <p className="text-xs text-muted">
        Advertenties met minimaal 1 resultaat · gesorteerd op aantal resultaten · klik voor groot · Meta
      </p>
      <p className="mb-4 text-xs text-muted">
        Cijfers over <span className="font-medium text-ink">{period}</span>
      </p>

      {ads.length === 0 ? (
        <p className="text-sm text-muted">Geen advertenties met resultaten in deze selectie.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((ad, i) => (
              <AdCard key={ad.adId || `${ad.adName}-${i}`} ad={ad} rank={i + 1} onOpen={() => setSelected(ad)} />
            ))}
          </div>

          {(remaining > 0 || page > 1) && (
            <div className="mt-4 flex justify-center gap-3">
              {remaining > 0 && (
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark"
                >
                  Toon meer ({remaining})
                </button>
              )}
              {page > 1 && (
                <button
                  type="button"
                  onClick={() => setPage(1)}
                  className="rounded-full px-4 py-2 text-sm font-medium text-muted hover:text-ink"
                >
                  Toon minder
                </button>
              )}
            </div>
          )}
        </>
      )}

      {selected && <Lightbox ad={selected} period={period} onClose={() => setSelected(null)} />}
    </div>
  );
}
