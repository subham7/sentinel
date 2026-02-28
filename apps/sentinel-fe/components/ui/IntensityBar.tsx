type Intensity = 'critical' | 'high' | 'elevated' | 'low'

const INTENSITY_COLORS: Record<Intensity, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  elevated: '#eab308',
  low:      '#22c55e',
}

interface Props {
  intensity: Intensity
}

export default function IntensityBar({ intensity }: Props) {
  const color = INTENSITY_COLORS[intensity]
  return (
    <div style={{
      height:     2,
      width:      '100%',
      background: `${color}33`,
      position:   'relative',
    }}>
      <div style={{
        position:   'absolute',
        inset:       0,
        background:  color,
        animation:   'pulse-opacity 2s ease-in-out infinite',
      }} />
    </div>
  )
}
