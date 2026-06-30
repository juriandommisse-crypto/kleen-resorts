import type { AdCreative } from "@/lib/types";

/** Getrouwe Facebook-feed-weergave, zelf opgebouwd uit de échte creative-data
 *  (geen Facebook-iframe → geen cookie-melding op welk apparaat dan ook). */
export function MetaAdPreview({
  creative,
  adName,
}: {
  creative: AdCreative;
  adName: string;
}) {
  const page = creative.pageName ?? "Kleen Resorts";

  return (
    <div className="mx-auto w-[320px] bg-white text-[#050505]">
      {/* Header: pagina + 'Advertentie' */}
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        {creative.pageAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={creative.pageAvatar} alt={page} className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
            {page.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-tight">{page}</p>
          <p className="text-[11px] leading-tight text-[#65676b]">Advertentie · 🌐</p>
        </div>
      </div>

      {/* Primaire tekst */}
      {creative.body && (
        <p className="whitespace-pre-line px-3 pb-2 text-[13px] leading-snug">{creative.body}</p>
      )}

      {/* Creative-afbeelding (of video-poster) */}
      {creative.imageUrl ? (
        <div className="relative bg-neutral-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={creative.imageUrl} alt={adName} className="block w-full" />
          {creative.isVideo && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-xl text-white">
                ▶
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-neutral-100 text-4xl text-neutral-300">
          🖼️
        </div>
      )}

      {/* Footer: domein + kop + beschrijving + CTA-knop */}
      {(creative.displayLink || creative.title || creative.description || creative.cta) && (
        <div className="flex items-center justify-between gap-3 bg-[#f0f2f5] px-3 py-2.5">
          <div className="min-w-0">
            {creative.displayLink && (
              <p className="truncate text-[11px] uppercase tracking-wide text-[#65676b]">
                {creative.displayLink}
              </p>
            )}
            {creative.title && (
              <p className="truncate text-[14px] font-semibold leading-tight">{creative.title}</p>
            )}
            {creative.description && (
              <p className="truncate text-[12px] leading-tight text-[#65676b]">
                {creative.description}
              </p>
            )}
          </div>
          {creative.cta && (
            <span className="shrink-0 whitespace-nowrap rounded-md bg-[#e4e6eb] px-3 py-1.5 text-[13px] font-semibold text-[#050505]">
              {creative.cta}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
