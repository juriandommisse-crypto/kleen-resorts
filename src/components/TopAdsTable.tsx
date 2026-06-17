import type { AdPerformance } from "@/lib/types";
import { fmtEur, fmtEur2, fmtNum, fmtPct } from "@/lib/format";

export function TopAdsTable({ ads }: { ads: AdPerformance[] }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <h2 className="mb-1 text-sm font-semibold text-ink">Best presterende advertenties</h2>
      <p className="mb-3 text-xs text-muted">Gesorteerd op laagste kosten per lead (Meta).</p>

      {ads.length === 0 ? (
        <p className="text-sm text-muted">Nog geen advertentiedata voor deze selectie.</p>
      ) : (
        <ul className="divide-y divide-black/5">
          {ads.map((ad, i) => (
            <li key={`${ad.adName}-${i}`} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{ad.adName}</p>
                  <p className="truncate text-xs text-muted">
                    {ad.campaignName} · {ad.adsetName}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-brand">{fmtEur(ad.cpl)}</p>
                  <p className="text-xs text-muted">per lead</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span>Spend {fmtEur(ad.spendEur)}</span>
                <span>{fmtNum(ad.results)} leads</span>
                <span>CTR {fmtPct(ad.ctr)}</span>
                <span>CPC {fmtEur2(ad.cpc)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
