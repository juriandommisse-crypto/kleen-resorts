// Centrale databron-provider.
//
// Eén functie `getDashboardData()` die de UI gebruikt. Hij schakelt tussen
// testdata (mock) en live-data (Sheets + Meta + Claude) op basis van
// DATA_SOURCE. Zo blijft de rest van de app onveranderd als we live gaan.

import type { DashboardData } from "@/lib/types";
import { getMockData } from "./mock";

export async function getDashboardData(): Promise<DashboardData> {
  const source = process.env.DATA_SOURCE ?? "mock";

  if (source !== "live") {
    return getMockData();
  }

  // --- Live-pad ------------------------------------------------------
  // Lazy imports zodat de mock-modus geen credentials/SDK's nodig heeft.
  const [{ fetchWeeklyLeads, fetchWeeklySpend }, { fetchAdPerformance }, { generateInsight }] =
    await Promise.all([
      import("./sources/googleSheets"),
      import("./sources/meta"),
      import("./sources/insights"),
    ]);

  const [weeklyLeads, weeklySpend, adPerformance] = await Promise.all([
    fetchWeeklyLeads(),
    fetchWeeklySpend(),
    fetchAdPerformance(),
  ]);

  const projects = Array.from(new Set(weeklyLeads.map((l) => l.project))).sort();
  const currentWeek = weeklyLeads.map((l) => l.week).sort().at(-1) ?? "";

  const base: Omit<DashboardData, "insight"> = {
    generatedAt: new Date().toISOString(),
    currentWeek,
    projects,
    weeklyLeads,
    weeklySpend,
    adPerformance,
  };

  const insight = await generateInsight(base).catch(() => null);
  return { ...base, insight };
}
