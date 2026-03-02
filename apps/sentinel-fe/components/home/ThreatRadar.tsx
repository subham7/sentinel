'use client'

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts'

export interface CategoryItem {
  category: string
  count:    number
}

interface Props {
  categories:  CategoryItem[]
  accentColor: string
  intensity:   string
  slug:        string
}

const INTENSITY_BASE: Record<string, number> = {
  critical: 55,
  high:     40,
  elevated: 25,
  low:      12,
}

function buildRadarData(categories: CategoryItem[], intensity: string) {
  const base   = INTENSITY_BASE[intensity] ?? 20
  const catMap: Record<string, number> = {}
  for (const c of categories) catMap[c.category] = c.count

  const military = (catMap['armed_conflict'] ?? 0) + (catMap['missile'] ?? 0) + (catMap['drone'] ?? 0)
  const naval    = catMap['naval']      ?? 0
  const diplo    = catMap['diplomatic'] ?? 0
  const cyber    = catMap['cyber']      ?? 0
  const civil    = catMap['protest']    ?? 0
  const nuclear  = catMap['nuclear']    ?? 0
  const nukeBase = intensity === 'critical' ? 30 : intensity === 'high' ? 15 : 0

  return [
    { axis: 'Military',   score: Math.min(100, base + military * 5) },
    { axis: 'Naval',      score: Math.min(100, Math.round(base * 0.6) + naval * 8) },
    { axis: 'Diplomatic', score: Math.min(100, Math.round(base * 0.4) + diplo * 4) },
    { axis: 'Cyber',      score: Math.min(100, cyber * 15) },
    { axis: 'Civil',      score: Math.min(100, civil * 3) },
    { axis: 'Nuclear',    score: Math.min(100, nuclear * 20 + nukeBase) },
  ]
}

export default function ThreatRadar({ categories, accentColor, intensity, slug }: Props) {
  const data = buildRadarData(categories, intensity)

  return (
    <div style={{ height: 130, margin: '6px -12px 0' }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} margin={{ top: 6, right: 28, bottom: 6, left: 28 }}>
          <PolarGrid stroke="rgba(255,255,255,0.06)" />
          <PolarAngleAxis
            dataKey="axis"
            tick={{
              fill: '#475569', fontSize: 8,
              fontFamily: "'Share Tech Mono', monospace",
            }}
          />
          <Radar
            name={slug}
            dataKey="score"
            stroke={accentColor}
            strokeWidth={1.5}
            fill={accentColor}
            fillOpacity={0.18}
            isAnimationActive={false}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
