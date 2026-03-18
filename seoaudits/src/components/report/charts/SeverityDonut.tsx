'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: '#dc2626',  // red-600
  SERIOUS: '#ea580c',   // orange-600
  MODERATE: '#ca8a04',  // yellow-600
  MINOR: '#2563eb',     // blue-600
};

interface SeverityDonutProps {
  criticalCount: number;
  seriousCount: number;
  moderateCount: number;
  minorCount: number;
}

export default function SeverityDonut({
  criticalCount,
  seriousCount,
  moderateCount,
  minorCount,
}: SeverityDonutProps) {
  const data = [
    { name: 'Critical', value: criticalCount },
    { name: 'Serious', value: seriousCount },
    { name: 'Moderate', value: moderateCount },
    { name: 'Minor', value: minorCount },
  ].filter((d) => d.value > 0);

  if (data.length === 0) return null;

  const colors = data.map((d) => SEVERITY_COLORS[d.name.toUpperCase()] ?? '#6b7280');

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={75}
          paddingAngle={2}
          dataKey="value"
          strokeWidth={0}
        >
          {data.map((_entry, index) => (
            <Cell key={index} fill={colors[index]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => {
            const numericValue = typeof value === 'number' ? value : 0;
            return [`${numericValue} issues`];
          }}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Legend
          iconSize={10}
          iconType="circle"
          wrapperStyle={{ fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
