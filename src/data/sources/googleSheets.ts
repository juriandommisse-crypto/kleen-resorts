// Google Sheets databron (Leads + Ad Spend).
//
// STATUS: stub. De structuur van beide sheets is al in kaart gebracht
// (zie docs/ARCHITECTURE.md). Zodra het service-account is gedeeld vullen we
// hier de echte uitlezing + parsing in. Tot die tijd valt index.ts terug op mock.

import { GoogleAuth } from "google-auth-library";
import type { WeeklyLeads, WeeklySpend } from "@/lib/types";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

function getAuth(): GoogleAuth {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error("Google service-account ontbreekt (zie .env.example).");
  }
  return new GoogleAuth({
    credentials: { client_email: email, private_key: key },
    scopes: [SHEETS_SCOPE],
  });
}

/** Haalt waarden op uit een sheet-bereik via de Sheets REST API. */
async function readRange(spreadsheetId: string, range: string): Promise<string[][]> {
  const auth = getAuth();
  const client = await auth.getClient();
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/` +
    `${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;
  const res = await client.request<{ values?: string[][] }>({ url });
  return res.data.values ?? [];
}

// TODO(live): map de Leads-aggregatietabellen (per park, WeekKey) naar WeeklyLeads.
export async function fetchWeeklyLeads(): Promise<WeeklyLeads[]> {
  void readRange; // wordt in de live-implementatie gebruikt
  throw new Error("googleSheets.fetchWeeklyLeads nog niet geïmplementeerd.");
}

// TODO(live): map de Ad Spend-tabellen (parseSheetAmount) naar WeeklySpend.
export async function fetchWeeklySpend(): Promise<WeeklySpend[]> {
  throw new Error("googleSheets.fetchWeeklySpend nog niet geïmplementeerd.");
}
