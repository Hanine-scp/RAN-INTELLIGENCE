"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}

export function SummaryLineChart({
  data,
  xKey,
  yKey,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
}) {
  const mounted = useMounted();
  if (!mounted) {
    return <div className="h-72 rounded-2xl border border-zinc-200 bg-white p-3" />;
  }
  return (
    <div className="h-72 rounded-2xl border border-zinc-200 bg-white p-3">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={xKey} />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey={yKey} stroke="#dc2626" strokeWidth={3} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MultiBarChart({
  data,
  xKey,
  bars,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  bars: { key: string; color: string }[];
}) {
  const mounted = useMounted();
  if (!mounted) {
    return <div className="h-80 rounded-2xl border border-zinc-200 bg-white p-3" />;
  }
  return (
    <div className="h-80 rounded-2xl border border-zinc-200 bg-white p-3">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={xKey} />
          <YAxis />
          <Tooltip />
          <Legend />
          {bars.map((bar) => (
            <Bar key={bar.key} dataKey={bar.key} fill={bar.color} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
