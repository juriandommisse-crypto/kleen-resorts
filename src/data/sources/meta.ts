// Meta Marketing API databron (advertentie-performance + creative + status).
//
// Levert per advertentie: spend, impressions, clicks, CTR, leads (results), CPL,
// de creative-afbeelding op volledige resolutie (de échte ad-visual) en de
// status (Leren/Actief/…). Actief zodra META_ACCESS_TOKEN + META_AD_ACCOUNT_IDS
// zijn ingevuld.

import type { AdCreative, AdPerformance, Platform } from "@/lib/types";
import { matchProject } from "@/lib/parks";
import { isoWeekKey } from "@/lib/format";

const PARK_ABBREVS: Record<string, string> = {
  "Fryske Mar - Resort Balk": "FM",
  "Greenerwold": "GW",
  "Wiedeweer": "WW",
  "Huis ter Huynen": "HTH",
  "Resort Oysterduinen - Yerseke": "OYS",
};

/** Prefix generieke ad-namen (bv. "Afbeelding") met de park-afkorting zodat
 *  ze onderscheidend zijn in het dashboard en de AI-samenvatting. */
function enrichAdName(raw: string, project: string): string {
  if (!raw) return raw;
  if (/^[A-Z]{2,5}\s*[|·]/.test(raw)) return raw; // al geprefixed
  const abbrev = PARK_ABBREVS[project];
  if (abbrev) return `${abbrev} | ${raw}`;
  return raw;
}

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

interface Cta {
  type?: string;
}
interface LinkData {
  message?: string;
  name?: string;
  description?: string;
  caption?: string;
  picture?: string;
  image_hash?: string;
  call_to_action?: Cta;
}
interface VideoData {
  message?: string;
  title?: string;
  link_description?: string;
  image_url?: string;
  image_hash?: string;
  video_id?: string;
  call_to_action?: Cta;
}
interface PhotoData {
  caption?: string;
  url?: string;
  image_hash?: string;
}
interface AssetFeedSpec {
  images?: Array<{ hash?: string; url?: string }>;
  videos?: Array<{ video_id?: string; thumbnail_url?: string; url?: string }>;
  bodies?: Array<{ text?: string }>;
  titles?: Array<{ text?: string }>;
  descriptions?: Array<{ text?: string }>;
  link_urls?: Array<{ display_url?: string; website_url?: string }>;
  call_to_action_types?: string[];
}

interface Creative {
  image_url?: string;
  thumbnail_url?: string;
  image_hash?: string;
  title?: string;
  body?: string;
  /** ID van de live gepubliceerde post — weerspiegelt ALTIJD de laatste versie. */
  effective_object_story_id?: string;
  object_story_spec?: {
    page_id?: string;
    link_data?: LinkData;
    photo_data?: PhotoData;
    video_data?: VideoData;
  };
  asset_feed_spec?: AssetFeedSpec;
}

interface AdRow {
  id: string;
  name?: string;
  effective_status?: string;
  adset_id?: string;
  preview_shareable_link?: string;
  creative?: Creative;
}

async function fetchAds(accountId: string): Promise<AdRow[]> {
  const creativeFields = [
    "image_url",
    "thumbnail_url",
    "image_hash",
    "title",
    "body",
    "effective_object_story_id",
    "object_story_spec{page_id,link_data{message,name,description,caption,picture,image_hash,call_to_action},photo_data{caption,url,image_hash},video_data{message,title,link_description,image_url,image_hash,video_id,call_to_action}}",
    "asset_feed_spec{images,videos,bodies,titles,descriptions,link_urls,call_to_action_types}",
  ].join(",");
  const params = new URLSearchParams({
    fields: `id,name,effective_status,adset_id,preview_shareable_link,creative{${creativeFields}}`,
    thumbnail_width: "1080",
    thumbnail_height: "1080",
    limit: "500",
    access_token: token(),
  });
  return fetchAll<AdRow>(`${GRAPH}/${version()}/${accountId}/ads?${params}`);
}

// --- Pagina-info (naam + profielfoto) voor de zelf-gerenderde preview --------

interface PageInfo {
  name?: string;
  avatar?: string;
}

/** Haalt naam + profielfoto op voor een set pagina-ids (gebatcht). */
async function fetchPages(pageIds: string[]): Promise<Map<string, PageInfo>> {
  const map = new Map<string, PageInfo>();
  const ids = Array.from(new Set(pageIds.filter(Boolean)));
  if (!ids.length) return map;
  try {
    const params = new URLSearchParams({
      ids: ids.join(","),
      fields: "name,picture{url}",
      access_token: token(),
    });
    const res = await fetch(`${GRAPH}/${version()}/?${params}`);
    if (res.ok) {
      const json = (await res.json()) as Record<
        string,
        { name?: string; picture?: { data?: { url?: string } } }
      >;
      for (const id of ids) {
        const p = json[id];
        if (p) map.set(id, { name: p.name, avatar: p.picture?.data?.url });
      }
    }
  } catch {
    /* pagina-info is optioneel — val terug op merknaam in de UI */
  }
  return map;
}

// --- Live gepubliceerde post (= de ALLERLAATSTE versie van de creative) ------

interface PostMedia {
  body: string | null;
  image: string | null;
  isVideo: boolean;
  title: string | null;
  description: string | null;
  displayLink: string | null;
  pageName: string | null;
  pageAvatar: string | null;
}

interface PostAttachment {
  media_type?: string;
  media?: { image?: { src?: string } };
  title?: string;
  description?: string;
  unshimmed_url?: string;
  target?: { url?: string };
}
interface PostRow {
  message?: string;
  full_picture?: string;
  attachments?: { data?: PostAttachment[] };
  from?: { name?: string; picture?: { data?: { url?: string } } };
}

/** Haalt de live post-inhoud op (gebatcht). Dit weerspiegelt de laatste edit. */
async function fetchPosts(storyIds: string[]): Promise<Map<string, PostMedia>> {
  const map = new Map<string, PostMedia>();
  const ids = Array.from(new Set(storyIds.filter(Boolean)));
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    try {
      const params = new URLSearchParams({
        ids: chunk.join(","),
        fields:
          "message,full_picture,attachments{media_type,media,title,description,unshimmed_url,target},from{name,picture{url}}",
        access_token: token(),
      });
      const res = await fetch(`${GRAPH}/${version()}/?${params}`);
      if (!res.ok) continue;
      const json = (await res.json()) as Record<string, PostRow>;
      for (const id of chunk) {
        const p = json[id];
        if (!p) continue;
        const att = p.attachments?.data?.[0];
        map.set(id, {
          body: p.message ?? null,
          image: att?.media?.image?.src ?? p.full_picture ?? null,
          isVideo: att?.media_type === "video",
          title: att?.title ?? null,
          description: att?.description ?? null,
          displayLink: cleanDomain(att?.unshimmed_url ?? att?.target?.url),
          pageName: p.from?.name ?? null,
          pageAvatar: p.from?.picture?.data?.url ?? null,
        });
      }
    } catch {
      /* post-inhoud is optioneel — val terug op de creative-spec */
    }
  }
  return map;
}

/** Vertaalt Meta's call-to-action-type naar een Nederlands knoplabel. */
const CTA_NL: Record<string, string> = {
  LEARN_MORE: "Meer informatie",
  SIGN_UP: "Aanmelden",
  SUBSCRIBE: "Abonneren",
  CONTACT_US: "Contact opnemen",
  GET_OFFER: "Aanbieding bekijken",
  GET_QUOTE: "Offerte aanvragen",
  DOWNLOAD: "Downloaden",
  APPLY_NOW: "Nu aanvragen",
  BOOK_TRAVEL: "Nu boeken",
  SEND_MESSAGE: "Bericht sturen",
  GET_DIRECTIONS: "Route",
  SEE_MORE: "Meer weergeven",
  OPEN_LINK: "Meer informatie",
  SHOP_NOW: "Nu shoppen",
  WATCH_MORE: "Meer bekijken",
  REQUEST_TIME: "Tijd aanvragen",
};

function ctaLabel(type?: string | null): string | null {
  if (!type) return null;
  return CTA_NL[type] ?? type.replace(/_/g, " ").toLowerCase();
}

/** Strip protocol/www en pad zodat alleen het domein resteert. */
function cleanDomain(url?: string | null): string | null {
  if (!url) return null;
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0] || null;
}

/** Bouwt de échte creative-inhoud op. De live post (effective_object_story_id)
 *  is leidend, want die weerspiegelt ALTIJD de laatste versie van de advertentie;
 *  de creative-spec dient alleen als fallback. */
function buildCreative(
  creative: Creative | undefined,
  imgByHash: Map<string, string>,
  pages: Map<string, PageInfo>,
  posts: Map<string, PostMedia>,
): AdCreative | null {
  if (!creative) return null;
  const oss = creative.object_story_spec;
  const link = oss?.link_data;
  const vid = oss?.video_data;
  const afs = creative.asset_feed_spec;
  const post = creative.effective_object_story_id
    ? posts.get(creative.effective_object_story_id)
    : undefined;

  const imageFromHash = hashesOf(creative)
    .map((h) => imgByHash.get(h))
    .find(Boolean);

  // Afbeelding: de live post eerst (= laatste versie), daarna spec-fallbacks.
  const imageUrl =
    post?.image ??
    imageFromHash ??
    creative.image_url ??
    vid?.image_url ??
    afs?.videos?.[0]?.thumbnail_url ??
    pictureUrl(creative) ??
    creative.thumbnail_url ??
    null;

  const isVideo = post?.isVideo ?? Boolean(vid?.video_id || afs?.videos?.length);

  const body =
    post?.body ?? link?.message ?? vid?.message ?? creative.body ?? afs?.bodies?.[0]?.text ?? null;
  const title =
    post?.title ?? link?.name ?? vid?.title ?? creative.title ?? afs?.titles?.[0]?.text ?? null;
  const description =
    post?.description ??
    link?.description ??
    vid?.link_description ??
    afs?.descriptions?.[0]?.text ??
    null;
  const ctaType =
    link?.call_to_action?.type ?? vid?.call_to_action?.type ?? afs?.call_to_action_types?.[0] ?? null;
  const displayLink =
    post?.displayLink ??
    cleanDomain(link?.caption ?? afs?.link_urls?.[0]?.display_url ?? afs?.link_urls?.[0]?.website_url);

  const page = oss?.page_id ? pages.get(oss.page_id) : undefined;

  return {
    imageUrl,
    isVideo,
    body,
    title,
    description,
    cta: ctaLabel(ctaType),
    displayLink,
    pageName: post?.pageName ?? page?.name ?? null,
    pageAvatar: post?.pageAvatar ?? page?.avatar ?? null,
  };
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

type AdMeta = {
  status: string;
  thumb: string | null;
  previewUrl: string | null;
  creative: AdCreative | null;
};

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

        // Live posts (laatste versie) + pagina-info voor de zelf-gerenderde preview.
        const storyIds = ads
          .map((a) => a.creative?.effective_object_story_id)
          .filter((s): s is string => Boolean(s));
        const pageIds = ads
          .map((a) => a.creative?.object_story_spec?.page_id)
          .filter((p): p is string => Boolean(p));
        const [posts, pages] = await Promise.all([fetchPosts(storyIds), fetchPages(pageIds)]);

        const entries = ads.map((ad) => {
          const learning = ad.adset_id ? learningByAdset.get(ad.adset_id) : undefined;
          const creative = buildCreative(ad.creative, imgByHash, pages, posts);
          // Volledige-resolutie afbeelding als kaart-thumbnail (scherp, de échte visual).
          const fromHash = hashesOf(ad.creative)
            .map((h) => imgByHash.get(h))
            .find(Boolean);
          const thumb =
            creative?.imageUrl ??
            fromHash ??
            pictureUrl(ad.creative) ??
            ad.creative?.thumbnail_url ??
            null;
          const previewUrl = ad.preview_shareable_link ?? null;
          return [
            ad.id,
            { status: statusLabel(ad.effective_status, learning), thumb, previewUrl, creative },
          ] as const;
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
        adName: enrichAdName(r.ad_name ?? "", project),
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
      previewUrl: meta?.previewUrl ?? null,
      creative: meta?.creative ?? null,
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
