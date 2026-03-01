'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ALL_CONFLICTS } from '@sentinel/shared'
import type { ConflictConfig, Aircraft, Incident } from '@sentinel/shared'
import type { LayerState } from './map/TheaterMap'

interface Props {
  open:          boolean
  onClose:       () => void
  conflict:      ConflictConfig
  layers:        LayerState
  onToggleLayer: (k: keyof LayerState) => void
  aircraft:      Aircraft[]
  incidents:     Incident[]
}

interface PaletteItem {
  id:       string
  group:    string
  label:    string
  sub?:     string
  action:   () => void
  checked?: boolean
}

const LAYER_LABELS: Partial<Record<keyof LayerState, string>> = {
  aircraft:      'Aircraft tracks',
  vessels:       'Vessel tracks',
  incidents:     'Incident markers',
  heatmap:       'Incident heatmap',
  bases:         'Military bases',
  nuclear:       'Nuclear sites',
  sam:           'SAM coverage rings',
  shippingLanes: 'Shipping lanes',
  chokepoints:   'Chokepoints',
  strikeRanges:  'Strike range rings',
  countries:     'Country highlights',
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color: '#00b0ff' }}>{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  )
}

export default function CommandPalette({
  open, onClose, conflict, layers, onToggleLayer, aircraft, incidents,
}: Props) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Reset state when opened/closed
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  const buildItems = useCallback((): PaletteItem[] => {
    const q = query.toLowerCase()
    const items: PaletteItem[] = []

    // Conflicts
    for (const c of ALL_CONFLICTS) {
      const label = `${c.name} — ${c.shortName}`
      if (!q || label.toLowerCase().includes(q) || c.slug.includes(q)) {
        items.push({
          id: `conflict:${c.slug}`,
          group: 'CONFLICTS',
          label,
          sub: c.slug,
          action: () => { router.push(`/conflicts/${c.slug}`); onClose() },
        })
      }
    }

    // Layer toggles
    for (const [key, label] of Object.entries(LAYER_LABELS)) {
      const k = key as keyof LayerState
      if (!(k in layers)) continue
      if (!q || (label ?? '').toLowerCase().includes(q)) {
        items.push({
          id: `layer:${key}`,
          group: 'LAYERS',
          label: label ?? key,
          sub: layers[k] ? 'enabled' : 'disabled',
          checked: layers[k],
          action: () => { onToggleLayer(k) },
        })
      }
    }

    // Aircraft
    const matchingAc = aircraft
      .filter(ac => {
        if (!q) return true
        return ac.callsign.toLowerCase().includes(q) || ac.type.toLowerCase().includes(q) || ac.side.toLowerCase().includes(q)
      })
      .slice(0, 5)
    for (const ac of matchingAc) {
      items.push({
        id: `ac:${ac.icao24}`,
        group: 'AIRCRAFT',
        label: ac.callsign,
        sub: `${ac.type.toUpperCase()} · ${ac.side} · ${Math.round(ac.altitude)}ft`,
        action: onClose,
      })
    }

    // Recent incidents
    const matchingInc = incidents
      .filter(inc => {
        if (!q) return true
        return inc.title.toLowerCase().includes(q) || (inc.location_name ?? '').toLowerCase().includes(q) || inc.category.toLowerCase().includes(q)
      })
      .slice(0, 5)
    for (const inc of matchingInc) {
      items.push({
        id: `inc:${inc.id}`,
        group: 'RECENT EVENTS',
        label: inc.title,
        sub: inc.location_name ?? inc.category,
        action: onClose,
      })
    }

    return items
  }, [query, layers, aircraft, incidents, router, onClose, onToggleLayer])

  const items = buildItems()

  // Clamp activeIdx whenever items change
  useEffect(() => {
    setActiveIdx(i => Math.min(i, Math.max(0, items.length - 1)))
  }, [items.length])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key === 'ArrowDown')  { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, items.length - 1)); return }
      if (e.key === 'ArrowUp')    { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter') {
        e.preventDefault()
        items[activeIdx]?.action()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, items, activeIdx, onClose])

  if (!open) return null

  // Group items for rendering
  const grouped: { group: string; items: (PaletteItem & { idx: number })[] }[] = []
  let idx = 0
  for (const item of items) {
    const existing = grouped.find(g => g.group === item.group)
    if (existing) {
      existing.items.push({ ...item, idx: idx++ })
    } else {
      grouped.push({ group: item.group, items: [{ ...item, idx: idx++ }] })
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-bright)',
          borderRadius: 4,
          overflow: 'hidden',
          fontFamily: "'Share Tech Mono', monospace",
        }}
      >
        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIdx(0) }}
            placeholder={`Search ${conflict.name} — conflicts, layers, tracks…`}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontFamily: "'Share Tech Mono', monospace",
              fontSize: 13, letterSpacing: '0.04em',
            }}
          />
          <span style={{
            fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.1em',
            padding: '2px 5px', border: '1px solid var(--border)',
            borderRadius: 2,
          }}>
            ESC
          </span>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 380, overflowY: 'auto' }}>
          {items.length === 0 ? (
            <div style={{
              padding: '20px 14px', textAlign: 'center',
              fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em',
            }}>
              // NO RESULTS
            </div>
          ) : grouped.map(grp => (
            <div key={grp.group}>
              <div style={{
                fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.14em',
                padding: '8px 14px 4px',
                textTransform: 'uppercase',
                borderTop: '1px solid var(--border)',
              }}>
                {grp.group}
              </div>
              {grp.items.map(item => {
                const isActive = item.idx === activeIdx
                return (
                  <div
                    key={item.id}
                    onClick={item.action}
                    onMouseEnter={() => setActiveIdx(item.idx)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '7px 14px',
                      background: isActive ? 'var(--bg-overlay)' : 'transparent',
                      borderLeft: isActive ? '2px solid #00b0ff' : '2px solid transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {item.checked !== undefined && (
                        <span style={{
                          width: 10, height: 10, borderRadius: 2,
                          border: `1px solid ${item.checked ? '#00b0ff' : 'var(--border-bright)'}`,
                          background: item.checked ? '#00b0ff33' : 'transparent',
                          flexShrink: 0, display: 'inline-block',
                        }} />
                      )}
                      <span style={{ fontSize: 12, color: 'var(--text-primary)', letterSpacing: '0.04em' }}>
                        {highlight(item.label, query)}
                      </span>
                    </div>
                    {item.sub && (
                      <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                        {item.sub}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div style={{
          display: 'flex', gap: 12, padding: '6px 14px',
          borderTop: '1px solid var(--border)',
          fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.08em',
        }}>
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  )
}
