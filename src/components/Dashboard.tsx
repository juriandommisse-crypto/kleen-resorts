"use client";

import { useMemo, useState } from "react";
import type { DashboardData } from "@/lib/types";
import {
  ALL_PROJECTS,
  availablePeriods,
  kpisForPeriod,
  leadsByProject,
  periodLabel,
  periodRange,
  series,
  topAds,
  type Granularity,
} from "@/lib/aggregate";
import { delta, fmtDateNL, fmtEur, fmtNum } from "@/lib/format";
import { KpiCard } from "./KpiCard";
import { TrendChart } from "./TrendChart";
import { TopAdsTable } from "./TopAdsTable";
import { InsightPanel } from "./InsightPanel";
import { LeadsRanking } from "./LeadsRanking";

const GRANULARITIES: Array<{ value: Granularity; label: string }> = [
  { value: "week", label: "Week" },
  { value: "month", label: "Maand" },
  { value: "year", label: "Jaar" },
];

const TREND_TITLE: Record<Granularity, string> = {
  week: "Leads & ad spend per week",
  month: "Leads & ad spend per maand",
  year: "Leads & ad spend per jaar",
};

export function Dashboard({ data }: { data: DashboardData }) {
  const [project, setProject] = useState<string>(ALL_PROJECTS);
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [periodKey, setPeriodKey] = useState<string | null>(null);

  // Beschikbare periodes (oplopend); standaard de meest recente.
  const periods = useMemo(() => availablePeriods(data, granularity), [data, granularity]);
  const selected = periodKey && periods.includes(periodKey) ? periodKey : periods.at(-1) ?? "";
  const prevPeriod = periods[periods.indexOf(selected) - 1];

  const trend = useMemo(() => series(data, project, granularity), [data, project, granularity]);
  const kpis = useMemo(
    () => kpisForPeriod(data, project, granularity, selected),
    [data, project, granularity, selected],
  );
  const prevKpis = useMemo(
    () => (prevPeriod ? kpisForPeriod(data, project, granularity, prevPeriod) : null),
    [data, project, granularity, prevPeriod],
  );
  const ads = useMemo(
    () => topAds(data, project, granularity, selected),
    [data, project, granularity, selected],
  );
  const ranking = useMemo(
    () => leadsByProject(data, granularity, selected),
    [data, granularity, selected],
  );

  function changeGranularity(g: Granularity) {
    setGranularity(g);
    setPeriodKey(null); // val terug op meest recente periode
  }

  const periodPrefix = granularity === "week" ? "vorige week" : granularity === "month" ? "vorige maand" : "vorig jaar";

  const range = selected ? periodRange(selected, granularity) : null;
  const rangeLabel = range ? `${fmtDateNL(range.start)} – ${fmtDateNL(range.end)}` : "";

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6 lg:max-w-6xl">
      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-brand">Kleen Resorts</p>
        <h1 className="text-2xl font-bold text-ink">Marketing Dashboard</h1>
        <p className="mt-1 text-sm font-medium text-ink">{periodLabel(selected, granularity)}</p>
        {rangeLabel && <p className="text-xs text-muted">{rangeLabel}</p>}
      </header>

      {data.notice && (
        <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ⚠️ {data.notice}
        </div>
      )}

      {/* Periode-keuze: granulariteit (segmented) + specifieke periode */}
      <div className="mb-4 flex gap-2">
        <div className="inline-flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/5">
          {GRANULARITIES.map((gr) => (
            <button
              key={gr.value}
              onClick={() => changeGranularity(gr.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                granularity === gr.value ? "bg-brand text-white" : "text-muted hover:text-ink"
              }`}
            >
              {gr.label}
            </button>
          ))}
        </div>
        <select
          value={selected}
          onChange={(e) => setPeriodKey(e.target.value)}
          className="flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 lg:max-w-xs"
        >
          {[...periods].reverse().map((p) => (
            <option key={p} value={p}>
              {periodLabel(p, granularity)}
            </option>
          ))}
        </select>
      </div>

      <label className="mb-5 block">
        <span className="mb-1 block text-xs font-medium text-muted">Project</span>
        <select
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 lg:max-w-md"
        >
          <option value={ALL_PROJECTS}>Alle projecten</option>
          {data.projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Leads"
          value={fmtNum(kpis.leads)}
          delta={prevKpis ? delta(kpis.leads, prevKpis.leads) : null}
          higherIsBetter
          deltaLabel={`t.o.v. ${periodPrefix}`}
        />
        <KpiCard
          label="Ad spend"
          value={fmtEur(kpis.spend)}
          delta={prevKpis ? delta(kpis.spend, prevKpis.spend) : null}
          higherIsBetter={false}
          deltaLabel={`t.o.v. ${periodPrefix}`}
        />
        <KpiCard
          label="Kosten / lead"
          value={kpis.cpl ? fmtEur(kpis.cpl) : "—"}
          delta={prevKpis && prevKpis.cpl ? delta(kpis.cpl, prevKpis.cpl) : null}
          higherIsBetter={false}
          deltaLabel={`t.o.v. ${periodPrefix}`}
        />
        <KpiCard label="Afspraken" value={fmtNum(kpis.appointments)} hint="gepland in periode" />
      </div>

      {/* DOM-volgorde = mobiele volgorde: grafiek, projectranglijst, beste advertenties.
          Op desktop: grafiek + ranglijst naast elkaar, beste ads in volle breedte. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="lg:col-span-12">
          <InsightPanel insight={data.insights[granularity]} />
        </div>
        <div className={project === ALL_PROJECTS ? "lg:col-span-8" : "lg:col-span-12"}>
          <TrendChart data={trend} title={TREND_TITLE[granularity]} />
        </div>
        {project === ALL_PROJECTS && (
          <div className="lg:col-span-4">
            <LeadsRanking rows={ranking} />
          </div>
        )}
        <div className="lg:col-span-12">
          <TopAdsTable
            ads={ads}
            period={`${periodLabel(selected, granularity)}${rangeLabel ? ` (${rangeLabel})` : ""}`}
          />
        </div>
      </div>

      <footer className="mt-8 text-center text-xs text-muted">
        Laatst bijgewerkt {new Date(data.generatedAt).toLocaleString("nl-NL")} ·{" "}
        {data.source === "live" ? "live data" : "testdata"}
      </footer>
    </main>
  );
}
