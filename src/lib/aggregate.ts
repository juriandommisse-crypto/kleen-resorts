// Pure aggregatie-helpers die ruwe data omzetten naar wat de UI toont.
// Bewust framework-onafhankelijk en zonder side-effects, zodat ze zowel op de
// server als in de browser draaien en makkelijk te testen zijn.

import type { AdPerformance, DashboardData, Platform, WeeklyLeads, WeeklySpend } from "./types";

export const ALL_PROJECTS = "__all__";

function byProject<T extends { project: string }>(rows: T[], project: string): T[] {
  return project === ALL_PROJECTS ? rows : rows.filter((r) => r.project === project);
}

export interface WeeklyPoint {
  week: string;
  leads: number;
  spend: number;
  cpl: number; // kosten per lead
}

/** Tijdreeks van leads, spend en CPL per week (optioneel gefilterd op project). */
export function weeklySeries(data: DashboardData, project: string): WeeklyPoint[] {
  const leads = byProject(data.weeklyLeads, project);
  const spend = byProject(data.weeklySpend, project);

  const weeks = Array.from(
    new Set([...leads.map((l) => l.week), ...spend.map((s) => s.week)]),
  ).sort();

  return weeks.map((week) => {
    const leadsSum = leads.filter((l) => l.week === week).reduce((a, l) => a + l.leads, 0);
    const spendSum = spend.filter((s) => s.week === week).reduce((a, s) => a + s.spendEur, 0);
    return {
      week,
      leads: leadsSum,
      spend: Math.round(spendSum),
      cpl: leadsSum ? Math.round(spendSum / leadsSum) : 0,
    };
  });
}

export interface Kpis {
  leads: number;
  spend: number;
  cpl: number;
  appointments: number;
}

/** KPI's voor één week. */
export function kpisForWeek(data: DashboardData, project: string, week: string): Kpis {
  const leads = byProject(data.weeklyLeads, project).filter((l) => l.week === week);
  const spend = byProject(data.weeklySpend, project).filter((s) => s.week === week);
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

/** Spend per platform voor één week. */
export function spendByPlatform(
  data: DashboardData,
  project: string,
  week: string,
): Array<{ platform: Platform; spend: number }> {
  const rows = byProject(data.weeklySpend, project).filter((s) => s.week === week);
  const map = new Map<Platform, number>();
  for (const r of rows) map.set(r.platform, (map.get(r.platform) ?? 0) + r.spendEur);
  return [...map.entries()]
    .map(([platform, spend]) => ({ platform, spend: Math.round(spend) }))
    .sort((a, b) => b.spend - a.spend);
}

/**
 * Best presterende advertenties: gesorteerd op AANTAL leads (results) aflopend,
 * bij gelijk aantal de laagste CPL eerst. CPL wordt in de UI ernaast getoond.
 */
export function topAds(
  data: DashboardData,
  project: string,
  week: string,
  limit = 10,
): AdPerformance[] {
  return byProject(data.adPerformance, project)
    .filter((a) => a.week === week && a.results > 0)
    .sort((a, b) => b.results - a.results || a.cpl - b.cpl)
    .slice(0, limit);
}

/** Leads per project voor één week (voor de ranglijst). */
export function leadsByProject(
  data: DashboardData,
  week: string,
): Array<{ project: string; leads: number; spend: number; cpl: number }> {
  const leads = data.weeklyLeads.filter((l) => l.week === week);
  const spend = data.weeklySpend.filter((s) => s.week === week);
  const projects = Array.from(new Set(leads.map((l) => l.project)));
  return projects
    .map((project) => {
      const l = leads.filter((x) => x.project === project).reduce((a, x) => a + x.leads, 0);
      const s = spend.filter((x) => x.project === project).reduce((a, x) => a + x.spendEur, 0);
      return { project, leads: l, spend: Math.round(s), cpl: l ? Math.round(s / l) : 0 };
    })
    .sort((a, b) => b.leads - a.leads);
}

export type { WeeklyLeads, WeeklySpend };
