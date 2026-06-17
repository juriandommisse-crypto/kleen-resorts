// Meta Marketing API databron (advertentie-performance + dag/week-spend).
//
// STATUS: stub. Levert straks de rijke cijfers die NIET in de sheet staan:
// impressions, clicks, CTR, results (leads) en CPL per advertentie per dag.
// Wordt geactiveerd zodra META_ACCESS_TOKEN + META_AD_ACCOUNT_IDS zijn ingevuld.

import type { AdPerformance } from "@/lib/types";

const GRAPH = "https://graph.facebook.com";

interface MetaInsightRow {
  campaign_name: string;
  adset_name: string;
  ad_name: string;
  spend: string;
  impressions: string;
  clicks: string;
  ctr: string;
  actions?: Array<{ action_type: string; value: string }>;
}

/**
 * Haalt ad-level insights op voor één ad-account over een datumbereik.
 * Gebruikt het `insights`-endpoint met level=ad en een time_increment.
 */
export async function fetchAccountInsights(
  accountId: string,
  since: string,
  until: string,
): Promise<MetaInsightRow[]> {
  const token = process.env.META_ACCESS_TOKEN;
  const version = process.env.META_API_VERSION ?? "v21.0";
  if (!token) throw new Error("META_ACCESS_TOKEN ontbreekt (zie .env.example).");

  const fields = ["campaign_name", "adset_name", "ad_name", "spend", "impressions", "clicks", "ctr", "actions"].join(",");
  const params = new URLSearchParams({
    level: "ad",
    fields,
    time_range: JSON.stringify({ since, until }),
    time_increment: "7", // wekelijkse buckets
    limit: "500",
    access_token: token,
  });

  const url = `${GRAPH}/${version}/${accountId}/insights?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Meta API ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { data: MetaInsightRow[] };
  return json.data;
}

// TODO(live): combineer alle accounts, map naar project (parks.ts), reken CPL
// uit op basis van de juiste action_type (lead), en geef AdPerformance[] terug.
export async function fetchAdPerformance(): Promise<AdPerformance[]> {
  void fetchAccountInsights;
  throw new Error("meta.fetchAdPerformance nog niet geïmplementeerd.");
}
