// Weergave-helpers (Nederlandse notatie).

const eur = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const eur2 = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const num = new Intl.NumberFormat("nl-NL");
const pct = new Intl.NumberFormat("nl-NL", {
  style: "percent",
  maximumFractionDigits: 1,
});

export const fmtEur = (n: number) => eur.format(n);
export const fmtEur2 = (n: number) => eur2.format(n);
export const fmtNum = (n: number) => num.format(n);
export const fmtPct = (n: number) => pct.format(n);

/** Bereken procentuele verandering t.o.v. vorige periode. */
export function delta(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / previous;
}

/** "2026-W24" -> "Week 24, 2026" */
export function prettyWeek(week: string): string {
  const m = week.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return week;
  return `Week ${parseInt(m[2], 10)}, ${m[1]}`;
}
