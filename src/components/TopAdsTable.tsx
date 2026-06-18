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

function AdCard({ ad, rank }: { ad: AdPerformance; rank: number }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
      {/* Creative-visual */}
      <div className="relative aspect-[4/3] w-full bg-brand-light">
        {ad.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ad.thumbnailUrl} alt={ad.adName} className="h-full w-full object-cover" />
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
      </div>

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
            <span className="ml-1 text-xs text-muted">leads</span>
          </div>
          <span className="rounded-full bg-brand-light px-2 py-0.5 text-xs font-semibold text-brand-dark">
            {ad.cpl ? `${fmtEur(ad.cpl)}/lead` : "—"}
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

export function TopAdsTable({ ads }: { ads: AdPerformance[] }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <h2 className="text-sm font-semibold text-ink">Best presterende advertenties</h2>
      <p className="mb-4 text-xs text-muted">
        Advertenties met meer dan 5 leads · gesorteerd op aantal leads · Meta
      </p>

      {ads.length === 0 ? (
        <p className="text-sm text-muted">
          Geen advertenties met meer dan 5 leads in deze selectie.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {ads.map((ad, i) => (
            <AdCard key={ad.adId || `${ad.adName}-${i}`} ad={ad} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
