import type { Platform } from "@/lib/types";
import { fmtEur } from "@/lib/format";

const LABELS: Record<Platform, string> = {
  meta: "Meta",
  google: "Google",
  linkedin: "LinkedIn",
};
const COLORS: Record<Platform, string> = {
  meta: "#1f7a5a",
  google: "#4f9c84",
  linkedin: "#9ec9bb",
};

export function SpendBreakdown({
  rows,
}: {
  rows: Array<{ platform: Platform; spend: number }>;
}) {
  const total = rows.reduce((a, r) => a + r.spend, 0) || 1;

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <h2 className="mb-3 text-sm font-semibold text-ink">Ad spend per platform</h2>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.platform}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-muted">{LABELS[r.platform]}</span>
              <span className="font-medium text-ink">{fmtEur(r.spend)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-brand-light">
              <div
                className="h-full rounded-full"
                style={{ width: `${(r.spend / total) * 100}%`, backgroundColor: COLORS[r.platform] }}
              />
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted">Geen spend in deze periode.</p>}
      </div>
    </div>
  );
}
