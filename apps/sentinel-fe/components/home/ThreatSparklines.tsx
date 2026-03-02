'use client'

import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'

export interface TrendPoint {
  date:        string
  count:       number
  avgSeverity: number
}

interface Props {
  data:        TrendPoint[]
  accentColor: string
  slug:        string
}

export default function ThreatSparklines({ data, accentColor, slug }: Props) {
  if (!data.length) {
    return (
      <div style={{
        height: 32, display: 'flex', alignItems: 'center',
        padding: '0 2px',
      }}>
        <div style={{
          width: '100%', height: 1,
          background: `linear-gradient(to right, transparent, ${accentColor}40, transparent)`,
        }} />
      </div>
    )
  }

  const gradId = `sparkline-grad-${slug}`

  return (
    <div style={{ height: 36, margin: '8px -4px 0' }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={accentColor} stopOpacity={0.5} />
              <stop offset="100%" stopColor={accentColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="count"
            stroke={accentColor}
            strokeWidth={1.5}
            fill={`url(#${gradId})`}
            dot={false}
            isAnimationActive={false}
          />
          <Tooltip
            contentStyle={{
              background: '#111827', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 2, fontSize: 9, padding: '4px 8px',
              fontFamily: "'Share Tech Mono', monospace", color: '#e2e8f0',
            }}
            labelStyle={{ color: '#94a3b8', fontSize: 9 }}
            formatter={(v) => [`${v ?? 0}`, 'incidents']}
            labelFormatter={(label) => String(label)}
            cursor={{ stroke: `${accentColor}60`, strokeWidth: 1 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
