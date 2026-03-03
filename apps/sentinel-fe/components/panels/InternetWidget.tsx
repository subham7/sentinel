'use client'

import type { ConflictConfig } from '@sentinel/shared'
import { useInternetStatus } from '@/hooks/useInternetStatus'
import type { InternetStatus } from '@/hooks/useInternetStatus'

interface Props {
  conflict: ConflictConfig
}

const STATUS_META: Record<InternetStatus, { label: string; color: string; desc: string }> = {
  normal:    { label: 'NORMAL',    color: '#22c55e', desc: 'No detected disruptions' },
  degraded:  { label: 'DEGRADED',  color: '#eab308', desc: 'Elevated anomaly rate' },
  disrupted: { label: 'DISRUPTED', color: '#f97316', desc: 'Significant routing disruption' },
  blocked:   { label: 'BLOCKED',   color: '#ef4444', desc: 'Confirmed censorship/outage' },
}

export default function InternetWidget({ conflict }: Props) {
  const countries = conflict.internetCountries ?? []
  const statuses  = useInternetStatus(countries)

  if (!countries.length) return null

  return (
    <div style={{
      padding: '8px 12px',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
      fontFamily: "'Share Tech Mono', monospace",
    }}>
      {/* Header */}
      <div style={{
        fontSize: 10, color: 'var(--text-secondary)',
        letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6,
      }}>
        Internet Connectivity
      </div>

      {countries.map(c => {
        const s    = statuses.get(c.iso2)
        const meta = s ? STATUS_META[s.status] : null

        return (
          <div
            key={c.iso2}
            title={meta ? `${c.name}: ${meta.desc}${s ? `\nIODA events: ${s.sources.ioda.events} (score ${s.sources.ioda.maxScore.toFixed(2)})\nOONI anomaly: ${(s.sources.ooni.anomalyRate * 100).toFixed(1)}%` : ''}` : c.name}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <span style={{ fontSize: 10, color: 'var(--text-primary)' }}>{c.name}</span>

            {meta ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Source bars: IODA · OONI · CF */}
                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 10 }}>
                  {/* IODA bar */}
                  <div
                    title={`IODA: ${s!.sources.ioda.events} events, score ${s!.sources.ioda.maxScore.toFixed(2)}`}
                    style={{
                      width: 3,
                      height: `${Math.min(10, Math.round(s!.sources.ioda.maxScore * 10) + 2)}px`,
                      background: s!.sources.ioda.maxScore > 0.25 ? meta.color : '#475569',
                      borderRadius: 1,
                    }}
                  />
                  {/* OONI bar */}
                  <div
                    title={`OONI: ${(s!.sources.ooni.anomalyRate * 100).toFixed(1)}% anomaly rate, ${s!.sources.ooni.confirmed} confirmed`}
                    style={{
                      width: 3,
                      height: `${Math.min(10, Math.round(s!.sources.ooni.anomalyRate * 30) + 2)}px`,
                      background: s!.sources.ooni.anomalyRate > 0.10 ? meta.color : '#475569',
                      borderRadius: 1,
                    }}
                  />
                  {/* CF bar (if present) */}
                  {s!.sources.cf && (
                    <div
                      title={`Cloudflare netflow: ${s!.sources.cf.change.toFixed(0)}%`}
                      style={{
                        width: 3,
                        height: `${Math.min(10, Math.round(Math.abs(s!.sources.cf.change) / 10) + 2)}px`,
                        background: s!.sources.cf.change < -30 ? meta.color : '#475569',
                        borderRadius: 1,
                      }}
                    />
                  )}
                </div>

                {/* Status badge */}
                <span style={{
                  fontSize: 8, color: meta.color,
                  padding: '1px 5px',
                  background: `${meta.color}18`,
                  border: `1px solid ${meta.color}50`,
                  borderRadius: 2, letterSpacing: '0.1em',
                }}>
                  {meta.label}
                </span>
              </div>
            ) : (
              <span style={{
                fontSize: 8, color: 'var(--text-muted)',
                letterSpacing: '0.08em', animation: 'pulse-opacity 1.5s ease-in-out infinite',
              }}>
                LOADING
              </span>
            )}
          </div>
        )
      })}

      <div style={{
        fontSize: 7, color: 'var(--text-muted)',
        letterSpacing: '0.06em', marginTop: 4,
      }}>
        IODA · OONI · CF Radar · 15-min cache
      </div>
    </div>
  )
}
