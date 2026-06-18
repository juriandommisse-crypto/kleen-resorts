import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDashboardData } from "@/data";

// Wekelijkse refresh-endpoint, aangeroepen door Vercel Cron (zie vercel.json).
// Beschermd met CRON_SECRET zodat alleen de cron dit kan triggeren.
//
// Nu haalt de homepage data live op bij elke load (force-dynamic). Zodra de
// live-bronnen + AI-samenvatting duurder worden, cachen we het resultaat hier
// (bv. in Vercel KV/Blob) en leest de homepage uit die cache.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const data = await getDashboardData();
    // Ververs de gecachte homepage zodat de dagelijkse sheet-update meteen zichtbaar is.
    revalidatePath("/");
    return NextResponse.json({
      ok: true,
      refreshedAt: data.generatedAt,
      currentWeek: data.currentWeek,
      projects: data.projects.length,
      hasInsight: Boolean(data.insights.week || data.insights.month || data.insights.year),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
