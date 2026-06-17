import { fmtPct } from "@/lib/format";

interface Props {
  label: string;
  value: string;
  delta?: number | null;
  /** Of een stijging "goed" (groen) is. CPL: lager = beter, dus invert. */
  higherIsBetter?: boolean;
  hint?: string;
  /** Tekst achter het deltapercentage, bv. "t.o.v. vorige maand". */
  deltaLabel?: string;
}

export function KpiCard({
  label,
  value,
  delta,
  higherIsBetter = true,
  hint,
  deltaLabel = "t.o.v. vorige periode",
}: Props) {
  const hasDelta = delta != null && Number.isFinite(delta);
  const positive = hasDelta && delta! > 0;
  const good = hasDelta ? (higherIsBetter ? positive : !positive) : false;
  const arrow = positive ? "▲" : "▼";

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink">{value}</div>
      {hasDelta ? (
        <div
          className={`mt-1 text-xs font-medium ${good ? "text-brand" : "text-rose-600"}`}
        >
          {arrow} {fmtPct(Math.abs(delta!))} {deltaLabel}
        </div>
      ) : (
        hint && <div className="mt-1 text-xs text-muted">{hint}</div>
      )}
    </div>
  );
}
