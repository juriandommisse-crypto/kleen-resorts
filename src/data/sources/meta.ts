// Meta Marketing API databron (advertentie-performance + wekelijkse spend).
//
// Levert de rijke cijfers die NIET in de sheet staan: impressions, clicks, CTR,
// results (leads) en CPL per advertentie per ISO-week. Wordt actief zodra
// META_ACCESS_TOKEN + META_AD_ACCOUNT_IDS zijn ingevuld.

import type { AdPerformance, Platform } from "@/lib/types";
import { matchProject } from "@/lib/parks";
import { isoWeekKey } from "@/lib/format";

const GRAPH = "https://graph.facebook.com";

export function metaConfigured(): boolean {
  return Boolean(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_IDS);
}

function accountIds(): string[] {
  return (process.env.META_AD_ACCOUNT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => (id.startsWith("act_") ? id : `act_${id}`));
}

/** Aantal dagen historie dat we ophalen (≈ aantal weken × 7). */
const LOOKBACK_DAYS = 56;

function dateRange(): { since: string; until: string } {
  const until = new Date();
  const since = new Date(until.getTime() - LOOKBACK_DAYS * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { since: fmt(since), until: fmt(until) };
}

interface MetaRow {
  date_start: string;
  campaign_name?: string;
  adset_name?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
}

interface MetaResponse {
  data: MetaRow[];
  paging?: { next?: string };
}

/** Tel lead-resultaten uit de actions-array (action_type bevat "lead"). */
function countLeads(actions: MetaRow["actions"]): number {
  if (!actions) return 0;
  return actions
    .filter((a) => a.action_type.toLowerCase().includes("lead"))
    .reduce((sum, a) => sum + (parseFloat(a.value) || 0), 0);
}

/** Haalt alle (gepagineerde) ad-level dagrijen op voor één account. */
async function fetchAccountRows(accountId: string): Promise<MetaRow[]> {
  const token = process.env.META_ACCESS_TOKEN!;
  const version = process.env.META_API_VERSION ?? "v21.0";
  const { since, until } = dateRange();

  const fields = ["campaign_name", "adset_name", "ad_name", "spend", "impressions", "clicks", "actions"].join(",");
  const params = new URLSearchParams({
    level: "ad",
    fields,
    time_range: JSON.stringify({ since, until }),
    time_increment: "1", // dagelijks; we bucketen zelf naar ISO-weken
    limit: "500",
    access_token: token,
  });

  let url: string | undefined = `${GRAPH}/${version}/${accountId}/insights?${params}`;
  const rows: MetaRow[] = [];
  let guard = 0;
  while (url && guard++ < 50) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Meta API ${res.status} (${accountId}): ${await res.text()}`);
    const json = (await res.json()) as MetaResponse;
    rows.push(...json.data);
    url = json.paging?.next;
  }
  return rows;
}

export async function fetchAdPerformance(): Promise<AdPerformance[]> {
  const platform: Platform = "meta";
  const accounts = accountIds();

  const allRows = (await Promise.all(accounts.map(fetchAccountRows))).flat();

  // Aggregeer dagrijen naar (week, project, campaign, adset, ad).
  type Acc = {
    week: string;
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

  for (const r of allRows) {
    const week = isoWeekKey(r.date_start);
    if (!week) continue;
    const campaign = r.campaign_name ?? "";
    const adset = r.adset_name ?? "";
    const ad = r.ad_name ?? "";
    // Project: eerst uit de campagnenaam (bevat vaak [FM]/[GW]), anders adset.
    const project = matchProject(campaign) ?? matchProject(adset) ?? "Algemeen";
    const key = `${week}__${campaign}__${adset}__${ad}`;
    const acc =
      map.get(key) ??
      {
        week,
        project,
        campaignName: campaign,
        adsetName: adset,
        adName: ad,
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

  return [...map.values()].map((a) => ({
    week: a.week,
    project: a.project,
    platform,
    campaignName: a.campaignName,
    adsetName: a.adsetName,
    adName: a.adName,
    spendEur: Math.round(a.spendEur),
    impressions: a.impressions,
    clicks: a.clicks,
    results: Math.round(a.results),
    ctr: a.impressions ? a.clicks / a.impressions : 0,
    cpc: a.clicks ? a.spendEur / a.clicks : 0,
    cpl: a.results ? a.spendEur / a.results : 0,
  }));
}
