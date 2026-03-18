'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { ScoreComponent } from '@/services/audit/reportInsights';

const STATUS_COLORS = {
  good: '#16a34a',    // green-600
  warning: '#ca8a04',  // yellow-600
  poor: '#dc2626',     // red-600
};

interface ScoreBarProps {
  components: ScoreComponent[];
}

export default function ScoreBar({ components }: ScoreBarProps) {
  const data = components.map((c) => ({
    name: c.name,
    score: c.score ?? 0,
    weight: c.weightLabel,
    status: c.status,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 80, right: 20, top: 5, bottom: 5 }}>
        <XAxis type="number" domain={[0, 100]} tickCount={6} fontSize={12} />
        <YAxis
          type="category"
          dataKey="name"
          width={75}
          fontSize={12}
          tickLine={false}
        />
        <Tooltip
          formatter={(value, _name, props) => {
            const numericValue = typeof value === 'number' ? value : 0;
            const payload = (props?.payload ?? {}) as { name?: string; weight?: string };
            return [
              `${numericValue}/100 (weight: ${payload.weight ?? '-'})`,
              payload.name ?? 'Score',
            ];
          }}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={24}>
          {data.map((entry, index) => (
            <Cell key={index} fill={STATUS_COLORS[entry.status]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
