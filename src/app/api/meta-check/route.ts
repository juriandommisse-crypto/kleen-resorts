import { NextResponse } from "next/server";

// Tijdelijke diagnose voor de Meta-koppeling. Gebruikt de META_ACCESS_TOKEN uit
// de omgeving en rapporteert per account wat er misgaat. De token zelf komt
// NIET in de response — alleen identiteit, scopes, accountnamen en foutteksten.
// Verwijder deze route weer zodra de koppeling werkt.

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
    return NextResponse.json({ error: "META_ACCESS_TOKEN ontbreekt in de omgeving." }, { status: 400 });
  }

  const sep = (p: string) => (p.includes("?") ? "&" : "?");
  async function g(path: string) {
    try {
      const res = await fetch(`${GRAPH}/${version}/${path}${sep(path)}access_token=${token}`);
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body };
    } catch (e) {
      return { status: 0, body: { error: e instanceof Error ? e.message : String(e) } };
    }
  }

  const out: Record<string, unknown> = {};
  out.configuredAdAccountIds = ids;
  out.me = await g("me?fields=id,name");

  const debug = await g(`debug_token?input_token=${token}`);
  const d = (debug.body as { data?: { scopes?: string[]; type?: string; app_id?: string; is_valid?: boolean } }).data;
  out.token = d
    ? { type: d.type, app_id: d.app_id, is_valid: d.is_valid, scopes: d.scopes }
    : debug.body;

  out.accessibleAdAccounts = await g("me/adaccounts?fields=name,account_status,id&limit=200");

  const perAccount: Record<string, unknown> = {};
  for (const id of ids) {
    const r = await g(`${id}/insights?fields=spend&date_preset=last_30d&limit=1`);
    perAccount[id] =
      r.status === 200
        ? { ok: true }
        : { ok: false, status: r.status, error: (r.body as { error?: unknown }).error ?? r.body };
  }
  out.perAccountInsightsTest = perAccount;

  return NextResponse.json(out, { status: 200 });
}
