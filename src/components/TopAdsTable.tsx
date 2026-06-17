import type { AdPerformance } from "@/lib/types";
import { fmtEur, fmtEur2, fmtNum, fmtPct } from "@/lib/format";

export function TopAdsTable({ ads }: { ads: AdPerformance[] }) {
  const maxLeads = Math.max(1, ...ads.map((a) => a.results));

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <h2 className="text-sm font-semibold text-ink">Best presterende advertenties</h2>
      <p className="mb-4 text-xs text-muted">
        Gesorteerd op aantal leads · kosten per lead (CPL) ernaast · Meta
      </p>

      {ads.length === 0 ? (
        <p className="text-sm text-muted">Nog geen advertentiedata voor deze selectie.</p>
      ) : (
        <ol className="space-y-4">
          {ads.map((ad, i) => (
            <li key={`${ad.adName}-${i}`} className="flex gap-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-light text-xs font-semibold text-brand-dark">
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm font-medium text-ink">{ad.adName || "—"}</p>
                  <span className="shrink-0 rounded-full bg-brand-light px-2 py-0.5 text-xs font-semibold text-brand-dark">
                    {ad.cpl ? `${fmtEur(ad.cpl)}/lead` : "—"}
                  </span>
                </div>
                <p className="truncate text-xs text-muted">
                  {ad.campaignName}
                  {ad.adsetName ? ` · ${ad.adsetName}` : ""}
                </p>

                {/* Leads-balk (relatief t.o.v. de best presterende ad) */}
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-light">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${(ad.results / maxLeads) * 100}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-ink">
                    {fmtNum(ad.results)} <span className="text-xs font-normal text-muted">leads</span>
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span>Spend {fmtEur(ad.spendEur)}</span>
                  <span>CTR {fmtPct(ad.ctr)}</span>
                  <span>CPC {fmtEur2(ad.cpc)}</span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
