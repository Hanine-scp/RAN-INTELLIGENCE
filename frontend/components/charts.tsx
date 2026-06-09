"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

function ChartFrame({
  children,
  height = 240,
  className = "",
}: {
  children?: React.ReactNode;
  height?: number;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)] ${className}`}>
      <div className="w-full" style={{ height: `${height}px`, minHeight: `${height}px` }}>
        {children}
      </div>
    </div>
  );
}

function useClientReady() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function SummaryLineChart({
  data,
  xKey,
  yKey,
  height = 240,
  framed = true,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  height?: number;
  framed?: boolean;
}) {
  const ready = useClientReady();
  if (!ready) {
    return framed ? <ChartFrame height={height} /> : <div style={{ height }} />;
  }

  const chartContent = (
    <ResponsiveContainer width="100%" height="100%" minWidth={320}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey={xKey} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={{ stroke: "#cbd5e1" }} />
        <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={{ stroke: "#cbd5e1" }} />
        <Tooltip
          cursor={{ stroke: "#f1f5f9" }}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 10px 25px rgba(15,23,42,0.08)" }}
        />
        <Line type="monotone" dataKey={yKey} stroke="#dc2626" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );

  if (!framed) {
    return <div style={{ height }}>{chartContent}</div>;
  }

  return (
    <ChartFrame height={height}>
      {chartContent}
    </ChartFrame>
  );
}

export function MultiBarChart({
  data,
  xKey,
  bars,
  height = 240,
  framed = true,
  onCategoryClick,
  forceDualAxis = false,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  bars: { key: string; color: string; yAxisId?: "left" | "right" }[];
  height?: number;
  framed?: boolean;
  onCategoryClick?: (point: Record<string, unknown>) => void;
  forceDualAxis?: boolean;
}) {
  const ready = useClientReady();
  const [activeBarKey, setActiveBarKey] = useState<string | null>(null);
  const resolvedBars = useMemo(() => {
    if (!bars.length) return bars;
    const hasExplicitAxis = bars.some((bar) => bar.yAxisId);
    if (hasExplicitAxis || bars.length < 2) {
      return bars.map((bar) => ({ ...bar, yAxisId: bar.yAxisId ?? "left" }));
    }

    if (forceDualAxis) {
      return bars.map((bar, index) => ({
        ...bar,
        yAxisId: index === 1 ? ("right" as const) : ("left" as const),
      }));
    }

    const metricMax = bars.map((bar) => {
      const maxAbs = data.reduce((acc, row) => {
        const value = Number((row as Record<string, unknown>)[bar.key] ?? 0);
        const abs = Math.abs(value);
        return abs > acc ? abs : acc;
      }, 0);
      return { key: bar.key, maxAbs };
    });

    const nonZero = metricMax.filter((item) => item.maxAbs > 0).sort((a, b) => b.maxAbs - a.maxAbs);
    if (nonZero.length < 2) {
      return bars.map((bar) => ({ ...bar, yAxisId: "left" as const }));
    }

    const highest = nonZero[0].maxAbs;
    const lowest = nonZero[nonZero.length - 1].maxAbs;
    const shouldSplitAxis = lowest > 0 && highest / lowest >= 4;
    const rightAxisKey = nonZero[0].key;

    return bars.map((bar) => ({
      ...bar,
      yAxisId: shouldSplitAxis && bar.key === rightAxisKey ? ("right" as const) : ("left" as const),
    }));
  }, [bars, data, forceDualAxis]);
  const visibleBars = useMemo(
    () => (activeBarKey ? resolvedBars.filter((bar) => bar.key === activeBarKey) : resolvedBars),
    [resolvedBars, activeBarKey],
  );
  const hasRightAxis = useMemo(
    () => visibleBars.some((bar) => bar.yAxisId === "right"),
    [visibleBars],
  );
  if (!ready) {
    return framed ? <ChartFrame height={height} /> : <div style={{ height }} />;
  }

  const chartContent = (
    <ResponsiveContainer width="100%" height="100%" minWidth={320}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey={xKey} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={{ stroke: "#cbd5e1" }} />
        <YAxis yAxisId="left" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={{ stroke: "#cbd5e1" }} />
        {hasRightAxis ? (
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: "#b91c1c", fontSize: 11 }}
            axisLine={{ stroke: "#fecaca" }}
            tickLine={{ stroke: "#fecaca" }}
            allowDecimals={false}
          />
        ) : null}
        <Tooltip
          cursor={{ fill: "#f8fafc" }}
          shared={false}
          labelFormatter={(label) => String(label)}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 10px 25px rgba(15,23,42,0.08)" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const item = payload[0];
            const dataKey = String(item?.dataKey ?? "");
            const point = (item?.payload ?? {}) as Record<string, unknown>;
            const selected = activeBarKey || dataKey;
            const selectedValue = point[selected];
            return (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-[0_10px_25px_rgba(15,23,42,0.08)]">
                <p className="mb-1 font-semibold text-slate-800">{String(label ?? "")}</p>
                <p className="text-slate-700">
                  <span className="font-semibold text-red-600">{selected}:</span> {String(selectedValue ?? item?.value ?? 0)}
                </p>
                {selected === "cells_4g" ? (
                  <div className="mt-1 space-y-0.5 text-slate-700">
                    <p>
                      <span className="font-semibold text-slate-800">cells_4g_fdd:</span> {String(point.cells_4g_fdd ?? 0)}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-800">cells_4g_tdd:</span> {String(point.cells_4g_tdd ?? 0)}
                    </p>
                  </div>
                ) : null}
              </div>
            );
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: "#64748b", cursor: "pointer" }}
          onClick={(entry) =>
            setActiveBarKey((prev) => (prev === String(entry?.dataKey ?? "") ? null : String(entry?.dataKey ?? "")))
          }
        />
        {visibleBars.map((bar) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            yAxisId={bar.yAxisId ?? "left"}
            fill={bar.color}
            radius={[6, 6, 0, 0]}
            onClick={(state) => {
              setActiveBarKey((prev) => (prev === bar.key ? null : bar.key));
              const payload = (state?.payload ?? {}) as Record<string, unknown>;
              onCategoryClick?.(payload);
            }}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );

  if (!framed) {
    return <div style={{ height }}>{chartContent}</div>;
  }

  return (
    <ChartFrame height={height}>
      {chartContent}
    </ChartFrame>
  );
}

export function ClusterScatter({
  series,
  height = 360,
}: {
  series: { name: string; color: string; points: { x: number; y: number; site_id?: string; health_score?: number }[] }[];
  height?: number;
}) {
  const ready = useClientReady();
  if (!ready) {
    return <ChartFrame height={height} />;
  }

  return (
    <ChartFrame height={height}>
      <ResponsiveContainer width="100%" height="100%" minWidth={320}>
        <ScatterChart margin={{ top: 12, right: 16, bottom: 12, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis type="number" dataKey="x" name="PC1" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={{ stroke: "#cbd5e1" }} />
          <YAxis type="number" dataKey="y" name="PC2" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={{ stroke: "#cbd5e1" }} />
          <ZAxis type="number" range={[40, 40]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 10px 25px rgba(15,23,42,0.08)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = (payload[0]?.payload ?? {}) as Record<string, unknown>;
              return (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-[0_10px_25px_rgba(15,23,42,0.08)]">
                  <p className="font-semibold text-slate-800">Site {String(point.site_id ?? "")}</p>
                  <p className="text-slate-600">Health: {String(point.health_score ?? "")}</p>
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "#64748b" }} />
          {series.map((s) => (
            <Scatter key={s.name} name={s.name} data={s.points} fill={s.color} fillOpacity={0.7} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
