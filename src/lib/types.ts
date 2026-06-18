// Domeinmodellen voor het Kleen Resorts dashboard.
// Deze types zijn de "taal" die de UI en alle databronnen delen, zodat we
// later moeiteloos van testdata naar live-data (Sheets + Meta) kunnen wisselen.

/** Een project/resort van Kleen Resorts (volledige, canonieke naam). */
export type ProjectName = string;

/** ISO-weeksleutel zoals in de Leads-sheet, bv. "2026-W24". */
export type WeekKey = string;

/** Advertentieplatform. */
export type Platform = "meta" | "google" | "linkedin";

/** Wekelijkse leadcijfers per project (uit de Leads-sheet). */
export interface WeeklyLeads {
  week: WeekKey;
  weekStart: string; // ISO-datum van maandag van die week
  project: ProjectName;
  leads: number;
  inContact: number;
  appointments: number; // "Afspraak gepland"
  lost: number;
}

/** Wekelijkse ad spend per project en platform (genormaliseerd naar EUR). */
export interface WeeklySpend {
  week: WeekKey;
  project: ProjectName;
  platform: Platform;
  spendEur: number;
}

/** Performance van één advertentie in een periode (vooral Meta). */
export interface AdPerformance {
  week: WeekKey;
  project: ProjectName;
  platform: Platform;
  adId: string;
  campaignName: string;
  adsetName: string;
  adName: string;
  /** Weergavestatus uit Meta: "Actief", "Leren", "Gepauzeerd", … */
  status: string;
  /** URL van de creative-thumbnail (of null als onbekend). */
  thumbnailUrl: string | null;
  spendEur: number;
  impressions: number;
  clicks: number;
  results: number; // leads/conversies toegeschreven door het platform
  ctr: number; // click-through-rate (0..1)
  cpc: number; // kosten per klik (EUR)
  cpl: number; // kosten per resultaat/lead (EUR)
}

/** Door Claude gegenereerde wekelijkse duiding. */
export interface WeeklyInsight {
  week: WeekKey;
  headline: string;
  bullets: string[];
  generatedAt: string; // ISO-timestamp
}

/** Alles wat het dashboard nodig heeft, gebundeld. */
export interface DashboardData {
  generatedAt: string;
  currentWeek: WeekKey;
  projects: ProjectName[];
  weeklyLeads: WeeklyLeads[];
  weeklySpend: WeeklySpend[];
  adPerformance: AdPerformance[];
  /** Slimme samenvatting per granulariteit (week/maand/jaar). */
  insights: {
    week: WeeklyInsight | null;
    month: WeeklyInsight | null;
    year: WeeklyInsight | null;
  };
  /** Zichtbare melding wanneer een live-bron faalde (anders null). */
  notice?: string | null;
  /** Herkomst van de getoonde data. */
  source: "mock" | "live";
}
