'use client'

import { useDataFreshness } from '@/hooks/useDataFreshness'
import type { FreshnessStatus } from '@/hooks/useDataFreshness'

const STATUS_COLOR: Record<FreshnessStatus, string> = {
  fresh:    '#22c55e',
  stale:    '#eab308',
  error:    '#ef4444',
  disabled: '#475569',
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000)       return `${Math.floor(ms / 1000)}s ago`
  if (ms < 3_600_000)    return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000)   return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

export default function DataFreshness() {
  const sources = useDataFreshness(60_000)

  // Fallback while loading (shows disabled dots until first fetch completes)
  const DEFAULT_IDS = ['adsb', 'ais', 'gdelt', 'acled', 'telegram', 'iaea']
  const DEFAULT_LABELS: Record<string, string> = {
    adsb: 'ADS-B', ais: 'AIS', gdelt: 'GDELT',
    acled: 'ACLED', telegram: 'TELEGRAM', iaea: 'IAEA',
  }
  const display = sources.length > 0
    ? sources
    : DEFAULT_IDS.map(id => ({
        id, label: DEFAULT_LABELS[id] ?? id.toUpperCase(),
        status: 'disabled' as FreshnessStatus, updatedAt: null, error: null,
      }))

  return (
    <div style={{
      display:    'flex',
      alignItems: 'center',
      gap:         16,
      padding:    '4px 16px',
      background: 'var(--bg-surface)',
      borderTop:  '1px solid var(--border)',
      flexShrink:  0,
      height:      32,
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

      {display.map(src => {
        const color = STATUS_COLOR[src.status]
        const tip   = src.status === 'error' && src.error
          ? src.error.slice(0, 80)
          : src.updatedAt
            ? timeAgo(src.updatedAt)
            : 'No data'
        return (
          <span
            key={src.id}
            title={tip}
            style={{
              display:       'flex',
              alignItems:    'center',
              gap:            4,
              fontSize:       9,
              fontFamily:    "'Share Tech Mono', monospace",
              letterSpacing: '0.08em',
              color,
              whiteSpace:    'nowrap',
              cursor:        'default',
            }}
          >
            <span style={{
              width:        5,
              height:       5,
              borderRadius: '50%',
              background:    color,
              display:      'inline-block',
              animation:    src.status === 'fresh'
                ? 'pulse-opacity 2s ease-in-out infinite'
                : undefined,
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
        // LIVE
      </span>
    </div>
  )
}
