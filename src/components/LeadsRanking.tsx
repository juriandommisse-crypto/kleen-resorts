import { fmtEur, fmtNum } from "@/lib/format";

export function LeadsRanking({
  rows,
}: {
  rows: Array<{ project: string; leads: number; spend: number; cpl: number }>;
}) {
  const max = Math.max(1, ...rows.map((r) => r.leads));

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <h2 className="mb-3 text-sm font-semibold text-ink">Leads per project</h2>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.project}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate text-ink">{r.project}</span>
              <span className="shrink-0 font-medium text-ink">{fmtNum(r.leads)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-brand-light">
              <div className="h-full rounded-full bg-brand" style={{ width: `${(r.leads / max) * 100}%` }} />
            </div>
            <div className="mt-1 text-xs text-muted">
              {fmtEur(r.spend)} spend · {r.cpl ? `${fmtEur(r.cpl)}/lead` : "—"}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
