// Centrale databron-provider.
//
// Eén functie `getDashboardData()` die de UI gebruikt. Hij schakelt tussen
// testdata (mock) en live-data (Sheets + Meta + Claude) op basis van
// DATA_SOURCE. Live is "partieel": leads kunnen al live draaien voordat de
// Meta-koppeling klaar is — ontbrekende delen blijven simpelweg leeg.

import type { AdPerformance, DashboardData, WeeklySpend } from "@/lib/types";
import { getMockData } from "./mock";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Leid wekelijkse spend per project/platform af uit de ad-performance (Meta). */
function deriveSpendFromAds(ads: AdPerformance[]): WeeklySpend[] {
  const map = new Map<string, WeeklySpend>();
  for (const ad of ads) {
    const key = `${ad.week}__${ad.project}__${ad.platform}`;
    const cur = map.get(key);
    if (cur) cur.spendEur += ad.spendEur;
    else map.set(key, { week: ad.week, project: ad.project, platform: ad.platform, spendEur: ad.spendEur });
  }
  for (const s of map.values()) s.spendEur = Math.round(s.spendEur);
  return [...map.values()];
}

export async function getDashboardData(): Promise<DashboardData> {
  if ((process.env.DATA_SOURCE ?? "mock") !== "live") {
    return getMockData();
  }

  // --- Live-pad. Lazy imports zodat mock-modus geen SDK's/credentials nodig heeft.
  const [sheets, meta, insightsMod] = await Promise.all([
    import("./sources/googleSheets"),
    import("./sources/meta"),
    import("./sources/insights"),
  ]);

  // Niets geconfigureerd? Val terug op mock zodat het dashboard blijft werken.
  if (!sheets.googleConfigured() && !meta.metaConfigured()) {
    return getMockData();
  }

  const notices: string[] = [];

  const weeklyLeads = sheets.googleConfigured()
    ? await sheets.fetchWeeklyLeads().catch((e: unknown) => {
        notices.push(`Leads (Google Sheets) konden niet geladen worden: ${msg(e)}`);
        return [];
      })
    : [];

  const adPerformance = meta.metaConfigured()
    ? await meta.fetchAdPerformance().catch((e: unknown) => {
        notices.push(`Advertentiedata (Meta) kon niet geladen worden: ${msg(e)}`);
        return [];
      })
    : [];

  const sheetSpend = sheets.googleConfigured()
    ? await sheets.fetchWeeklySpend().catch((e: unknown) => {
        notices.push(`Ad spend (Google Sheets) kon niet geladen worden: ${msg(e)}`);
        return [];
      })
    : [];

  // Ad spend bundelen ZONDER dubbeltelling:
  // - Meta-spend komt uit de Meta API (accuraat, recent).
  // - Google + LinkedIn komen uit de "Spend per park"-sheet.
  // - Voor weken die de Meta API niet dekt (>90 dagen terug) valt Meta terug
  //   op de sheet. We laten de Meta-rijen uit de sheet dus alleen vallen voor
  //   de weken waarin de API wél Meta-data heeft.
  const metaSpend = deriveSpendFromAds(adPerformance);
  const metaApiWeeks = new Set(metaSpend.map((s) => s.week));
  const sheetSpendNoDoubleMeta = sheetSpend.filter(
    (s) => !(s.platform === "meta" && metaApiWeeks.has(s.week)),
  );
  const weeklySpend = [...metaSpend, ...sheetSpendNoDoubleMeta];

  const projects = Array.from(new Set(weeklyLeads.map((l) => l.project))).sort();
  const currentWeek = [...weeklyLeads.map((l) => l.week)].sort().at(-1) ?? "";

  const base: Omit<DashboardData, "insights"> = {
    source: "live",
    generatedAt: new Date().toISOString(),
    currentWeek,
    projects,
    weeklyLeads,
    weeklySpend,
    adPerformance,
    notice: notices.length ? notices.join(" · ") : null,
  };

  const insights = await insightsMod
    .generateInsights(base)
    .catch(() => ({ week: null, month: null, year: null }));
  return { ...base, insights };
}
