// Google Sheets databron (Leads + Ad Spend).
//
// Leest met het service-account (read-only). De wekelijkse leads per project
// worden berekend uit de RUWE lead-data (tabblad met DealID/Park/WeekKey), niet
// uit de dropdown-afhankelijke overzichtstabbladen — dat is betrouwbaarder en
// werkt voor alle projecten tegelijk.

import { GoogleAuth } from "google-auth-library";
import type { WeeklyLeads, WeeklySpend } from "@/lib/types";
import { normalizeProject } from "@/lib/parks";
import { isoWeekStart } from "@/lib/format";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
}

/**
 * Normaliseert de private key zodat hij werkt ongeacht hoe hij geplakt is:
 * - verwijdert omringende aanhalingstekens (veelgemaakte fout in Vercel)
 * - zet letterlijke \n (en \r\n) om naar echte regeleinden
 * - laat een al correct meerregelige PEM ongemoeid
 */
function normalizePrivateKey(raw: string): string {
  let k = raw.trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1);
  }
  k = k.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n/g, "\n");
  return k.trim() + "\n";
}

function getAuth(): GoogleAuth {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error("Google service-account ontbreekt (zie .env.example).");
  }
  const key = normalizePrivateKey(rawKey);
  if (!key.includes("BEGIN PRIVATE KEY")) {
    throw new Error(
      "GOOGLE_PRIVATE_KEY lijkt onvolledig: verwacht een PEM met '-----BEGIN PRIVATE KEY-----'.",
    );
  }
  return new GoogleAuth({
    credentials: { client_email: email, private_key: key },
    scopes: [SHEETS_SCOPE],
  });
}

async function api<T>(url: string): Promise<T> {
  const client = await getAuth().getClient();
  const res = await client.request<T>({ url });
  return res.data;
}

/** Tabblad-titels van een spreadsheet. */
async function listTabs(spreadsheetId: string): Promise<string[]> {
  const data = await api<{ sheets?: Array<{ properties?: { title?: string } }> }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
  );
  return (data.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean);
}

/** Waarden van één bereik. */
async function readRange(spreadsheetId: string, range: string): Promise<string[][]> {
  const data = await api<{ values?: string[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/` +
      `${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,
  );
  return data.values ?? [];
}

/** Eerste rijen van meerdere bereiken in één call (om headers te vinden). */
async function readHeaders(spreadsheetId: string, tabs: string[]): Promise<Map<string, string[]>> {
  const ranges = tabs.map((t) => `ranges=${encodeURIComponent(`${t}!1:1`)}`).join("&");
  const data = await api<{ valueRanges?: Array<{ values?: string[][] }> }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${ranges}`,
  );
  const out = new Map<string, string[]>();
  (data.valueRanges ?? []).forEach((vr, i) => out.set(tabs[i], (vr.values?.[0] ?? []).map(String)));
  return out;
}

function headerIndex(header: string[], ...needles: string[]): number {
  return header.findIndex((h) => {
    const low = h.toLowerCase().trim();
    return needles.some((n) => low === n.toLowerCase() || low.includes(n.toLowerCase()));
  });
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export async function fetchWeeklyLeads(): Promise<WeeklyLeads[]> {
  const sheetId = process.env.SHEET_ID_LEADS;
  if (!sheetId) throw new Error("SHEET_ID_LEADS ontbreekt.");

  const tabs = await listTabs(sheetId);
  const headers = await readHeaders(sheetId, tabs);

  // Vind het ruwe lead-tabblad: bevat zowel "DealID"/"Deal" als "WeekKey".
  let rawTab: string | undefined;
  let header: string[] = [];
  for (const [tab, hdr] of headers) {
    const hasDeal = headerIndex(hdr, "dealid", "deal id", "deal") >= 0;
    const hasWeek = headerIndex(hdr, "weekkey", "week key") >= 0;
    const hasPark = headerIndex(hdr, "park") >= 0;
    if (hasDeal && hasWeek && hasPark) {
      rawTab = tab;
      header = hdr;
      break;
    }
  }
  if (!rawTab) {
    throw new Error(
      `Geen ruw lead-tabblad gevonden (met DealID/Park/WeekKey). Tabbladen: ${tabs.join(", ")}`,
    );
  }

  const iPark = headerIndex(header, "park");
  const iStatus = headerIndex(header, "status");
  const iWeek = headerIndex(header, "weekkey", "week key");
  const iContact = headerIndex(header, "in contact");
  const iAppt = headerIndex(header, "afspraak gepland", "afspraak");

  const rows = await readRange(sheetId, `${rawTab}!A2:Z100000`);

  // Aggregeer per (week, project).
  type Acc = { leads: number; inContact: number; appointments: number; lost: number };
  const map = new Map<string, Acc>();
  for (const row of rows) {
    const week = (row[iWeek] ?? "").trim();
    if (!/^\d{4}-W\d{2}$/.test(week)) continue; // sla lege/foutieve rijen over
    const project = normalizeProject(row[iPark]);
    const key = `${week}__${project}`;
    const acc = map.get(key) ?? { leads: 0, inContact: 0, appointments: 0, lost: 0 };
    acc.leads += 1;
    if (iContact >= 0 && (row[iContact] ?? "").trim()) acc.inContact += 1;
    if (iAppt >= 0 && (row[iAppt] ?? "").trim()) acc.appointments += 1;
    if (iStatus >= 0 && (row[iStatus] ?? "").trim().toLowerCase() === "lost") acc.lost += 1;
    map.set(key, acc);
  }

  return [...map.entries()].map(([key, acc]) => {
    const [week, project] = key.split("__");
    return { week, weekStart: isoWeekStart(week), project, ...acc };
  });
}

// ---------------------------------------------------------------------------
// Ad spend (maandelijks in de sheet).
//
// In fase 1 komt wekelijkse spend uit de Meta API; Google/LinkedIn-spend uit de
// sheet is maandelijks en volgt in fase 2. Daarom hier nog niet geïmplementeerd.
// ---------------------------------------------------------------------------

export async function fetchWeeklySpend(): Promise<WeeklySpend[]> {
  // TODO(fase 2): lees de maandtabel "Spend Google/META/LinkedIn" per park en
  // verdeel naar weken, of toon spend op maandbasis naast de Meta-weekspend.
  return [];
}
