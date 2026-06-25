// Realistische testdata, gemodelleerd op de echte sheets van Kleen Resorts.
// Cijfers zijn fictief maar plausibel, zodat het dashboard volledig werkt
// zónder credentials. Wordt gebruikt zolang DATA_SOURCE !== "live".

import type {
  AdPerformance,
  DashboardData,
  Platform,
  WeeklyLeads,
  WeeklySpend,
} from "@/lib/types";

const PROJECTS = [
  "Fryske Mar - Resort Balk",
  "Huis ter Huynen",
  "Greenerwold",
  "Resort Oysterduinen - Yerseke",
  "WestonBay - Resort Amsterdam",
];

// Laatste 12 ISO-weken t/m 2026-W25 (sluit aan op de echte data).
const WEEKS: Array<{ week: string; weekStart: string }> = [
  { week: "2026-W14", weekStart: "2026-03-30" },
  { week: "2026-W15", weekStart: "2026-04-06" },
  { week: "2026-W16", weekStart: "2026-04-13" },
  { week: "2026-W17", weekStart: "2026-04-20" },
  { week: "2026-W18", weekStart: "2026-04-27" },
  { week: "2026-W19", weekStart: "2026-05-04" },
  { week: "2026-W20", weekStart: "2026-05-11" },
  { week: "2026-W21", weekStart: "2026-05-18" },
  { week: "2026-W22", weekStart: "2026-05-25" },
  { week: "2026-W23", weekStart: "2026-06-01" },
  { week: "2026-W24", weekStart: "2026-06-08" },
  { week: "2026-W25", weekStart: "2026-06-15" },
];

// Deterministische pseudo-random zodat de testdata stabiel is.
function seeded(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const rnd = seeded(42);
const between = (min: number, max: number) => Math.round(min + rnd() * (max - min));

function buildLeads(): WeeklyLeads[] {
  const out: WeeklyLeads[] = [];
  PROJECTS.forEach((project, pi) => {
    WEEKS.forEach(({ week, weekStart }) => {
      const base = [120, 90, 60, 45, 35][pi] ?? 40;
      const leads = between(Math.round(base * 0.6), Math.round(base * 1.4));
      const inContact = Math.round(leads * (0.15 + rnd() * 0.15));
      const appointments = Math.round(inContact * (0.1 + rnd() * 0.25));
      const lost = Math.round(leads * (0.02 + rnd() * 0.05));
      out.push({ week, weekStart, project, leads, inContact, appointments, lost });
    });
  });
  return out;
}

const PLATFORMS: Platform[] = ["meta", "google", "linkedin"];

function buildSpend(): WeeklySpend[] {
  const out: WeeklySpend[] = [];
  PROJECTS.forEach((project, pi) => {
    WEEKS.forEach(({ week }) => {
      PLATFORMS.forEach((platform) => {
        const platformWeight = platform === "meta" ? 1 : platform === "google" ? 0.35 : 0.1;
        const base = [1500, 1100, 800, 600, 450][pi] ?? 500;
        const spendEur = Math.round(base * platformWeight * (0.7 + rnd() * 0.6));
        if (spendEur > 0) out.push({ week, project, platform, spendEur });
      });
    });
  });
  return out;
}

const CAMPAIGN_TEMPLATES = [
  { campaign: "[BB] [FM] Fryske Mar", adset: "Broad targeting", ad: "Afbeelding voorjaar/zomer" },
  { campaign: "[BB] Retargeting", adset: "Retargeting", ad: "Video rondleiding" },
  { campaign: "[BB] [HTH] Huis ter Huynen", adset: "Interesse natuur", ad: "Carrousel chalets" },
  { campaign: "[BB] [GW] Greenerwold", adset: "Lookalike kopers", ad: "Afbeelding waterzicht" },
  { campaign: "[BB] [OYS] Oysterduinen", adset: "Zeeland 25-55", ad: "Video drone" },
];

function buildAdPerformance(): AdPerformance[] {
  const out: AdPerformance[] = [];
  // Alleen Meta op ad-niveau, voor de laatste 4 weken (zoals een API-pull).
  const recent = WEEKS.slice(-4);
  PROJECTS.forEach((project, pi) => {
    recent.forEach(({ week }) => {
      CAMPAIGN_TEMPLATES.forEach((tpl, ti) => {
        const spendEur = between(80, 900);
        const impressions = between(5000, 90000);
        const ctr = 0.005 + rnd() * 0.03;
        const clicks = Math.max(1, Math.round(impressions * ctr));
        const results = Math.max(0, Math.round(clicks * (0.03 + rnd() * 0.12)));
        const cpc = clicks ? spendEur / clicks : 0;
        const cpl = results ? spendEur / results : 0;
        out.push({
          week,
          project,
          platform: "meta",
          adId: `mock_${pi + 1}_${ti + 1}`,
          campaignName: tpl.campaign,
          adsetName: tpl.adset,
          adName: `${tpl.ad} #${pi + 1}.${ti + 1}`,
          status: ti % 3 === 0 ? "Leren" : "Actief",
          thumbnailUrl: null,
          previewUrl: null,
          spendEur,
          impressions,
          clicks,
          results,
          ctr,
          cpc,
          cpl,
        });
      });
    });
  });
  return out;
}

export function getMockData(): DashboardData {
  const weeklyLeads = buildLeads();
  const weeklySpend = buildSpend();
  const adPerformance = buildAdPerformance();
  const currentWeek = WEEKS[WEEKS.length - 1].week;

  return {
    source: "mock",
    generatedAt: new Date().toISOString(),
    currentWeek,
    projects: PROJECTS,
    weeklyLeads,
    weeklySpend,
    adPerformance,
    insights: { week: mockInsight, month: mockInsight, year: mockInsight },
  };
}

const mockInsight = {
  week: "2026-W25",
  headline: "Voorbeeld-samenvatting (testdata)",
  bullets: [
    "Dit is gegenereerde testdata. Met een OpenAI API-key schrijft het model hier een echte duiding per view.",
    "Kosten per lead bij Fryske Mar liggen het laagst; retargeting-advertenties presteren bovengemiddeld.",
    "Greenerwold laat de sterkste week-op-week groei in leads zien.",
  ],
  generatedAt: new Date().toISOString(),
};
