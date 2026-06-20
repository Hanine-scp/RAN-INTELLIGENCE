"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useAppContext } from "@/components/app-provider";
import { columnLabel } from "@/lib/i18n";
import { CHART_AXIS, CHART_GRID, CHART_LINE, CHART_PRIMARY, CHART_SECONDARY, BRAND } from "@/lib/chart-theme";
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

function ChartSizer({
  height,
  children,
  className = "",
}: {
  height: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`w-full min-w-[320px] ${className}`}
      style={{ height: `${height}px`, minHeight: `${height}px`, width: "100%" }}
    >
      {children}
    </div>
  );
}

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
      <ChartSizer height={height}>{children}</ChartSizer>
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

const SPLIT_LEFT_SUFFIX = "__axis_primary";
const SPLIT_RIGHT_SUFFIX = "__axis_detail";
const SPLIT_AXIS_RATIO = 4;

type ResolvedBar = {
  key: string;
  color: string;
  yAxisId: "left" | "right";
  sourceKey: string;
  axisLabel?: string;
};

function positiveValues(data: Record<string, unknown>[], key: string) {
  return data.map((row) => Number(row[key] ?? 0)).filter((value) => value > 0);
}

function shouldSplitAxis(data: Record<string, unknown>[], key: string, ratio = SPLIT_AXIS_RATIO) {
  const values = positiveValues(data, key);
  if (values.length < 2) return false;
  const max = Math.max(...values);
  const min = Math.min(...values);
  return max / min >= ratio;
}

function splitMetricAcrossAxes(
  data: Record<string, unknown>[],
  metricKey: string,
  ratio = SPLIT_AXIS_RATIO,
) {
  if (!shouldSplitAxis(data, metricKey, ratio)) {
    return null;
  }

  const max = Math.max(...positiveValues(data, metricKey));
  const threshold = max / 8;
  const leftKey = `${metricKey}${SPLIT_LEFT_SUFFIX}`;
  const rightKey = `${metricKey}${SPLIT_RIGHT_SUFFIX}`;

  const chartData = data.map((row) => {
    const value = Number(row[metricKey] ?? 0);
    return {
      ...row,
      [leftKey]: value >= threshold ? value : null,
      [rightKey]: value > 0 && value < threshold ? value : null,
    };
  });

  return { chartData, leftKey, rightKey, metricKey, threshold };
}

export function SummaryLineChart({
  data,
  xKey,
  yKey,
  yKeySecondary,
  height = 240,
  framed = true,
  autoDualAxis = true,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  yKeySecondary?: string;
  height?: number;
  framed?: boolean;
  autoDualAxis?: boolean;
}) {
  const { filters } = useAppContext();
  const ready = useClientReady();

  const lineSeries = useMemo(() => {
    const series = [{ key: yKey, color: CHART_LINE, yAxisId: "left" as const }];
    if (!yKeySecondary) return series;

    if (!autoDualAxis) {
      return [
        { key: yKey, color: CHART_LINE, yAxisId: "left" as const },
        { key: yKeySecondary, color: CHART_SECONDARY, yAxisId: "right" as const },
      ];
    }

    const leftMax = data.reduce((acc, row) => Math.max(acc, Math.abs(Number(row[yKey] ?? 0))), 0);
    const rightMax = data.reduce((acc, row) => Math.max(acc, Math.abs(Number(row[yKeySecondary] ?? 0))), 0);
    const low = Math.min(leftMax, rightMax);
    const high = Math.max(leftMax, rightMax);
    const useDualAxis = leftMax > 0 && rightMax > 0 && high / Math.max(low, 1) >= SPLIT_AXIS_RATIO;

    return [
      { key: yKey, color: CHART_LINE, yAxisId: "left" as const },
      { key: yKeySecondary, color: CHART_SECONDARY, yAxisId: useDualAxis ? ("right" as const) : ("left" as const) },
    ];
  }, [autoDualAxis, data, yKey, yKeySecondary]);

  const hasRightAxis = lineSeries.some((line) => line.yAxisId === "right");

  if (!ready) {
    return framed ? <ChartFrame height={height} /> : <div style={{ height }} />;
  }

  const chartContent = (
    <ResponsiveContainer width="100%" height={height} minWidth={320}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
        <XAxis dataKey={xKey} tick={{ fill: CHART_AXIS, fontSize: 11 }} axisLine={{ stroke: BRAND.border }} />
        <YAxis yAxisId="left" tick={{ fill: CHART_AXIS, fontSize: 11 }} axisLine={{ stroke: BRAND.border }} />
        {hasRightAxis ? (
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: CHART_SECONDARY, fontSize: 11 }}
            axisLine={{ stroke: BRAND.sage }}
            tickLine={{ stroke: BRAND.sage }}
            allowDecimals={false}
          />
        ) : null}
        <Tooltip
          cursor={{ stroke: "#f1f5f9" }}
          contentStyle={{ borderRadius: 12, border: `1px solid ${BRAND.border}`, boxShadow: "0 10px 25px rgba(36,52,71,0.08)" }}
          formatter={(value, name) => [String(value ?? ""), columnLabel(filters.language, String(name ?? ""))]}
          labelFormatter={(label) => String(label)}
        />
        {lineSeries.map((line) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            name={columnLabel(filters.language, line.key)}
            yAxisId={line.yAxisId}
            stroke={line.color}
            strokeWidth={2.5}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );

  if (!framed) {
    return <ChartSizer height={height}>{chartContent}</ChartSizer>;
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
  autoSplitAxis = true,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  bars: { key: string; color: string; yAxisId?: "left" | "right" }[];
  height?: number;
  framed?: boolean;
  onCategoryClick?: (point: Record<string, unknown>) => void;
  forceDualAxis?: boolean;
  autoSplitAxis?: boolean;
}) {
  const { filters } = useAppContext();
  const fr = filters.language === "Français";
  const ready = useClientReady();
  const [activeBarKey, setActiveBarKey] = useState<string | null>(null);

  const splitAxis = useMemo(() => {
    if (!autoSplitAxis || bars.length !== 1 || bars.some((bar) => bar.yAxisId)) {
      return null;
    }
    return splitMetricAcrossAxes(data, bars[0].key);
  }, [autoSplitAxis, bars, data]);

  const chartData = splitAxis?.chartData ?? data;

  const resolvedBars = useMemo((): ResolvedBar[] => {
    if (splitAxis) {
      return [
        {
          key: splitAxis.leftKey,
          color: bars[0].color,
          yAxisId: "left",
          sourceKey: splitAxis.metricKey,
          axisLabel: fr ? "Grandes valeurs" : "Large values",
        },
        {
          key: splitAxis.rightKey,
          color: CHART_SECONDARY,
          yAxisId: "right",
          sourceKey: splitAxis.metricKey,
          axisLabel: fr ? "Petites valeurs" : "Small values",
        },
      ];
    }

    if (!bars.length) return [];
    const hasExplicitAxis = bars.some((bar) => bar.yAxisId);
    if (hasExplicitAxis || bars.length < 2) {
      return bars.map((bar) => ({
        key: bar.key,
        color: bar.color,
        yAxisId: bar.yAxisId ?? "left",
        sourceKey: bar.key,
      }));
    }

    if (forceDualAxis) {
      return bars.map((bar, index) => ({
        key: bar.key,
        color: bar.color,
        yAxisId: index === 1 ? "right" : "left",
        sourceKey: bar.key,
      }));
    }

    const metricMax = bars.map((bar) => {
      const maxAbs = chartData.reduce((acc, row) => {
        const value = Number((row as Record<string, unknown>)[bar.key] ?? 0);
        const abs = Math.abs(value);
        return abs > acc ? abs : acc;
      }, 0);
      return { key: bar.key, maxAbs };
    });

    const nonZero = metricMax.filter((item) => item.maxAbs > 0).sort((a, b) => b.maxAbs - a.maxAbs);
    if (nonZero.length < 2) {
      return bars.map((bar) => ({ key: bar.key, color: bar.color, yAxisId: "left" as const, sourceKey: bar.key }));
    }

    const highest = nonZero[0].maxAbs;
    const lowest = nonZero[nonZero.length - 1].maxAbs;
    const shouldUseDualAxis = lowest > 0 && highest / lowest >= SPLIT_AXIS_RATIO;
    const rightAxisKey = nonZero[0].key;

    return bars.map((bar) => ({
      key: bar.key,
      color: bar.color,
      yAxisId: shouldUseDualAxis && bar.key === rightAxisKey ? ("right" as const) : ("left" as const),
      sourceKey: bar.key,
    }));
  }, [bars, chartData, forceDualAxis, fr, splitAxis]);
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
    <ResponsiveContainer width="100%" height={height} minWidth={320}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
        <XAxis dataKey={xKey} tick={{ fill: CHART_AXIS, fontSize: 11 }} axisLine={{ stroke: BRAND.border }} />
        <YAxis yAxisId="left" tick={{ fill: CHART_AXIS, fontSize: 11 }} axisLine={{ stroke: BRAND.border }} />
        {hasRightAxis ? (
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: CHART_SECONDARY, fontSize: 11 }}
            axisLine={{ stroke: BRAND.sage }}
            tickLine={{ stroke: BRAND.sage }}
            allowDecimals={false}
          />
        ) : null}
        <Tooltip
          cursor={{ fill: "#f8fafc" }}
          shared={false}
          labelFormatter={(label) => String(label)}
          contentStyle={{ borderRadius: 12, border: `1px solid ${BRAND.border}`, boxShadow: "0 10px 25px rgba(36,52,71,0.08)" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const item = payload[0];
            const dataKey = String(item?.dataKey ?? "");
            const point = (item?.payload ?? {}) as Record<string, unknown>;
            const activeBar = resolvedBars.find((bar) => bar.key === (activeBarKey || dataKey));
            const sourceKey = String(activeBar?.sourceKey ?? activeBarKey ?? dataKey);
            const metricLabel = columnLabel(filters.language, sourceKey);
            const selectedValue = point[sourceKey] ?? point[dataKey] ?? item?.value ?? 0;
            return (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-[0_10px_25px_rgba(15,23,42,0.08)]">
                <p className="mb-1 font-semibold text-slate-800">{String(label ?? "")}</p>
                <p className="text-slate-700">
                  <span className="font-semibold text-brand-accent">{metricLabel}:</span> {String(selectedValue)}
                </p>
                {splitAxis && activeBar?.axisLabel ? (
                  <p className="mt-1 text-[10px] font-medium text-slate-500">{activeBar.axisLabel}</p>
                ) : null}
                {sourceKey === "cells_4g" ? (
                  <div className="mt-1 space-y-0.5 text-slate-700">
                    <p>
                      <span className="font-semibold text-slate-800">{columnLabel(filters.language, "cells_4g_fdd")}:</span>{" "}
                      {String(point.cells_4g_fdd ?? 0)}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-800">{columnLabel(filters.language, "cells_4g_tdd")}:</span>{" "}
                      {String(point.cells_4g_tdd ?? 0)}
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
            name={bar.axisLabel ?? columnLabel(filters.language, bar.sourceKey)}
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
    return <ChartSizer height={height}>{chartContent}</ChartSizer>;
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
  const { filters } = useAppContext();
  const fr = filters.language === "Français";
  const ready = useClientReady();
  if (!ready) {
    return <ChartFrame height={height} />;
  }

  return (
    <ChartFrame height={height}>
      <ResponsiveContainer width="100%" height={height} minWidth={320}>
        <ScatterChart margin={{ top: 12, right: 16, bottom: 12, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
          <XAxis type="number" dataKey="x" name="PC1" tick={{ fill: CHART_AXIS, fontSize: 11 }} axisLine={{ stroke: "#cbd5e1" }} />
          <YAxis type="number" dataKey="y" name="PC2" tick={{ fill: CHART_AXIS, fontSize: 11 }} axisLine={{ stroke: "#cbd5e1" }} />
          <ZAxis type="number" range={[40, 40]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            contentStyle={{ borderRadius: 12, border: `1px solid ${BRAND.border}`, boxShadow: "0 10px 25px rgba(36,52,71,0.08)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = (payload[0]?.payload ?? {}) as Record<string, unknown>;
              return (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-[0_10px_25px_rgba(15,23,42,0.08)]">
                  <p className="font-semibold text-slate-800">
                    {fr ? "Site" : "Site"} {String(point.site_id ?? "")}
                  </p>
                  <p className="text-slate-600">
                    {columnLabel(filters.language, "health_score")}: {String(point.health_score ?? "")}
                  </p>
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
