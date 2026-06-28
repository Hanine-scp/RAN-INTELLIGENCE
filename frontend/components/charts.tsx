"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useAppContext } from "@/components/app-provider";
import { columnLabel } from "@/lib/i18n";
import {
  BRAND,
  CHART_AXIS,
  CHART_GRID,
  CHART_LINE,
  CHART_PALETTE,
  CHART_PRIMARY,
  CHART_PRO,
  CHART_SECONDARY,
  CHART_TOOLTIP_BORDER,
} from "@/lib/chart-theme";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
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
      className={`w-full min-w-[280px] ${className}`}
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
    <div className={`${CHART_PRO.frame} ${className}`}>
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

const tooltipStyle = {
  borderRadius: CHART_PRO.tooltip.borderRadius,
  border: CHART_PRO.tooltip.border,
  boxShadow: CHART_PRO.tooltip.boxShadow,
  fontSize: CHART_PRO.tooltip.fontSize,
  color: CHART_PRO.tooltip.color,
  padding: "8px 10px",
  background: "#FFFFFF",
};

function ProGrid({ compact = false }: { compact?: boolean }) {
  if (compact) return null;
  return (
    <CartesianGrid
      stroke={CHART_PRO.grid.stroke}
      strokeDasharray={CHART_PRO.grid.strokeDasharray}
      vertical={CHART_PRO.grid.vertical}
    />
  );
}

function ProXAxis({
  dataKey,
  compact = false,
}: {
  dataKey: string;
  compact?: boolean;
}) {
  if (compact) {
    return <XAxis dataKey={dataKey} hide />;
  }
  return (
    <XAxis
      dataKey={dataKey}
      tick={CHART_PRO.axis.tick}
      axisLine={CHART_PRO.axis.axisLine}
      tickLine={CHART_PRO.axis.tickLine}
      dy={4}
    />
  );
}

function ProYAxis({
  yAxisId = "left",
  orientation = "left",
  tickColor = CHART_AXIS,
  compact = false,
  hide = false,
  axisLabel,
}: {
  yAxisId?: "left" | "right";
  orientation?: "left" | "right";
  tickColor?: string;
  compact?: boolean;
  hide?: boolean;
  axisLabel?: string;
}) {
  if (compact || hide) {
    return <YAxis yAxisId={yAxisId} orientation={orientation} hide />;
  }
  const labelProps = axisLabel
    ? {
        value: axisLabel,
        angle: orientation === "right" ? 90 : -90,
        position: orientation === "right" ? ("insideRight" as const) : ("insideLeft" as const),
        style: {
          textAnchor: "middle" as const,
          fill: tickColor,
          fontSize: 9,
          fontWeight: 600,
          fontFamily: "Inter, Segoe UI, sans-serif",
        },
      }
    : undefined;

  return (
    <YAxis
      yAxisId={yAxisId}
      orientation={orientation}
      tick={{ ...CHART_PRO.axis.tick, fill: tickColor }}
      axisLine={{ stroke: CHART_GRID, strokeWidth: 1 }}
      tickLine={{ stroke: CHART_GRID }}
      width={44}
      allowDecimals={false}
      label={labelProps}
    />
  );
}

function ProLegend({ onClick }: { onClick?: React.ComponentProps<typeof Legend>["onClick"] }) {
  return (
    <Legend
      iconType="square"
      iconSize={8}
      onClick={onClick}
      wrapperStyle={{
        ...CHART_PRO.legend,
        paddingTop: 8,
        cursor: onClick ? "pointer" : "default",
      }}
    />
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
  compact,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  yKeySecondary?: string;
  height?: number;
  framed?: boolean;
  autoDualAxis?: boolean;
  /** Sparkline KPI — axes masqués, remplissage teal */
  compact?: boolean;
}) {
  const { filters } = useAppContext();
  const ready = useClientReady();
  const isCompact = compact ?? (!framed && height <= 180);

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
    const rightMax = data.reduce(
      (acc, row) => Math.max(acc, Math.abs(Number(row[yKeySecondary] ?? 0))),
      0,
    );
    const low = Math.min(leftMax, rightMax);
    const high = Math.max(leftMax, rightMax);
    const useDualAxis = leftMax > 0 && rightMax > 0 && high / Math.max(low, 1) >= SPLIT_AXIS_RATIO;

    return [
      { key: yKey, color: CHART_LINE, yAxisId: "left" as const },
      {
        key: yKeySecondary,
        color: CHART_SECONDARY,
        yAxisId: useDualAxis ? ("right" as const) : ("left" as const),
      },
    ];
  }, [autoDualAxis, data, yKey, yKeySecondary]);

  const hasRightAxis = lineSeries.some((line) => line.yAxisId === "right");
  const margin = isCompact ? CHART_PRO.marginCompact : CHART_PRO.margin;
  const gradientId = `area-${yKey}`;

  if (!ready) {
    return framed ? <ChartFrame height={height} /> : <div style={{ height }} />;
  }

  const chartContent = (
    <ResponsiveContainer width="100%" height={height} minWidth={isCompact ? 120 : 280}>
      <AreaChart data={data} margin={margin}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_LINE} stopOpacity={0.28} />
            <stop offset="100%" stopColor={CHART_LINE} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <ProGrid compact={isCompact} />
        <ProXAxis dataKey={xKey} compact={isCompact} />
        <ProYAxis yAxisId="left" compact={isCompact} />
        {hasRightAxis ? (
          <ProYAxis
            yAxisId="right"
            orientation="right"
            tickColor={CHART_SECONDARY}
            compact={isCompact}
          />
        ) : null}
        <Tooltip
          cursor={{ stroke: CHART_GRID, strokeWidth: 1 }}
          contentStyle={tooltipStyle}
          formatter={(value, name) => [String(value ?? ""), columnLabel(filters.language, String(name ?? ""))]}
          labelFormatter={(label) => String(label)}
        />
        {lineSeries.map((line, index) => (
          <Area
            key={line.key}
            type={CHART_PRO.area.type}
            dataKey={line.key}
            name={columnLabel(filters.language, line.key)}
            yAxisId={line.yAxisId}
            stroke={line.color}
            strokeWidth={CHART_PRO.line.strokeWidth}
            fill={index === 0 ? `url(#${gradientId})` : "transparent"}
            fillOpacity={index === 0 ? 1 : 0}
            dot={CHART_PRO.line.dot}
            activeDot={CHART_PRO.line.activeDot}
            connectNulls
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );

  if (!framed) {
    return <ChartSizer height={height}>{chartContent}</ChartSizer>;
  }

  return <ChartFrame height={height}>{chartContent}</ChartFrame>;
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
  stacked = false,
  compact,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  bars: { key: string; color: string; yAxisId?: "left" | "right" }[];
  height?: number;
  framed?: boolean;
  onCategoryClick?: (point: Record<string, unknown>) => void;
  forceDualAxis?: boolean;
  autoSplitAxis?: boolean;
  stacked?: boolean;
  compact?: boolean;
}) {
  const { filters } = useAppContext();
  const fr = filters.language === "Français";
  const ready = useClientReady();
  const [activeBarKey, setActiveBarKey] = useState<string | null>(null);
  /** Les barres gardent toujours leurs axes sauf mode sparkline explicite */
  const isCompact = compact === true;
  const largeAxisLabel = fr ? "Grandes valeurs" : "Large values";
  const smallAxisLabel = fr ? "Petites valeurs" : "Small values";

  const splitAxis = useMemo(() => {
    if (stacked || !autoSplitAxis || bars.length !== 1 || bars.some((bar) => bar.yAxisId)) {
      return null;
    }
    return splitMetricAcrossAxes(data, bars[0].key);
  }, [autoSplitAxis, bars, data, stacked]);

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
    const smallThreshold = highest / 8;

    return bars.map((bar) => {
      const maxAbs = metricMax.find((item) => item.key === bar.key)?.maxAbs ?? 0;
      const isSmallScale = shouldUseDualAxis && maxAbs > 0 && maxAbs < smallThreshold;
      return {
        key: bar.key,
        color: bar.color,
        yAxisId: isSmallScale ? ("right" as const) : ("left" as const),
        sourceKey: bar.key,
        axisLabel: isSmallScale ? smallAxisLabel : largeAxisLabel,
      };
    });
  }, [bars, chartData, forceDualAxis, fr, splitAxis, largeAxisLabel, smallAxisLabel]);

  const visibleBars = useMemo(
    () => (activeBarKey ? resolvedBars.filter((bar) => bar.key === activeBarKey) : resolvedBars),
    [resolvedBars, activeBarKey],
  );
  const hasRightAxis = useMemo(
    () => visibleBars.some((bar) => bar.yAxisId === "right"),
    [visibleBars],
  );
  const margin = isCompact
    ? CHART_PRO.marginCompact
    : hasRightAxis
      ? CHART_PRO.marginDualAxis
      : CHART_PRO.margin;

  if (!ready) {
    return framed ? <ChartFrame height={height} /> : <div style={{ height }} />;
  }

  const chartContent = (
    <ResponsiveContainer width="100%" height={height} minWidth={isCompact ? 120 : 280}>
      <BarChart
        data={chartData}
        margin={margin}
        barCategoryGap={CHART_PRO.bar.categoryGap}
        barGap={stacked ? 0 : 2}
      >
        <ProGrid compact={isCompact} />
        <ProXAxis dataKey={xKey} compact={isCompact} />
        <ProYAxis
          yAxisId="left"
          compact={isCompact}
          tickColor={CHART_PRIMARY}
          axisLabel={hasRightAxis ? largeAxisLabel : undefined}
        />
        {hasRightAxis ? (
          <ProYAxis
            yAxisId="right"
            orientation="right"
            tickColor={CHART_SECONDARY}
            compact={isCompact}
            axisLabel={smallAxisLabel}
          />
        ) : null}
        <Tooltip
          cursor={{ fill: "rgba(238, 242, 246, 0.45)" }}
          shared={stacked}
          labelFormatter={(label) => String(label)}
          contentStyle={tooltipStyle}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;

            if (stacked && payload.length > 1) {
              return (
                <div
                  className="rounded border bg-white px-2.5 py-2 text-[11px]"
                  style={{ borderColor: CHART_TOOLTIP_BORDER, boxShadow: CHART_PRO.tooltip.boxShadow }}
                >
                  <p className="mb-1.5 font-semibold text-[#2C3E50]">{String(label ?? "")}</p>
                  {payload.map((item) => {
                    const dataKey = String(item?.dataKey ?? "");
                    return (
                      <p key={dataKey} className="flex items-center gap-2 text-[#475569]">
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-[1px]"
                          style={{ background: String(item.color ?? CHART_PRIMARY) }}
                        />
                        <span>{columnLabel(filters.language, dataKey)}:</span>
                        <span className="font-semibold text-[#2C3E50]">{String(item.value ?? 0)}</span>
                      </p>
                    );
                  })}
                </div>
              );
            }

            const item = payload[0];
            const dataKey = String(item?.dataKey ?? "");
            const point = (item?.payload ?? {}) as Record<string, unknown>;
            const activeBar = resolvedBars.find((bar) => bar.key === (activeBarKey || dataKey));
            const sourceKey = String(activeBar?.sourceKey ?? activeBarKey ?? dataKey);
            const metricLabel = columnLabel(filters.language, sourceKey);
            const selectedValue = point[sourceKey] ?? point[dataKey] ?? item?.value ?? 0;
            return (
              <div
                className="rounded border bg-white px-2.5 py-2 text-[11px]"
                style={{ borderColor: CHART_TOOLTIP_BORDER, boxShadow: CHART_PRO.tooltip.boxShadow }}
              >
                <p className="mb-1 font-semibold text-[#2C3E50]">{String(label ?? "")}</p>
                <p className="text-[#475569]">
                  <span className="font-semibold" style={{ color: CHART_PRIMARY }}>
                    {metricLabel}:
                  </span>{" "}
                  {String(selectedValue)}
                </p>
                {splitAxis && activeBar?.axisLabel ? (
                  <p className="mt-1 text-[10px] font-medium text-[#94A3B8]">{activeBar.axisLabel}</p>
                ) : null}
                {sourceKey === "cells_4g" ? (
                  <div className="mt-1 space-y-0.5 text-[#475569]">
                    <p>
                      <span className="font-semibold text-[#2C3E50]">
                        {columnLabel(filters.language, "cells_4g_fdd")}:
                      </span>{" "}
                      {String(point.cells_4g_fdd ?? 0)}
                    </p>
                    <p>
                      <span className="font-semibold text-[#2C3E50]">
                        {columnLabel(filters.language, "cells_4g_tdd")}:
                      </span>{" "}
                      {String(point.cells_4g_tdd ?? 0)}
                    </p>
                  </div>
                ) : null}
              </div>
            );
          }}
        />
        {!isCompact ? (
          <ProLegend
            onClick={(entry) =>
              setActiveBarKey((prev) => (prev === String(entry?.dataKey ?? "") ? null : String(entry?.dataKey ?? "")))
            }
          />
        ) : null}
        {visibleBars.map((bar) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            name={
              hasRightAxis && bar.axisLabel
                ? `${columnLabel(filters.language, bar.sourceKey)} · ${bar.axisLabel}`
                : bar.axisLabel ?? columnLabel(filters.language, bar.sourceKey)
            }
            yAxisId={bar.yAxisId ?? "left"}
            fill={bar.color}
            stackId={stacked ? "stack" : undefined}
            maxBarSize={CHART_PRO.bar.maxBarSize}
            radius={stacked ? [0, 0, 0, 0] : CHART_PRO.bar.radius}
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

  return <ChartFrame height={height}>{chartContent}</ChartFrame>;
}

export function DonutChart({
  data,
  nameKey,
  valueKey,
  colors,
  height = 220,
  framed = true,
  centerLabel,
  centerValue,
}: {
  data: Record<string, unknown>[];
  nameKey: string;
  valueKey: string;
  colors?: string[];
  height?: number;
  framed?: boolean;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const { filters } = useAppContext();
  const ready = useClientReady();
  const sliceColors = colors ?? [...CHART_PALETTE.slice(0, 6)];

  if (!ready) {
    return framed ? <ChartFrame height={height} /> : <div style={{ height }} />;
  }

  const chartContent = (
    <div className="relative h-full w-full">
      {centerValue !== undefined ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center">
          {centerLabel ? (
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">
              {centerLabel}
            </span>
          ) : null}
          <span className="text-xl font-bold leading-none text-[#2C3E50]">{centerValue}</span>
        </div>
      ) : null}
      <ResponsiveContainer width="100%" height={height} minWidth={180}>
        <PieChart margin={CHART_PRO.marginCompact}>
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={nameKey}
            innerRadius={CHART_PRO.pie.innerRadius}
            outerRadius={CHART_PRO.pie.outerRadius}
            paddingAngle={CHART_PRO.pie.paddingAngle}
            stroke={CHART_PRO.pie.stroke}
            strokeWidth={CHART_PRO.pie.strokeWidth}
          >
            {data.map((entry, index) => (
              <Cell
                key={String(entry[nameKey] ?? index)}
                fill={sliceColors[index % sliceColors.length]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => [String(value ?? ""), columnLabel(filters.language, String(name ?? ""))]}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            layout="vertical"
            align="right"
            verticalAlign="middle"
            wrapperStyle={{ ...CHART_PRO.legend, lineHeight: "18px" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );

  if (!framed) {
    return <ChartSizer height={height}>{chartContent}</ChartSizer>;
  }

  return <ChartFrame height={height}>{chartContent}</ChartFrame>;
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
      <ResponsiveContainer width="100%" height={height} minWidth={280}>
        <ScatterChart margin={CHART_PRO.margin}>
          <ProGrid />
          <XAxis type="number" dataKey="x" name="PC1" tick={CHART_PRO.axis.tick} axisLine={CHART_PRO.axis.axisLine} tickLine={CHART_PRO.axis.tickLine} />
          <YAxis type="number" dataKey="y" name="PC2" tick={CHART_PRO.axis.tick} axisLine={CHART_PRO.axis.axisLine} tickLine={CHART_PRO.axis.tickLine} />
          <ZAxis type="number" range={[36, 36]} />
          <Tooltip
            cursor={{ stroke: CHART_GRID, strokeWidth: 1 }}
            contentStyle={tooltipStyle}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = (payload[0]?.payload ?? {}) as Record<string, unknown>;
              return (
                <div
                  className="rounded border bg-white px-2.5 py-2 text-[11px]"
                  style={{ borderColor: CHART_TOOLTIP_BORDER, boxShadow: CHART_PRO.tooltip.boxShadow }}
                >
                  <p className="font-semibold text-[#2C3E50]">
                    {fr ? "Site" : "Site"} {String(point.site_id ?? "")}
                  </p>
                  <p className="text-[#475569]">
                    {columnLabel(filters.language, "health_score")}: {String(point.health_score ?? "")}
                  </p>
                </div>
              );
            }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={CHART_PRO.legend} />
          {series.map((s) => (
            <Scatter key={s.name} name={s.name} data={s.points} fill={s.color} fillOpacity={0.85} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
