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

/** De échte creative-inhoud van een advertentie, genoeg om een getrouwe
 *  Facebook-feed-weergave zelf op te bouwen (zonder Facebook-iframe). */
export interface AdCreative {
  /** Volledige-resolutie afbeelding van de creative (of video-poster). */
  imageUrl: string | null;
  /** True als de creative een video is (we tonen dan het posterbeeld). */
  isVideo: boolean;
  /** Primaire tekst boven de afbeelding. */
  body: string | null;
  /** Kop onder de afbeelding. */
  title: string | null;
  /** Linkbeschrijving onder de kop. */
  description: string | null;
  /** Call-to-action label (NL), bv. "Meer informatie". */
  cta: string | null;
  /** Weergegeven domein/link, bv. "kleenresortsverkoop.nl". */
  displayLink: string | null;
  /** Naam van de adverterende pagina. */
  pageName: string | null;
  /** Profielfoto-URL van de pagina (of null). */
  pageAvatar: string | null;
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
  /** URL van de rendered creative-thumbnail (of null als onbekend). */
  thumbnailUrl: string | null;
  /** Deelbare preview-link in Meta Ads Manager (of null als onbekend). */
  previewUrl: string | null;
  /** Échte creative-inhoud om de advertentie zelf na te bouwen (of null). */
  creative: AdCreative | null;
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
