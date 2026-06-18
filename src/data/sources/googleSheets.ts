// Google Sheets databron (Leads + Ad Spend).
//
// Leest met het service-account (read-only). De wekelijkse leads per project
// worden berekend uit de RUWE lead-data (tabblad met DealID/Park/WeekKey), niet
// uit de dropdown-afhankelijke overzichtstabbladen — dat is betrouwbaarder en
// werkt voor alle projecten tegelijk.

import { GoogleAuth } from "google-auth-library";
import type { Platform, WeeklyLeads, WeeklySpend } from "@/lib/types";
import { normalizeProject } from "@/lib/parks";
import { isoWeekStart, isoWeekKey } from "@/lib/format";
import { parseSheetAmount } from "@/lib/currency";

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
// Ad spend
//
// Bron: de Ad Spend-sheet bevat een maandtabel per park × platform met de
// kolommen "Maand · Park · Spend Google · Spend META · Spend LinkedIn". Die
// spend is maandelijks; we verdelen elke maand gelijk over de ISO-weken waarvan
// de maandag in die maand valt. Daardoor kloppen de maand- en jaartotalen exact,
// en is de weekweergave een nette schatting (maand ÷ aantal weken).
// ---------------------------------------------------------------------------

/** "2026-4" / "2026-04" -> "2026-04"; anders null (bv. "Totaal"). */
function normalizeMonth(raw: string): string | null {
  const m = raw.trim().match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}`;
}

/** ISO-weken waarvan de maandag in de gegeven maand ("YYYY-MM") valt. */
function weeksInMonth(monthKey: string): string[] {
  const [y, m] = monthKey.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const weeks = new Set<string>();
  for (let d = 1; d <= lastDay; d++) {
    const ds = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const wk = isoWeekKey(ds);
    if (wk && isoWeekStart(wk).slice(0, 7) === monthKey) weeks.add(wk);
  }
  return [...weeks];
}

export async function fetchWeeklySpend(): Promise<WeeklySpend[]> {
  const sheetId = process.env.SHEET_ID_AD_SPEND;
  if (!sheetId) throw new Error("SHEET_ID_AD_SPEND ontbreekt.");

  const tabs = await listTabs(sheetId);

  for (const tab of tabs) {
    const rows = await readRange(sheetId, `${tab}!A1:Z2000`);

    // Zoek de headerrij van de per-platform spendtabel (waar dan ook in het tab).
    const hi = rows.findIndex(
      (r) => r.some((c) => /spend\s*meta/i.test(c)) && r.some((c) => /maand|month/i.test(c)),
    );
    if (hi < 0) continue;

    const header = rows[hi].map((x) => String(x));
    const find = (re: RegExp) => header.findIndex((h) => re.test(h));
    const iMonth = find(/maand|month/i);
    const iPark = find(/park/i);
    const cols: Array<[number, Platform]> = [
      [find(/spend\s*google/i), "google"],
      [find(/spend\s*meta/i), "meta"],
      [find(/spend\s*linkedin/i), "linkedin"],
    ];

    const out: WeeklySpend[] = [];
    for (let r = hi + 1; r < rows.length; r++) {
      const row = rows[r] ?? [];
      const rawMonth = (row[iMonth] ?? "").trim();
      const parkRaw = (row[iPark] ?? "").trim();
      if (!rawMonth && !parkRaw) break; // lege scheidingsrij = einde tabel
      if (/totaal|total/i.test(parkRaw)) continue;

      const month = normalizeMonth(rawMonth);
      if (!month) continue;
      const project = normalizeProject(parkRaw);
      const weeks = weeksInMonth(month);
      if (!weeks.length) continue;

      for (const [idx, platform] of cols) {
        if (idx < 0) continue;
        const amount = parseSheetAmount(row[idx]);
        if (amount <= 0) continue;
        const per = amount / weeks.length;
        for (const w of weeks) out.push({ week: w, project, platform, spendEur: per });
      }
    }

    if (out.length) return out;
  }

  throw new Error(
    `Geen 'Spend per platform'-tabel gevonden in Ad Spend (tabbladen: ${tabs.join(", ")}).`,
  );
}
