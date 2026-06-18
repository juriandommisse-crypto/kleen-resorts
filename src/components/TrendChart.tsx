"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeriesPoint } from "@/lib/aggregate";
import { fmtEur, fmtNum } from "@/lib/format";

export function TrendChart({ data, title }: { data: SeriesPoint[]; title: string }) {
  return (
    <div className="flex h-full flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <h2 className="mb-3 text-sm font-semibold text-ink">{title}</h2>
      <div className="min-h-[16rem] w-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value: number, name) =>
                name === "spend" ? [fmtEur(value), "Spend"] : [fmtNum(value), "Leads"]
              }
            />
            <Bar yAxisId="right" dataKey="spend" fill="#cfe6dc" radius={[4, 4, 0, 0]} name="spend" />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="leads"
              stroke="#1f7a5a"
              strokeWidth={2.5}
              dot={false}
              name="leads"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
