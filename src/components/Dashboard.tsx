"use client";

import { useMemo, useState } from "react";
import type { DashboardData } from "@/lib/types";
import {
  ALL_PROJECTS,
  kpisForWeek,
  leadsByProject,
  spendByPlatform,
  topAds,
  weeklySeries,
} from "@/lib/aggregate";
import { delta, fmtEur, fmtNum, prettyWeek } from "@/lib/format";
import { KpiCard } from "./KpiCard";
import { TrendChart } from "./TrendChart";
import { SpendBreakdown } from "./SpendBreakdown";
import { TopAdsTable } from "./TopAdsTable";
import { InsightPanel } from "./InsightPanel";
import { LeadsRanking } from "./LeadsRanking";

export function Dashboard({ data }: { data: DashboardData }) {
  const [project, setProject] = useState<string>(ALL_PROJECTS);
  const week = data.currentWeek;

  const series = useMemo(() => weeklySeries(data, project), [data, project]);
  const kpis = useMemo(() => kpisForWeek(data, project, week), [data, project, week]);
  const prevWeek = series.at(-2);
  const platforms = useMemo(() => spendByPlatform(data, project, week), [data, project, week]);
  const ads = useMemo(() => topAds(data, project, week), [data, project, week]);
  const ranking = useMemo(() => leadsByProject(data, week), [data, week]);

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-brand">Kleen Resorts</p>
        <h1 className="text-2xl font-bold text-ink">Marketing Dashboard</h1>
        <p className="mt-1 text-sm text-muted">{prettyWeek(week)}</p>
      </header>

      {data.notice && (
        <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ⚠️ {data.notice}
        </div>
      )}

      <label className="mb-5 block">
        <span className="mb-1 block text-xs font-medium text-muted">Project</span>
        <select
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        >
          <option value={ALL_PROJECTS}>Alle projecten</option>
          {data.projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <KpiCard
          label="Leads"
          value={fmtNum(kpis.leads)}
          delta={prevWeek ? delta(kpis.leads, prevWeek.leads) : null}
          higherIsBetter
        />
        <KpiCard
          label="Ad spend"
          value={fmtEur(kpis.spend)}
          delta={prevWeek ? delta(kpis.spend, prevWeek.spend) : null}
          higherIsBetter={false}
        />
        <KpiCard
          label="Kosten / lead"
          value={kpis.cpl ? fmtEur(kpis.cpl) : "—"}
          delta={prevWeek && prevWeek.cpl ? delta(kpis.cpl, prevWeek.cpl) : null}
          higherIsBetter={false}
        />
        <KpiCard label="Afspraken" value={fmtNum(kpis.appointments)} hint="gepland deze week" />
      </div>

      <div className="space-y-5">
        <InsightPanel insight={data.insight} />
        <TrendChart data={series} />
        <SpendBreakdown rows={platforms} />
        <TopAdsTable ads={ads} />
        {project === ALL_PROJECTS && <LeadsRanking rows={ranking} />}
      </div>

      <footer className="mt-8 text-center text-xs text-muted">
        Laatst bijgewerkt {new Date(data.generatedAt).toLocaleString("nl-NL")} ·{" "}
        {process.env.NEXT_PUBLIC_DATA_SOURCE === "live" ? "live data" : "testdata"}
      </footer>
    </main>
  );
}
