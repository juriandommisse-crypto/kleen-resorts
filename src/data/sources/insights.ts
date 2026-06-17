// Slimme wekelijkse samenvatting via Claude.
//
// STATUS: stub-vriendelijk. Als er geen ANTHROPIC_API_KEY is, geven we null
// terug en toont het dashboard de cijfers zonder duiding. Met key schrijft
// Claude een korte, zakelijke samenvatting van wat er deze week opvalt.

import Anthropic from "@anthropic-ai/sdk";
import type { DashboardData, WeeklyInsight } from "@/lib/types";

const SYSTEM_PROMPT = `Je bent een marketing-analist voor Kleen Resorts, een aanbieder van recreatiewoningen.
Je krijgt wekelijkse cijfers over leads en advertentie-uitgaven per project en per advertentie.
Schrijf een korte, zakelijke duiding in het Nederlands: wat valt op, wat loopt goed, waar moet aandacht naartoe.
Wees concreet met getallen en projectnamen. Geen disclaimers, geen herhaling van alle ruwe cijfers.`;

export async function generateInsight(
  data: Omit<DashboardData, "insight">,
): Promise<WeeklyInsight | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const client = new Anthropic({ apiKey });

  // Compacte samenvatting van de data als input (niet de volledige dataset).
  const payload = {
    currentWeek: data.currentWeek,
    weeklyLeads: data.weeklyLeads,
    weeklySpend: data.weeklySpend,
    topAds: [...data.adPerformance]
      .filter((a) => a.week === data.currentWeek)
      .sort((a, b) => a.cpl - b.cpl)
      .slice(0, 10),
  };

  const msg = await client.messages.create({
    model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          `Hier zijn de cijfers (JSON). Geef een kop (max 8 woorden) en 3-5 bullets.\n` +
          `Antwoord als JSON: {"headline": string, "bullets": string[]}.\n\n` +
          JSON.stringify(payload),
      },
    ],
  });

  const text = msg.content.find((c) => c.type === "text")?.text ?? "{}";
  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    return {
      week: data.currentWeek,
      headline: parsed.headline ?? "Wekelijkse samenvatting",
      bullets: Array.isArray(parsed.bullets) ? parsed.bullets : [],
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return {
      week: data.currentWeek,
      headline: "Wekelijkse samenvatting",
      bullets: [text],
      generatedAt: new Date().toISOString(),
    };
  }
}
