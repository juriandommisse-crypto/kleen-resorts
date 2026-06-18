// Pure aggregatie-helpers die ruwe data omzetten naar wat de UI toont.
// Bewust framework-onafhankelijk en zonder side-effects, zodat ze zowel op de
// server als in de browser draaien en makkelijk te testen zijn.
//
// Alles draait om een "periode": een granulariteit (week/maand/jaar) + een
// sleutel. Leads/spend/ads zijn per ISO-week opgeslagen; we bucketen ze naar de
// gekozen granulariteit via de maandag-datum van elke week.

import type { AdPerformance, DashboardData, Platform } from "./types";
import { isoWeekStart, prettyWeek } from "./format";

export const ALL_PROJECTS = "__all__";

export type Granularity = "week" | "month" | "year";

function byProject<T extends { project: string }>(rows: T[], project: string): T[] {
  return project === ALL_PROJECTS ? rows : rows.filter((r) => r.project === project);
}

/** Periode-sleutel van een ISO-week, afhankelijk van de granulariteit. */
export function periodKeyOf(week: string, g: Granularity): string {
  if (g === "week") return week;
  const start = isoWeekStart(week); // "YYYY-MM-DD"
  return g === "month" ? start.slice(0, 7) : start.slice(0, 4);
}

const MONTHS_NL = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];

/** Volledig leesbaar label, bv. "Week 25, 2026" / "juni 2026" / "2026". */
export function periodLabel(key: string, g: Granularity): string {
  if (g === "week") return prettyWeek(key);
  if (g === "year") return key;
  const [y, m] = key.split("-");
  return `${MONTHS_NL[parseInt(m, 10) - 1] ?? m} ${y}`;
}

/** Kort label voor de grafiek-as, bv. "W25" / "jun" / "2026". */
export function periodShortLabel(key: string, g: Granularity): string {
  if (g === "week") return key.replace(/^\d{4}-/, "");
  if (g === "year") return key;
  const [, m] = key.split("-");
  return (MONTHS_NL[parseInt(m, 10) - 1] ?? m).slice(0, 3);
}

/** Startdatum (ISO "YYYY-MM-DD") van een periode. */
export function periodStartISO(key: string, g: Granularity): string {
  if (g === "week") return isoWeekStart(key);
  if (g === "month") return `${key}-01`;
  return `${key}-01-01`;
}

/** Of een periode niet volledig in de toekomst ligt (start <= vandaag). */
function isPastOrCurrent(key: string, g: Granularity, now: Date): boolean {
  return periodStartISO(key, g) <= now.toISOString().slice(0, 10);
}

/** Exacte datumspan van een periode (week = ma t/m zo, maand/jaar = volledig). */
export function periodRange(key: string, g: Granularity): { start: Date; end: Date } {
  if (g === "week") {
    const start = new Date(`${isoWeekStart(key)}T00:00:00Z`);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return { start, end };
  }
  if (g === "month") {
    const [y, m] = key.split("-").map(Number);
    return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 0)) };
  }
  const y = Number(key);
  return { start: new Date(Date.UTC(y, 0, 1)), end: new Date(Date.UTC(y, 11, 31)) };
}

/** Alle beschikbare periodes voor een granulariteit (geen toekomst), oplopend. */
export function availablePeriods(data: DashboardData, g: Granularity, now = new Date()): string[] {
  const set = new Set<string>();
  for (const l of data.weeklyLeads) set.add(periodKeyOf(l.week, g));
  for (const s of data.weeklySpend) set.add(periodKeyOf(s.week, g));
  for (const a of data.adPerformance) set.add(periodKeyOf(a.week, g));
  return [...set]
    .filter(Boolean)
    .filter((k) => isPastOrCurrent(k, g, now))
    .sort();
}

const inPeriod = (week: string, g: Granularity, key: string) => periodKeyOf(week, g) === key;

// ---------------------------------------------------------------------------
// Tijdreeks (grafiek)
// ---------------------------------------------------------------------------

export interface SeriesPoint {
  key: string;
  label: string;
  leads: number;
  spend: number;
  cpl: number;
}

/** Tijdreeks van leads, spend en CPL per periode (optioneel gefilterd op project). */
export function series(
  data: DashboardData,
  project: string,
  g: Granularity,
  maxWeeks = 16,
  now = new Date(),
): SeriesPoint[] {
  const leads = byProject(data.weeklyLeads, project);
  const spend = byProject(data.weeklySpend, project);

  const leadByKey = new Map<string, number>();
  const spendByKey = new Map<string, number>();
  for (const l of leads) {
    const k = periodKeyOf(l.week, g);
    leadByKey.set(k, (leadByKey.get(k) ?? 0) + l.leads);
  }
  for (const s of spend) {
    const k = periodKeyOf(s.week, g);
    spendByKey.set(k, (spendByKey.get(k) ?? 0) + s.spendEur);
  }

  const keys = Array.from(new Set([...leadByKey.keys(), ...spendByKey.keys()]))
    .filter((k) => isPastOrCurrent(k, g, now))
    .sort();
  const trimmed = g === "week" ? keys.slice(-maxWeeks) : keys;

  return trimmed.map((key) => {
    const l = leadByKey.get(key) ?? 0;
    const s = Math.round(spendByKey.get(key) ?? 0);
    return { key, label: periodShortLabel(key, g), leads: l, spend: s, cpl: l ? Math.round(s / l) : 0 };
  });
}

// ---------------------------------------------------------------------------
// KPI's
// ---------------------------------------------------------------------------

export interface Kpis {
  leads: number;
  spend: number;
  cpl: number;
  appointments: number;
}

export function kpisForPeriod(
  data: DashboardData,
  project: string,
  g: Granularity,
  key: string,
): Kpis {
  const leads = byProject(data.weeklyLeads, project).filter((l) => inPeriod(l.week, g, key));
  const spend = byProject(data.weeklySpend, project).filter((s) => inPeriod(s.week, g, key));
  const leadsSum = leads.reduce((a, l) => a + l.leads, 0);
  const spendSum = spend.reduce((a, s) => a + s.spendEur, 0);
  const appts = leads.reduce((a, l) => a + l.appointments, 0);
  return {
    leads: leadsSum,
    spend: Math.round(spendSum),
    cpl: leadsSum ? Math.round(spendSum / leadsSum) : 0,
    appointments: appts,
  };
}

// ---------------------------------------------------------------------------
// Spend per platform
// ---------------------------------------------------------------------------

export function spendByPlatform(
  data: DashboardData,
  project: string,
  g: Granularity,
  key: string,
): Array<{ platform: Platform; spend: number }> {
  const rows = byProject(data.weeklySpend, project).filter((s) => inPeriod(s.week, g, key));
  const map = new Map<Platform, number>();
  for (const r of rows) map.set(r.platform, (map.get(r.platform) ?? 0) + r.spendEur);
  return [...map.entries()]
    .map(([platform, spend]) => ({ platform, spend: Math.round(spend) }))
    .sort((a, b) => b.spend - a.spend);
}

// ---------------------------------------------------------------------------
// Best presterende advertenties
// ---------------------------------------------------------------------------

/**
 * Best presterende advertenties over de periode: per advertentie samengeteld,
 * alleen advertenties met MEER DAN `minLeads` leads, gesorteerd op aantal leads
 * (bij gelijk aantal laagste CPL eerst). CPL/CTR/CPC worden herberekend.
 */
export function topAds(
  data: DashboardData,
  project: string,
  g: Granularity,
  key: string,
  { minLeads = 5, limit = 24 }: { minLeads?: number; limit?: number } = {},
): AdPerformance[] {
  const rows = byProject(data.adPerformance, project).filter((a) => inPeriod(a.week, g, key));

  const map = new Map<string, AdPerformance>();
  for (const a of rows) {
    const id = a.adId || `${a.campaignName}__${a.adsetName}__${a.adName}`;
    const cur = map.get(id);
    if (cur) {
      cur.spendEur += a.spendEur;
      cur.impressions += a.impressions;
      cur.clicks += a.clicks;
      cur.results += a.results;
    } else {
      map.set(id, { ...a, week: key });
    }
  }

  return [...map.values()]
    .map((a) => ({
      ...a,
      ctr: a.impressions ? a.clicks / a.impressions : 0,
      cpc: a.clicks ? a.spendEur / a.clicks : 0,
      cpl: a.results ? a.spendEur / a.results : 0,
    }))
    .filter((a) => a.results > minLeads)
    .sort((a, b) => b.results - a.results || a.cpl - b.cpl)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Leads per project (ranglijst)
// ---------------------------------------------------------------------------

export function leadsByProject(
  data: DashboardData,
  g: Granularity,
  key: string,
): Array<{ project: string; leads: number; spend: number; cpl: number }> {
  const leads = data.weeklyLeads.filter((l) => inPeriod(l.week, g, key));
  const spend = data.weeklySpend.filter((s) => inPeriod(s.week, g, key));
  const projects = Array.from(new Set(leads.map((l) => l.project)));
  return projects
    .map((project) => {
      const l = leads.filter((x) => x.project === project).reduce((a, x) => a + x.leads, 0);
      const s = spend.filter((x) => x.project === project).reduce((a, x) => a + x.spendEur, 0);
      return { project, leads: l, spend: Math.round(s), cpl: l ? Math.round(s / l) : 0 };
    })
    .sort((a, b) => b.leads - a.leads);
}
