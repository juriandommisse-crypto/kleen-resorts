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

/** ISO-datum (bv. "2026-06-09") -> ISO-weeksleutel "2026-W24". */
export function isoWeekKey(dateStr: string): string {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  const day = (d.getUTCDay() + 6) % 7; // maandag = 0
  d.setUTCDate(d.getUTCDate() - day + 3); // donderdag van deze week
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDay = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d.getTime() - firstThu.getTime()) / (7 * 86400000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** "2026-W24" -> ISO-datum (maandag) van die week, bv. "2026-06-08". */
export function isoWeekStart(week: string): string {
  const m = week.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return "";
  const year = parseInt(m[1], 10);
  const wk = parseInt(m[2], 10);
  const simple = new Date(Date.UTC(year, 0, 1 + (wk - 1) * 7));
  const dow = simple.getUTCDay(); // 0=zo .. 6=za
  if (dow <= 4) {
    simple.setUTCDate(simple.getUTCDate() - dow + 1);
  } else {
    simple.setUTCDate(simple.getUTCDate() + 8 - dow);
  }
  return simple.toISOString().slice(0, 10);
}
