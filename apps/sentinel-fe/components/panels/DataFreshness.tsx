interface Source {
  id:     string
  label:  string
  status: 'fresh' | 'stale' | 'error' | 'disabled'
}

const STATUS_COLORS: Record<string, string> = {
  fresh:    '#22c55e',
  stale:    '#eab308',
  error:    '#ef4444',
  disabled: '#475569',
}

interface Props {
  sources?: Source[]
}

const DEFAULT_SOURCES: Source[] = [
  { id: 'adsb',    label: 'ADS-B',    status: 'fresh' },
  { id: 'ais',     label: 'AIS',      status: 'fresh' },
  { id: 'gdelt',   label: 'GDELT',    status: 'fresh' },
  { id: 'acled',   label: 'ACLED',    status: 'fresh' },
  { id: 'telegram',label: 'TELEGRAM', status: 'fresh' },
]

export default function DataFreshness({ sources = DEFAULT_SOURCES }: Props) {
  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      gap:             16,
      padding:        '4px 16px',
      background:    'var(--bg-surface)',
      borderTop:     '1px solid var(--border)',
      flexShrink:     0,
      height:          32,
    }}>
      <span style={{
        fontSize:      9,
        color:        'var(--text-muted)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        whiteSpace:    'nowrap',
      }}>
        Data Sources
      </span>

      {sources.map(src => {
        const color = STATUS_COLORS[src.status] ?? '#94a3b8'
        return (
          <span key={src.id} style={{
            display:        'flex',
            alignItems:     'center',
            gap:             4,
            fontSize:        9,
            fontFamily:     "'Share Tech Mono', monospace",
            letterSpacing:  '0.08em',
            color:           color,
            whiteSpace:     'nowrap',
          }}>
            <span style={{
              width:        5,
              height:       5,
              borderRadius: '50%',
              background:    color,
              display:      'inline-block',
              animation:    src.status === 'fresh' ? 'pulse-opacity 2s ease-in-out infinite' : undefined,
            }} />
            {src.label}
          </span>
        )
      })}

      <span style={{
        marginLeft:    'auto',
        fontSize:       9,
        color:         'var(--text-muted)',
        fontFamily:    "'Share Tech Mono', monospace",
        letterSpacing: '0.08em',
      }}>
        // PHASE 3 — ADS-B + AIS + OSINT LIVE
      </span>
    </div>
  )
}
