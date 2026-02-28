interface Props {
  severity: 1 | 2 | 3 | 4 | 5
  label?: string
}

const SEV_COLORS: Record<number, string> = {
  1: '#22c55e',
  2: '#84cc16',
  3: '#eab308',
  4: '#f97316',
  5: '#ef4444',
}

const SEV_LABELS: Record<number, string> = {
  1: 'INFO',
  2: 'LOW',
  3: 'MED',
  4: 'HIGH',
  5: 'CRIT',
}

export default function SeverityBadge({ severity, label }: Props) {
  const color = SEV_COLORS[severity] ?? '#94a3b8'
  const text  = label ?? SEV_LABELS[severity] ?? String(severity)

  return (
    <span style={{
      display:         'inline-flex',
      alignItems:      'center',
      padding:         '1px 6px',
      background:      `${color}22`,
      border:          `1px solid ${color}66`,
      borderRadius:    2,
      color,
      fontFamily:      "'Share Tech Mono', monospace",
      fontSize:        10,
      letterSpacing:   '0.12em',
      textTransform:   'uppercase',
      whiteSpace:      'nowrap',
    }}>
      {text}
    </span>
  )
}
