// Slimme samenvatting via OpenAI — per granulariteit (week/maand/jaar).
//
// Belangrijk: het model krijgt UITSLUITEND de actieve verkoopparken en alleen
// de recente periodes (week → laatste weken, maand → laatste maanden, jaar →
// dit jaar). Zo blijft de duiding actueel en relevant. Model instelbaar via
// OPENAI_MODEL (standaard gpt-4o-mini). Zonder OPENAI_API_KEY → null.

import OpenAI from "openai";
import type { DashboardData, WeeklyInsight } from "@/lib/types";
import { ACTIVE_SALES_PROJECTS } from "@/lib/parks";
import {
  ALL_PROJECTS,
  availablePeriods,
  periodKeyOf,
  periodLabel,
  topAds,
  type Granularity,
} from "@/lib/aggregate";

type Base = Omit<DashboardData, "insights">;

const SYSTEM_PROMPT = `Je bent een senior performance-marketinganalist voor Kleen Resorts, dat recreatie-/vakantiewoningen verkoopt. Je schrijft een korte, scherpe management-duiding.

SCOPE (strikt):
- Analyseer UITSLUITEND de actieve verkoopparken: Greenerwold, Wiedeweer en Fryske Mar. Noem of bespreek geen enkel ander park — die zijn niet in de verkoop.
- Je krijgt alleen recente periodes. Focus op het heden en de trend; verwijs niet naar ver verleden.

KERNCIJFERS:
- Leads (volume) en kosten per lead (CPL) — CPL is de belangrijkste efficiëntiemaat.
- Ad spend, afspraken, en advertentieprestaties (leads, CPL, CTR, status zoals Leren/Actief).

LEVER:
- Een kop (max 8 woorden) en 3 tot 5 bullets.
- Elke bullet = één concreet inzicht MET duiding of actie — geen kale opsomming van cijfers. Gebruik echte getallen en parknamen.
- Benoem: de trend t.o.v. de vorige periode(s) (stijgt/daalt), welk park het efficiëntst is (laagste kosten per resultaat) versus het meeste volume, en de best én zwakst presterende advertentie bij naam.
- BELANGRIJK over aanbevelingen: de lezer heeft GEEN invloed op budget, opschalen of pauzeren van advertenties. Aanbevelingen richten zich op feedback aan het marketingbureau Booking Boosters — denk aan: andere visuals of advertentieteksten laten testen bij zwak presterende ads, of een succesvolle visual/insteek breder inzetten. Adviseer dus nooit "budget verhogen/verlagen" of "ad pauzeren".

STIJL:
- Nederlands, zakelijk, beknopt (max ~25 woorden per bullet). Geen disclaimers, geen herhaling van alle ruwe cijfers, geen algemeenheden.
- "CPL" = kosten per resultaat (Meta). Bij dunne of ontbrekende data: benoem dat kort i.p.v. te gissen.`;

const TIMEFRAME: Record<Granularity, string> = {
  week: "de afgelopen weken",
  month: "de afgelopen maanden",
  year: "dit jaar tot nu toe",
};

/** Recente periodesleutels voor een granulariteit (geen toekomst). */
function recentPeriodKeys(data: Base, g: Granularity, now: Date): string[] {
  const keys = availablePeriods(data as DashboardData, g, now);
  if (g === "year") {
    const y = String(now.getUTCFullYear());
    return keys.filter((k) => k === y);
  }
  const n = g === "week" ? 6 : 3;
  return keys.slice(-n);
}

/** Bouwt een compacte, gescopete payload (alleen actieve parken). */
function buildPayload(data: Base, g: Granularity, now: Date) {
  const periods = recentPeriodKeys(data, g, now);
  const periodSet = new Set(periods);

  const perPeriode = periods.map((pk) => {
    const perPark: Record<string, unknown> = {};
    for (const proj of ACTIVE_SALES_PROJECTS) {
      const leads = data.weeklyLeads
        .filter((l) => l.project === proj && periodKeyOf(l.week, g) === pk)
        .reduce((a, l) => a + l.leads, 0);
      const afspraken = data.weeklyLeads
        .filter((l) => l.project === proj && periodKeyOf(l.week, g) === pk)
        .reduce((a, l) => a + l.appointments, 0);
      const spend = data.weeklySpend
        .filter((s) => s.project === proj && periodKeyOf(s.week, g) === pk)
        .reduce((a, s) => a + s.spendEur, 0);
      perPark[proj] = {
        leads,
        afspraken,
        spendEur: Math.round(spend),
        cpl: leads ? Math.round(spend / leads) : null,
      };
    }
    return { periode: periodLabel(pk, g), perPark };
  });

  // Beste advertenties in de meest recente periode (alleen actieve parken).
  const latest = periods[periods.length - 1];
  const active = new Set<string>(ACTIVE_SALES_PROJECTS);
  const ads = latest
    ? topAds(data as DashboardData, ALL_PROJECTS, g, latest, { minLeads: 0, limit: 40 })
        .filter((a) => active.has(a.project))
        .slice(0, 8)
        .map((a) => ({
          ad: a.adName,
          park: a.project,
          leads: a.results,
          cpl: Math.round(a.cpl),
          spendEur: a.spendEur,
          ctrPct: +(a.ctr * 100).toFixed(1),
          status: a.status,
        }))
    : [];

  return {
    granulariteit: g,
    actieveParken: ACTIVE_SALES_PROJECTS,
    cijfersPerPeriode: perPeriode,
    besteAdvertentiesRecentstePeriode: ads,
  };
}

async function generateOne(
  client: OpenAI,
  model: string,
  data: Base,
  g: Granularity,
  now: Date,
): Promise<WeeklyInsight | null> {
  const payload = buildPayload(data, g, now);
  if (!payload.cijfersPerPeriode.length) return null;

  try {
    const res = await client.chat.completions.create({
      model,
      temperature: 0.4,
      max_tokens: 700,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `De cijfers gaan over ${TIMEFRAME[g]} (view: ${g}). ` +
            `Geef een kop (max 8 woorden) en 3-5 bullets. ` +
            `Antwoord als JSON: {"headline": string, "bullets": string[]}.\n\n` +
            JSON.stringify(payload),
        },
      ],
    });
    const text = res.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text) as { headline?: string; bullets?: unknown };
    return {
      week: data.currentWeek,
      headline: parsed.headline ?? "Samenvatting",
      bullets: Array.isArray(parsed.bullets) ? (parsed.bullets as string[]) : [],
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function generateInsights(data: Base): Promise<DashboardData["insights"]> {
  const empty = { week: null, month: null, year: null };
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return empty;

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const client = new OpenAI({ apiKey });
  const now = new Date();

  const [week, month, year] = await Promise.all([
    generateOne(client, model, data, "week", now),
    generateOne(client, model, data, "month", now),
    generateOne(client, model, data, "year", now),
  ]);
  return { week, month, year };
}
