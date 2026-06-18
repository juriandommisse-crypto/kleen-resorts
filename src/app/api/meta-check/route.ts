import { NextResponse } from "next/server";

// Tijdelijke diagnose voor de Meta-ad-cijfers (spend + lead-resultaten).
// Haalt per account de ad-insights over de laatste 30 dagen op (Meta's eigen
// totalen, zonder dag-opsplitsing) en toont per advertentie het bestede bedrag
// en de lead-gerelateerde actietypes met hun waarden, zodat we kunnen zien of
// onze spend/leads kloppen. De token komt NIET in de response.
// Verwijder deze route weer zodra de cijfers kloppen.

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com";

export async function GET() {
  const token = process.env.META_ACCESS_TOKEN;
  const version = process.env.META_API_VERSION ?? "v21.0";
  const ids = (process.env.META_AD_ACCOUNT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => (id.startsWith("act_") ? id : `act_${id}`));

  if (!token) {
    return NextResponse.json({ error: "META_ACCESS_TOKEN ontbreekt." }, { status: 400 });
  }

  interface Row {
    ad_name?: string;
    spend?: string;
    impressions?: string;
    clicks?: string;
    actions?: Array<{ action_type: string; value: string }>;
    cost_per_action_type?: Array<{ action_type: string; value: string }>;
  }

  const out: Record<string, unknown> = { dateRange: "last_30d" };

  for (const id of ids) {
    const fields = "ad_name,spend,impressions,clicks,actions,cost_per_action_type";
    const url =
      `${GRAPH}/${version}/${id}/insights?level=ad&date_preset=last_30d` +
      `&fields=${fields}&limit=300&access_token=${token}`;
    try {
      const res = await fetch(url);
      const json = (await res.json()) as { data?: Row[]; error?: unknown };
      if (!res.ok) {
        out[id] = { error: json.error ?? json };
        continue;
      }
      const rows = (json.data ?? [])
        .map((r) => ({
          ad: r.ad_name,
          spend: r.spend,
          impressions: r.impressions,
          clicks: r.clicks,
          leadActions: (r.actions ?? []).filter((a) => a.action_type.toLowerCase().includes("lead")),
          leadCosts: (r.cost_per_action_type ?? []).filter((a) =>
            a.action_type.toLowerCase().includes("lead"),
          ),
        }))
        .sort((a, b) => (parseFloat(b.spend ?? "0") || 0) - (parseFloat(a.spend ?? "0") || 0))
        .slice(0, 8);
      out[id] = { topAdsBySpend: rows };
    } catch (e) {
      out[id] = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  return NextResponse.json(out, { status: 200 });
}
