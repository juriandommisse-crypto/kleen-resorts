// Meta Marketing API databron (advertentie-performance + creative + status).
//
// Levert per advertentie: spend, impressions, clicks, CTR, leads (results), CPL,
// de creative-afbeelding op volledige resolutie (de échte ad-visual) en de
// status (Leren/Actief/…). Actief zodra META_ACCESS_TOKEN + META_AD_ACCOUNT_IDS
// zijn ingevuld.

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
  account_name?: string;
  campaign_name?: string;
  adset_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
}

// Action-types die een ECHT lead-resultaat zijn (= Meta's "Resultaat").
// LET OP: NIET optellen — Meta rapporteert hetzelfde resultaat onder meerdere
// types (allemaal gelijk), en "..._content_view_..." / "..._contact_..." zijn
// content-views/contacten, GEEN leads.
const REAL_LEAD_ACTION_TYPES = new Set([
  "lead",
  "onsite_web_lead",
  "offsite_conversion.fb_pixel_lead",
  "offsite_lead_add_20_s_calls",
  "onsite_conversion.lead_grouped",
  "leadgen.other",
]);

/** Aantal resultaten (leads) zoals Meta het telt voor "Kosten per resultaat". */
function countResults(actions: InsightRow["actions"]): number {
  if (!actions) return 0;

  const override = process.env.META_RESULT_ACTION_TYPE;
  if (override) {
    const m = actions.find((a) => a.action_type === override);
    return m ? parseFloat(m.value) || 0 : 0;
  }

  // Voorkeur: het standaard "lead"-resultaat.
  const lead = actions.find((a) => a.action_type === "lead");
  if (lead) return parseFloat(lead.value) || 0;

  // Anders het hoogste echte lead-type (gelijke duplicaten -> max, niet de som).
  let max = 0;
  for (const a of actions) {
    if (REAL_LEAD_ACTION_TYPES.has(a.action_type)) max = Math.max(max, parseFloat(a.value) || 0);
  }
  return max;
}

async function fetchInsights(accountId: string): Promise<InsightRow[]> {
  const { since, until } = dateRange();
  const fields = ["ad_id", "ad_name", "account_name", "campaign_name", "adset_name", "spend", "impressions", "clicks", "actions"].join(",");
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

// --- Ads (status + creative) ------------------------------------------------

interface Creative {
  image_url?: string;
  thumbnail_url?: string;
  image_hash?: string;
  object_story_spec?: {
    link_data?: { picture?: string; image_hash?: string };
    photo_data?: { url?: string; image_hash?: string };
    video_data?: { image_url?: string; image_hash?: string };
  };
  asset_feed_spec?: { images?: Array<{ hash?: string }> };
}

interface AdRow {
  id: string;
  name?: string;
  effective_status?: string;
  adset_id?: string;
  creative?: Creative;
}

async function fetchAds(accountId: string): Promise<AdRow[]> {
  const creativeFields =
    "image_url,thumbnail_url,image_hash,object_story_spec,asset_feed_spec";
  const params = new URLSearchParams({
    fields: `id,name,effective_status,adset_id,creative{${creativeFields}}`,
    thumbnail_width: "600",
    thumbnail_height: "600",
    limit: "500",
    access_token: token(),
  });
  return fetchAll<AdRow>(`${GRAPH}/${version()}/${accountId}/ads?${params}`);
}

/** Alle image-hashes die in een creative voorkomen (volgorde = voorkeur). */
function hashesOf(creative?: Creative): string[] {
  const hs: string[] = [];
  const push = (h?: string) => h && !hs.includes(h) && hs.push(h);
  push(creative?.image_hash);
  push(creative?.object_story_spec?.link_data?.image_hash);
  push(creative?.object_story_spec?.photo_data?.image_hash);
  push(creative?.object_story_spec?.video_data?.image_hash);
  for (const im of creative?.asset_feed_spec?.images ?? []) push(im.hash);
  return hs;
}

/** Directe afbeeldings-URL uit de creative (zonder hash-lookup). */
function pictureUrl(creative?: Creative): string | null {
  const oss = creative?.object_story_spec;
  return (
    creative?.image_url ??
    oss?.link_data?.picture ??
    oss?.video_data?.image_url ??
    oss?.photo_data?.url ??
    null
  );
}

/** Map image-hash -> volledige afbeelding-URL via het adimages-endpoint. */
async function fetchAdImages(accountId: string, hashes: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < hashes.length; i += 50) {
    const chunk = hashes.slice(i, i + 50);
    const params = new URLSearchParams({
      hashes: JSON.stringify(chunk),
      fields: "hash,url,permalink_url",
      limit: "500",
      access_token: token(),
    });
    const rows = await fetchAll<{ hash?: string; url?: string; permalink_url?: string }>(
      `${GRAPH}/${version()}/${accountId}/adimages?${params}`,
    );
    for (const r of rows) {
      const url = r.permalink_url || r.url;
      if (r.hash && url) map.set(r.hash, url);
    }
  }
  return map;
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

type AdMeta = { status: string; thumb: string | null };

// ---------------------------------------------------------------------------

export async function fetchAdPerformance(): Promise<AdPerformance[]> {
  const platform: Platform = "meta";
  const accounts = accountIds();

  // Per account ophalen en fouten isoleren: één account zonder toegang mag niet
  // de hele ad-view blokkeren.
  const perAccount = await Promise.all(
    accounts.map(async (acc) => {
      try {
        const [ins, ads, sets] = await Promise.all([
          fetchInsights(acc),
          fetchAds(acc),
          fetchAdsets(acc),
        ]);

        const learningByAdset = new Map<string, string | undefined>();
        for (const s of sets) learningByAdset.set(s.id, s.learning_stage_info?.status);

        // Originele afbeeldingen ophalen via hashes (volledige resolutie).
        const allHashes = Array.from(new Set(ads.flatMap((a) => hashesOf(a.creative))));
        const imgByHash = allHashes.length ? await fetchAdImages(acc, allHashes) : new Map<string, string>();

        const entries = ads.map((ad) => {
          const learning = ad.adset_id ? learningByAdset.get(ad.adset_id) : undefined;
          const fromHash = hashesOf(ad.creative)
            .map((h) => imgByHash.get(h))
            .find(Boolean);
          const thumb = fromHash ?? pictureUrl(ad.creative) ?? ad.creative?.thumbnail_url ?? null;
          return [ad.id, { status: statusLabel(ad.effective_status, learning), thumb }] as const;
        });

        return { ins, entries, err: null as string | null };
      } catch (e) {
        return { ins: [] as InsightRow[], entries: [] as (readonly [string, AdMeta])[], err: e instanceof Error ? e.message : String(e) };
      }
    }),
  );

  const failed = perAccount.filter((r) => r.err);
  if (accounts.length > 0 && failed.length === accounts.length) {
    throw new Error(failed[0].err ?? "Meta-data kon niet geladen worden.");
  }

  const insights = perAccount.flatMap((r) => r.ins);
  const adMeta = new Map<string, AdMeta>(perAccount.flatMap((r) => r.entries));

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
    const account = r.account_name ?? "";
    const project = matchProject(campaign) ?? matchProject(adset) ?? matchProject(account) ?? "Algemeen";
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
    acc.results += countResults(r.actions);
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
