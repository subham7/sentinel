'use client'

import { useState, useEffect } from 'react'

interface HelpLine {
  label:  string
  number: string
}

interface CountryEntry {
  country: string
  code:    string
  flag:    string
  lines:   HelpLine[]
}

interface Props {
  open:    boolean
  onClose: () => void
}

export default function EmergencyHelplines({ open, onClose }: Props) {
  const [data, setData] = useState<CountryEntry[]>([])

  useEffect(() => {
    if (!open || data.length > 0) return
    fetch('/data/emergency-helplines.json')
      .then(r => r.json())
      .then(setData)
      .catch(console.warn)
  }, [open, data.length])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const mono: React.CSSProperties = { fontFamily: "'Share Tech Mono', monospace" }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-bright)',
          borderRadius: 4,
          width: '100%',
          maxWidth: 680,
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          ...mono,
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 16px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div>
            <span style={{
              fontSize: 11, color: '#ef4444', letterSpacing: '0.16em',
              textTransform: 'uppercase', fontWeight: 700,
            }}>
              ✛ Emergency Helplines
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 10, letterSpacing: '0.08em' }}>
              12 countries · Press H or Esc to close
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: '2px 4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Country grid */}
        <div style={{
          overflowY: 'auto',
          padding: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 10,
        }}>
          {data.map(entry => (
            <div
              key={entry.code}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 3,
                padding: '8px 10px',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                marginBottom: 6,
                borderBottom: '1px solid var(--border)',
                paddingBottom: 5,
              }}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>{entry.flag}</span>
                <span style={{ fontSize: 10, color: 'var(--text-primary)', letterSpacing: '0.08em' }}>
                  {entry.country}
                </span>
              </div>
              {entry.lines.map(line => (
                <div key={line.label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '2px 0',
                }}>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                    {line.label}
                  </span>
                  <a
                    href={`tel:${line.number.replace(/\s/g, '')}`}
                    style={{
                      fontSize: 10, color: 'var(--text-accent)',
                      textDecoration: 'none', letterSpacing: '0.04em',
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    {line.number}
                  </a>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '6px 16px',
          borderTop: '1px solid var(--border)',
          fontSize: 8, color: 'var(--text-muted)',
          letterSpacing: '0.08em',
          flexShrink: 0,
        }}>
          Numbers may change during active conflict. Verify through official government sources.
          ICRC = International Committee of the Red Cross · UNHCR = UN Refugee Agency
        </div>
      </div>
    </div>
  )
}
