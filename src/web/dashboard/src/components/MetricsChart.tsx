import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { fetchMetricsHistory } from '../api.js';
import type { MetricsSnapshotDTO } from '../api-types.js';

interface ChartPoint {
  label: string;
  views: number | null;
  likes: number | null;
}

export function MetricsChart({ postId, postedAt }: { postId: string; postedAt: string }) {
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetricsHistory(postId)
      .then(result => {
        const postTime = new Date(postedAt).getTime();
        const chartData: ChartPoint[] = (result.snapshots ?? []).map((s: MetricsSnapshotDTO) => {
          const elapsedMs = new Date(s.collectedAt).getTime() - postTime;
          const mins = Math.round(elapsedMs / 60_000);
          const label = mins < 60 ? `+${mins}m` : `+${(mins / 60).toFixed(1)}h`;
          return {
            label,
            views: s.metrics?.views ?? null,
            likes: s.metrics?.likes ?? null,
          };
        });
        setData(chartData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [postId, postedAt]);

  if (loading) return <div style={{ padding: '20px', color: '#64748b' }}>Loading chart...</div>;
  if (data.length === 0)
    return <div style={{ padding: '20px', color: '#64748b' }}>No metrics data yet</div>;

  return (
    <div style={{ width: '100%', height: 250, marginTop: '12px' }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
          <YAxis stroke="#64748b" fontSize={12} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9' }}
          />
          <Line
            type="monotone"
            dataKey="views"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            name="Views"
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="likes"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
            name="Likes"
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
