// Meta Marketing API databron (advertentie-performance + creative + status).
//
// Levert per advertentie: spend, impressions, clicks, CTR, leads (results), CPL,
// de creative-thumbnail (de échte ad-visual) en de status (Leren/Actief/…).
// Wordt actief zodra META_ACCESS_TOKEN + META_AD_ACCOUNT_IDS zijn ingevuld.

import type { AdPerformance, Platform } from "@/lib/types";
import { matchProject } from "@/lib/parks";
import { isoWeekKey } from "@/lib/format";

const GRAPH = "https://graph.facebook.com";

export function metaConfigured(): boolean {
  return Boolean(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_IDS);
}

function token() {
  return process.env.META_ACCESS_TOKEN!;
}
function version() {
  return process.env.META_API_VERSION ?? "v21.0";
}

function accountIds(): string[] {
  return (process.env.META_AD_ACCOUNT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => (id.startsWith("act_") ? id : `act_${id}`));
}

/** Aantal dagen historie dat we ophalen voor ad-performance. */
const LOOKBACK_DAYS = Number(process.env.META_LOOKBACK_DAYS ?? "90");

function dateRange(): { since: string; until: string } {
  const until = new Date();
  const since = new Date(until.getTime() - LOOKBACK_DAYS * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { since: fmt(since), until: fmt(until) };
}

/** Volgt paginering en verzamelt alle data-rijen van een Graph-endpoint. */
async function fetchAll<T>(startUrl: string): Promise<T[]> {
  let url: string | undefined = startUrl;
  const out: T[] = [];
  let guard = 0;
  while (url && guard++ < 100) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Meta API ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { data: T[]; paging?: { next?: string } };
    out.push(...json.data);
    url = json.paging?.next;
  }
  return out;
}

// --- Insights (per dag, per advertentie) -----------------------------------

interface InsightRow {
  date_start: string;
  ad_id?: string;
  ad_name?: string;
  campaign_name?: string;
  adset_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
}

function countLeads(actions: InsightRow["actions"]): number {
  if (!actions) return 0;
  return actions
    .filter((a) => a.action_type.toLowerCase().includes("lead"))
    .reduce((sum, a) => sum + (parseFloat(a.value) || 0), 0);
}

async function fetchInsights(accountId: string): Promise<InsightRow[]> {
  const { since, until } = dateRange();
  const fields = ["ad_id", "ad_name", "campaign_name", "adset_name", "spend", "impressions", "clicks", "actions"].join(",");
  const params = new URLSearchParams({
    level: "ad",
    fields,
    time_range: JSON.stringify({ since, until }),
    time_increment: "1",
    limit: "500",
    access_token: token(),
  });
  return fetchAll<InsightRow>(`${GRAPH}/${version()}/${accountId}/insights?${params}`);
}

// --- Ads (status + creative-thumbnail + adset-koppeling) --------------------

interface AdRow {
  id: string;
  name?: string;
  effective_status?: string;
  adset_id?: string;
  creative?: { thumbnail_url?: string; image_url?: string };
}

async function fetchAds(accountId: string): Promise<AdRow[]> {
  const params = new URLSearchParams({
    fields: "id,name,effective_status,adset_id,creative{thumbnail_url,image_url}",
    thumbnail_width: "320",
    thumbnail_height: "320",
    limit: "500",
    access_token: token(),
  });
  return fetchAll<AdRow>(`${GRAPH}/${version()}/${accountId}/ads?${params}`);
}

// --- Adsets (leerfase) ------------------------------------------------------

interface AdsetRow {
  id: string;
  learning_stage_info?: { status?: string };
}

async function fetchAdsets(accountId: string): Promise<AdsetRow[]> {
  const params = new URLSearchParams({
    fields: "id,learning_stage_info",
    limit: "500",
    access_token: token(),
  });
  return fetchAll<AdsetRow>(`${GRAPH}/${version()}/${accountId}/adsets?${params}`);
}

const STATUS_NL: Record<string, string> = {
  PAUSED: "Gepauzeerd",
  ADSET_PAUSED: "Gepauzeerd",
  CAMPAIGN_PAUSED: "Gepauzeerd",
  DISAPPROVED: "Afgekeurd",
  ARCHIVED: "Gearchiveerd",
  DELETED: "Verwijderd",
  PENDING_REVIEW: "In review",
  IN_PROCESS: "In behandeling",
  WITH_ISSUES: "Aandacht nodig",
};

function statusLabel(effectiveStatus: string | undefined, learning: string | undefined): string {
  if (effectiveStatus && effectiveStatus !== "ACTIVE") {
    return STATUS_NL[effectiveStatus] ?? effectiveStatus;
  }
  if (learning === "LEARNING") return "Leren";
  if (learning === "LEARNING_LIMITED") return "Leren (beperkt)";
  return "Actief";
}

// ---------------------------------------------------------------------------

export async function fetchAdPerformance(): Promise<AdPerformance[]> {
  const platform: Platform = "meta";
  const accounts = accountIds();

  const [insights, ads, adsets] = await Promise.all([
    Promise.all(accounts.map(fetchInsights)).then((a) => a.flat()),
    Promise.all(accounts.map(fetchAds)).then((a) => a.flat()),
    Promise.all(accounts.map(fetchAdsets)).then((a) => a.flat()),
  ]);

  const learningByAdset = new Map<string, string | undefined>();
  for (const s of adsets) learningByAdset.set(s.id, s.learning_stage_info?.status);

  const adMeta = new Map<string, { status: string; thumb: string | null }>();
  for (const ad of ads) {
    const learning = ad.adset_id ? learningByAdset.get(ad.adset_id) : undefined;
    adMeta.set(ad.id, {
      status: statusLabel(ad.effective_status, learning),
      thumb: ad.creative?.thumbnail_url ?? ad.creative?.image_url ?? null,
    });
  }

  // Aggregeer dag-insights naar (week, ad).
  type Acc = {
    week: string;
    adId: string;
    project: AdPerformance["project"];
    campaignName: string;
    adsetName: string;
    adName: string;
    spendEur: number;
    impressions: number;
    clicks: number;
    results: number;
  };
  const map = new Map<string, Acc>();

  for (const r of insights) {
    const week = isoWeekKey(r.date_start);
    if (!week || !r.ad_id) continue;
    const campaign = r.campaign_name ?? "";
    const adset = r.adset_name ?? "";
    const project = matchProject(campaign) ?? matchProject(adset) ?? "Algemeen";
    const key = `${week}__${r.ad_id}`;
    const acc =
      map.get(key) ??
      {
        week,
        adId: r.ad_id,
        project,
        campaignName: campaign,
        adsetName: adset,
        adName: r.ad_name ?? "",
        spendEur: 0,
        impressions: 0,
        clicks: 0,
        results: 0,
      };
    acc.spendEur += parseFloat(r.spend ?? "0") || 0;
    acc.impressions += parseInt(r.impressions ?? "0", 10) || 0;
    acc.clicks += parseInt(r.clicks ?? "0", 10) || 0;
    acc.results += countLeads(r.actions);
    map.set(key, acc);
  }

  return [...map.values()].map((a) => {
    const meta = adMeta.get(a.adId);
    return {
      week: a.week,
      project: a.project,
      platform,
      adId: a.adId,
      campaignName: a.campaignName,
      adsetName: a.adsetName,
      adName: a.adName,
      status: meta?.status ?? "Onbekend",
      thumbnailUrl: meta?.thumb ?? null,
      spendEur: Math.round(a.spendEur),
      impressions: a.impressions,
      clicks: a.clicks,
      results: Math.round(a.results),
      ctr: a.impressions ? a.clicks / a.impressions : 0,
      cpc: a.clicks ? a.spendEur / a.clicks : 0,
      cpl: a.results ? a.spendEur / a.results : 0,
    };
  });
}
