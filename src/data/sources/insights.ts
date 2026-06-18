// Slimme wekelijkse samenvatting via OpenAI.
//
// Als er geen OPENAI_API_KEY is, geven we null terug en toont het dashboard de
// cijfers zonder duiding. Met key schrijft het model een korte, zakelijke
// samenvatting van wat er deze periode opvalt. Model instelbaar via OPENAI_MODEL
// (standaard gpt-4o-mini: beste prijs/kwaliteit voor deze taak).

import OpenAI from "openai";
import type { DashboardData, WeeklyInsight } from "@/lib/types";

const SYSTEM_PROMPT = `Je bent een marketing-analist voor Kleen Resorts, een aanbieder van recreatiewoningen.
Je krijgt cijfers over leads en advertentie-uitgaven per project en per advertentie.
Schrijf een korte, zakelijke duiding in het Nederlands: wat valt op, wat loopt goed, waar moet aandacht naartoe.
Wees concreet met getallen en projectnamen. Geen disclaimers, geen herhaling van alle ruwe cijfers.`;

export async function generateInsight(
  data: Omit<DashboardData, "insight">,
): Promise<WeeklyInsight | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const client = new OpenAI({ apiKey });

  // Compacte samenvatting van de data als input (niet de volledige dataset).
  const payload = {
    currentWeek: data.currentWeek,
    weeklyLeads: data.weeklyLeads,
    weeklySpend: data.weeklySpend,
    topAds: [...data.adPerformance]
      .filter((a) => a.week === data.currentWeek)
      .sort((a, b) => b.results - a.results)
      .slice(0, 10),
  };

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
            `Hier zijn de cijfers (JSON). Geef een kop (max 8 woorden) en 3-5 bullets.\n` +
            `Antwoord als JSON: {"headline": string, "bullets": string[]}.\n\n` +
            JSON.stringify(payload),
        },
      ],
    });

    const text = res.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text) as { headline?: string; bullets?: unknown };
    return {
      week: data.currentWeek,
      headline: parsed.headline ?? "Wekelijkse samenvatting",
      bullets: Array.isArray(parsed.bullets) ? (parsed.bullets as string[]) : [],
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
