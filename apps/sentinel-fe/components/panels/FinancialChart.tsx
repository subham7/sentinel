'use client'

// FinancialChart — lightweight-charts v5 line chart for FRED series sparklines

import { useEffect, useRef } from 'react'
import type { FredPoint } from '@sentinel/shared'

interface Props {
  data:    FredPoint[]   // oldest → newest
  color?:  string        // line color, defaults to --text-accent
  height?: number        // total height in px, default 80
}

export function FinancialChart({ data, color = '#00b0ff', height = 80 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || data.length < 2) return

    let cleanup: (() => void) | undefined

    import('lightweight-charts').then((lc) => {
      const { createChart, ColorType, LineStyle, LineSeries } = lc as typeof import('lightweight-charts')
      const el = containerRef.current
      if (!el) return

      const chart = createChart(el, {
        width:  el.clientWidth,
        height,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor:  '#94a3b8',
        },
        grid: {
          vertLines: { visible: false },
          horzLines:  { color: 'rgba(255,255,255,0.04)', style: LineStyle.Dotted },
        },
        leftPriceScale:  { visible: false },
        rightPriceScale: {
          visible:    true,
          borderColor: 'rgba(255,255,255,0.08)',
          textColor:   '#475569',
        },
        timeScale: {
          borderColor: 'rgba(255,255,255,0.08)',
        },
        crosshair: {
          horzLine: { visible: false, labelVisible: false },
          vertLine: { color: 'rgba(255,255,255,0.15)', labelVisible: false },
        },
        handleScroll: false,
        handleScale:  false,
      })

      const series = chart.addSeries(LineSeries, {
        color,
        lineWidth:              2,
        lastValueVisible:       false,
        priceLineVisible:       false,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius:  3,
      })

      const mapped = data.map(p => ({
        time:  p.date as import('lightweight-charts').Time,
        value: p.value,
      }))
      series.setData(mapped)
      chart.timeScale().fitContent()

      const ro = new ResizeObserver(entries => {
        const w = entries[0]?.contentRect.width
        if (w) chart.applyOptions({ width: w })
      })
      ro.observe(el)

      cleanup = () => {
        ro.disconnect()
        chart.remove()
      }
    }).catch(() => { /* lightweight-charts unavailable */ })

    return () => { cleanup?.() }
  }, [data, color, height])

  if (data.length < 2) {
    return (
      <div
        ref={containerRef}
        style={{ height }}
        className="flex items-center justify-center text-xs text-[#475569] font-mono"
      >
        // NO DATA
      </div>
    )
  }

  return <div ref={containerRef} style={{ height, width: '100%' }} />
}
