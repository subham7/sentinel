'use client'

// FinancialChart — Brent crude 60-day price chart with OSINT incident overlay
// Opens as a modal when the user clicks the Brent or WTI card in FinancialBar.
// Uses Lightweight Charts v5 (lazy-imported, browser-only).

import { useEffect, useRef } from 'react'
import type { OilPriceData } from '@sentinel/shared'
import type { TrendPoint } from '@/hooks/useIncidentTrend'

const FM = "'Share Tech Mono', monospace"

function sevColor(avg: number): string {
  if (avg >= 5) return '#ef4444'
  if (avg >= 4) return '#f97316'
  if (avg >= 3) return '#eab308'
  return '#22c55e'
}

interface Props {
  oil:     OilPriceData
  trend:   TrendPoint[]
  onClose: () => void
}

export function FinancialChart({ oil, trend, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let chart: any = null
    let ro:   ResizeObserver | null = null
    let alive = true

    void (async () => {
      // Lazy-import to avoid SSR issues — all lightweight-charts types come with it
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lc: any = await import('lightweight-charts')
      if (!alive || !container) return

      chart = lc.createChart(container, {
        layout: {
          background: { type: lc.ColorType.Solid, color: '#0d1224' },
          textColor:  '#94a3b8',
          fontFamily: FM,
        },
        grid: {
          vertLines: { color: 'rgba(255,255,255,0.04)' },
          horzLines: { color: 'rgba(255,255,255,0.04)' },
        },
        crosshair:      { mode: lc.CrosshairMode?.Normal ?? 1 },
        rightPriceScale: {
          borderColor:   'rgba(255,255,255,0.08)',
          scaleMargins:  { top: 0.08, bottom: 0.32 },
        },
        leftPriceScale: { visible: false },
        timeScale: {
          borderColor: 'rgba(255,255,255,0.08)',
          timeVisible: false,
        },
        handleScroll: true,
        handleScale:  true,
        width:  container.clientWidth,
        height: container.clientHeight,
      })

      // ── Build dated oil history ───────────────────────────────────────────
      // oil.history is oldest-first per types.ts: "last N daily brent closes, oldest first"
      const hist    = oil.history
      const lastDay = new Date(oil.updated_at)
      lastDay.setUTCHours(0, 0, 0, 0)

      const oilData = hist.map((val: number, i: number) => {
        const d = new Date(lastDay.getTime() - (hist.length - 1 - i) * 86_400_000)
        return { time: d.toISOString().slice(0, 10), value: val }
      })

      // ── Brent price line ─────────────────────────────────────────────────
      // v5 API: chart.addSeries(SeriesClass, options)  (addLineSeries removed)
      const SeriesClass = lc.LineSeries ?? null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let line: any = null
      if (SeriesClass) {
        line = chart.addSeries(SeriesClass, {
          color:            '#00b0ff',
          lineWidth:        1.5,
          priceLineVisible: true,
          priceLineColor:   'rgba(0,176,255,0.3)',
          lastValueVisible: true,
          priceFormat:      { type: 'price', precision: 2, minMove: 0.01 },
        })
      } else {
        // Fallback for older builds that still have addLineSeries
        line = chart.addLineSeries({
          color:            '#00b0ff',
          lineWidth:        1.5,
          priceLineVisible: true,
          priceLineColor:   'rgba(0,176,255,0.3)',
          lastValueVisible: true,
        })
      }
      if (line) line.setData(oilData)

      // ── Incident histogram (bottom 28% of chart) ─────────────────────────
      const HistClass = lc.HistogramSeries ?? null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let histo: any = null
      if (HistClass) {
        histo = chart.addSeries(HistClass, {
          priceScaleId:     'volume',
          lastValueVisible: false,
          priceLineVisible: false,
        })
      } else if (chart.addHistogramSeries) {
        histo = chart.addHistogramSeries({
          priceScaleId:     'volume',
          lastValueVisible: false,
          priceLineVisible: false,
        })
      }
      if (histo) {
        const histoData = trend
          .filter(t => t.count > 0)
          .map(t => ({
            time:  t.date,
            value: t.count,
            color: sevColor(t.avgSeverity) + '99',
          }))
        if (histoData.length) histo.setData(histoData)
      }

      // Volume price scale — bottom 28%
      const volScale = chart.priceScale('volume')
      if (volScale) {
        volScale.applyOptions({
          scaleMargins:  { top: 0.72, bottom: 0 },
          borderVisible: false,
        })
      }

      // ── OSINT event markers for sev ≥ 4 ──────────────────────────────────
      if (line) {
        const markers = trend
          .filter(t => t.avgSeverity >= 4 && t.count > 0)
          .map(t => ({
            time:     t.date,
            position: 'aboveBar' as const,
            color:    t.avgSeverity >= 5 ? '#ef4444' : '#f97316',
            shape:    'arrowDown' as const,
            text:     String(t.count),
            size:     1,
          }))
        if (markers.length) {
          if (lc.createSeriesMarkers) {
            lc.createSeriesMarkers(line, markers)
          } else if (line.setMarkers) {
            line.setMarkers(markers)
          }
        }
      }

      chart.timeScale().fitContent()

      // ── Resize observer ──────────────────────────────────────────────────
      ro = new ResizeObserver(() => {
        if (chart && container) {
          chart.applyOptions({
            width:  container.clientWidth,
            height: container.clientHeight,
          })
        }
      })
      ro.observe(container)
    })()

    return () => {
      alive = false
      ro?.disconnect()
      if (chart) chart.remove()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // intentionally run once; data is stable for modal lifetime

  // ── Close on Escape ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 720, height: 390,
          background:   '#0d1224',
          border:       '1px solid rgba(255,255,255,0.14)',
          borderRadius: 4,
          display:      'flex', flexDirection: 'column',
          overflow:     'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div style={{
          height: 30, flexShrink: 0,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8,
        }}>
          <span style={{
            fontFamily: FM, fontSize: 9, color: '#475569',
            letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1,
          }}>
            ◆ BRENT CRUDE · 60D · OSINT INCIDENT CORRELATION
          </span>
          <span style={{ fontSize: 8, fontFamily: FM, color: '#2d3748', letterSpacing: '0.06em' }}>
            ESC TO CLOSE
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 14, color: '#475569', padding: 0, lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* ── Chart canvas ─────────────────────────────────────────────────── */}
        <div ref={containerRef} style={{ flex: 1 }} />

        {/* ── Legend ───────────────────────────────────────────────────────── */}
        <div style={{
          height: 22, flexShrink: 0,
          borderTop: '1px solid rgba(255,255,255,0.04)',
          display: 'flex', alignItems: 'center', padding: '0 12px', gap: 18,
        }}>
          {[
            { color: '#00b0ff',   label: 'BRENT CRUDE (USD/bbl)', bar: false },
            { color: '#22c55e99', label: 'INCIDENT COUNT',         bar: true  },
            { color: '#f97316',   label: 'HIGH-SEV EVENT ≥4 ▼',   bar: false },
          ].map(({ color, label, bar }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                width:   bar ? 9  : 18,
                height:  bar ? 9  : 2,
                background:   color,
                display:      'inline-block',
                borderRadius: bar ? 1 : 0,
              }} />
              <span style={{ fontFamily: FM, fontSize: 7, color: '#475569', letterSpacing: '0.06em' }}>
                {label}
              </span>
            </span>
          ))}
          <span style={{ marginLeft: 'auto', fontFamily: FM, fontSize: 7, color: '#2d3748', letterSpacing: '0.04em' }}>
            DRAG TO PAN · SCROLL TO ZOOM
          </span>
        </div>
      </div>
    </div>
  )
}
