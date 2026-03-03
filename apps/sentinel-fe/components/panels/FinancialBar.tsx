'use client'

// FinancialBar — 3-band Bloomberg Terminal aesthetic
// Band 1: War Premium + Brent + WTI + VIX + OVX + Gold (compact signal cards)
// Band 2: Chokepoints (60%) | Currencies (40%)
// Band 3: Defense equities (horizontally scrollable)
// Footer: freshness dots

import { useState, useEffect, useCallback, useRef } from 'react'
import { useFinancialData } from '@/hooks/useFinancialData'
import type { SourceStatus } from '@/hooks/useFinancialData'
import { useMarketsData } from '@/hooks/useMarketsData'
import type {
  OilFuturesData, OilPriceData, FredData, EquityQuote,
  PortWatchChokepoint, PredictionMarket, RialRateData,
} from '@sentinel/shared'

type Tab = 'financial' | 'markets'

const FM = "'Share Tech Mono', monospace"
const FD = "'Orbitron', monospace"

// ── Pure helpers ───────────────────────────────────────────────────────────────

function sign(v: number)     { return v >= 0 ? '+' : '' }
function pct(v: number)      { return `${sign(v)}${v.toFixed(2)}%` }
function pctColor(v: number) { return v > 0 ? '#26a69a' : v < 0 ? '#ef5350' : '#475569' }

function fmtAge(ms: number) {
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60)    return `${s}s`
  if (s < 3600)  return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

function ageColor(ms: number) {
  const m = (Date.now() - ms) / 60_000
  return m < 15 ? '#22c55e' : m < 60 ? '#eab308' : '#ef4444'
}

function fmtClose(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const days = Math.floor((d.getTime() - Date.now()) / 86_400_000)
  if (days < 0) return 'CLOSED'
  if (days === 0) return 'TODAY'
  if (days === 1) return 'TMRW'
  return `${days}d`
}

function fmtVol(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

// Daily-open for 24h currency change (localStorage)
function getDailyOpen(pair: string, current: number): number {
  if (typeof localStorage === 'undefined') return current
  const today = new Date().toISOString().slice(0, 10)
  const key   = `finbar:open:${pair}:${today}`
  const s     = localStorage.getItem(key)
  if (s) return parseFloat(s)
  localStorage.setItem(key, String(current))
  return current
}

// Rolling currency history for 7-day sparkline (localStorage, hourly sample)
function getCurrencyHistory(pair: string, current: number): number[] {
  if (typeof localStorage === 'undefined') return [current]
  const key = `finbar:chist:${pair}`
  const raw = localStorage.getItem(key)
  const arr: { ts: number; v: number }[] = raw ? (JSON.parse(raw) as { ts: number; v: number }[]) : []
  const now = Date.now()
  const last = arr[arr.length - 1]?.ts ?? 0
  if (now - last > 3_600_000) {
    arr.push({ ts: now, v: current })
    if (arr.length > 168) arr.splice(0, arr.length - 168) // 7 days × 24h
    localStorage.setItem(key, JSON.stringify(arr))
  }
  return arr.length ? arr.map(e => e.v) : [current]
}

// Rolling chokepoint disruption history
function getCpHistory(name: string, current: number): number[] {
  if (typeof localStorage === 'undefined') return [current]
  const key = `finbar:cp:${name}`
  const raw = localStorage.getItem(key)
  const arr: { ts: number; v: number }[] = raw ? (JSON.parse(raw) as { ts: number; v: number }[]) : []
  const now = Date.now()
  const last = arr[arr.length - 1]?.ts ?? 0
  if (now - last > 3_600_000) {
    arr.push({ ts: now, v: current })
    if (arr.length > 12) arr.splice(0, arr.length - 12)
    localStorage.setItem(key, JSON.stringify(arr))
  }
  return arr.map(e => e.v)
}

// ── SVG primitives ─────────────────────────────────────────────────────────────

function Sparkline({ values, width, height, color, fill }: {
  values: number[]
  width:  number
  height: number
  color:  string
  fill?:  boolean
}) {
  if (values.length < 2) return <svg width={width} height={height} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const rng = max - min || 1
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width
    const y = height - ((v - min) / rng) * (height - 2) - 1
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const polyline = pts.join(' ')
  if (fill) {
    const area = `${pts[0]!.split(',')[0]},${height} ` + polyline + ` ${pts[pts.length - 1]!.split(',')[0]},${height}`
    return (
      <svg width={width} height={height} style={{ display: 'block' }}>
        <polygon points={area} fill={`${color}18`} />
        <polyline points={polyline} fill="none" stroke={color} strokeWidth={1.2} strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={polyline} fill="none" stroke={color} strokeWidth={1.2} strokeLinejoin="round" />
    </svg>
  )
}

function FuturesCurve({ f, width, height }: { f: OilFuturesData; width: number; height: number }) {
  const pts  = [f.spot, f.m2, f.m3, f.m4].filter(v => v > 0)
  const lbl  = ['SPOT', 'M2', 'M3', 'M4']
  if (pts.length < 2) return null
  const min  = Math.min(...pts)
  const max  = Math.max(...pts)
  const rng  = max - min || 1
  // backwardation = spot > future prices (war premium = futures below spot)
  const back = f.m4 < f.spot
  const col  = back ? '#ef5350' : '#26a69a'
  const xs   = pts.map((_, i) => (i / (pts.length - 1)) * width)
  const ys   = pts.map(v => (height - 10) - ((v - min) / rng) * (height - 18) - 2)
  const poly = xs.map((x, i) => `${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={poly} fill="none" stroke={col} strokeWidth={1.5} strokeLinejoin="round" />
      {xs.map((x, i) => (
        <g key={i}>
          <circle cx={x} cy={ys[i]} r={2} fill={col} />
          <text x={x} y={height - 1} textAnchor="middle" style={{ fontSize: 6, fill: '#475569', fontFamily: FM }}>{lbl[i]}</text>
        </g>
      ))}
    </svg>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Skel({ style, hasError }: { style?: React.CSSProperties; hasError?: boolean }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      borderRadius: 2,
      animation: 'pulse-opacity 1.5s ease-in-out infinite',
      position: 'relative',
      ...style,
    }}>
      {hasError && (
        <span style={{
          position: 'absolute', bottom: 3, left: 4,
          fontSize: 6, color: '#ef4444', fontFamily: FM, letterSpacing: '0.08em',
          display: 'flex', alignItems: 'center', gap: 2,
        }}>
          <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
          ERR
        </span>
      )}
    </div>
  )
}

// ── Band 1: Signal Cards ───────────────────────────────────────────────────────

// Compact card used in Band 1 (fixed width, 80px tall)
function B1Card({ label, children, width = 130 }: { label: string; children: React.ReactNode; width?: number }) {
  return (
    <div style={{
      width, flexShrink: 0, height: 76,
      background: '#0d1224',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 3, padding: '5px 8px',
      display: 'flex', flexDirection: 'column', gap: 2,
      overflow: 'hidden',
    }}>
      <div style={{ fontSize: 7, color: '#475569', fontFamily: FM, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function WarPremiumCard({ status, f }: { status: SourceStatus; f: OilFuturesData | null }) {
  if (status === 'unconfigured') return null
  if (status !== 'ok' || !f) {
    return (
      <B1Card label="War Premium" width={188}>
        <Skel style={{ flex: 1 }} hasError={status === 'error'} />
      </B1Card>
    )
  }
  const wp  = f.war_premium ?? 0
  const abs = Math.abs(wp)
  const col = abs > 5 ? '#ef4444' : abs > 2 ? '#f97316' : abs > 0.5 ? '#eab308' : '#22c55e'
  const lbl = abs > 5 ? 'SEVERE' : abs > 2 ? 'ELEVATED' : abs > 0.5 ? 'MODERATE' : 'CONTANGO'
  return (
    <B1Card label="War Premium · Oil Futures" width={188}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontFamily: FD, fontSize: 15, fontWeight: 700, color: col, lineHeight: 1 }}>
            {wp >= 0 ? '+' : ''}{wp.toFixed(2)}%
          </span>
          <span style={{
            fontSize: 7, color: col, background: `${col}20`,
            border: `1px solid ${col}44`, borderRadius: 2,
            padding: '1px 4px', fontFamily: FM, letterSpacing: '0.08em',
            alignSelf: 'flex-start',
          }}>{lbl}</span>
        </div>
        <FuturesCurve f={f} width={100} height={44} />
      </div>
    </B1Card>
  )
}

function OilCard({ label, price, change, history }: { label: string; price: number; change: number; history: number[] }) {
  const col = pctColor(change)
  const hist = history.length > 1 ? history : null
  return (
    <B1Card label={label}>
      <span style={{ fontFamily: FD, fontSize: 16, fontWeight: 700, color: '#e2e8f0', lineHeight: 1 }}>
        ${price.toFixed(1)}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <span style={{ fontSize: 9, fontFamily: FM, color: col }}>{sign(change)}{change.toFixed(2)}</span>
        {hist && <Sparkline values={hist.slice(-20)} width={60} height={22} color={col} fill />}
      </div>
    </B1Card>
  )
}

function OilPriceSection({ status, oil }: { status: SourceStatus; oil: OilPriceData | null }) {
  if (status === 'unconfigured') return null
  if (status !== 'ok' || !oil) {
    return (
      <>
        <B1Card label="Brent Crude"><Skel style={{ flex: 1 }} hasError={status === 'error'} /></B1Card>
        <B1Card label="WTI Crude"><Skel style={{ flex: 1 }} hasError={status === 'error'} /></B1Card>
      </>
    )
  }
  return (
    <>
      <OilCard label="Brent Crude · EIA" price={oil.brent} change={oil.brent_change} history={oil.history} />
      <OilCard label="WTI · EIA"         price={oil.wti}   change={oil.wti_change}   history={oil.history} />
    </>
  )
}

const FRED_CFG: Record<string, { label: string; sevColor: (v: number) => string }> = {
  VIXCLS: {
    label: 'VIX · CBOE Fear',
    sevColor: v => v > 40 ? '#ef4444' : v > 25 ? '#f97316' : v > 15 ? '#eab308' : '#22c55e',
  },
  OVXCLS: {
    label: 'OVX · Oil Volatility',
    sevColor: v => v > 60 ? '#ef4444' : v > 40 ? '#f97316' : v > 25 ? '#eab308' : '#22c55e',
  },
  GOLDAMGBD228NLBM: {
    label: 'Gold · LBMA',
    sevColor: () => '#eab308',
  },
}

function FredCard({ status, series }: { status: SourceStatus; series: FredData | null }) {
  const cfg = series ? (FRED_CFG[series.series_id] ?? { label: series.series_id, sevColor: () => '#94a3b8' }) : null
  const label = cfg?.label ?? 'FRED'
  if (status === 'unconfigured') return null
  if (status !== 'ok' || !series || !cfg) {
    return <B1Card label={label}><Skel style={{ flex: 1 }} hasError={status === 'error'} /></B1Card>
  }
  const col  = cfg.sevColor(series.value)
  const hist = series.history?.map(h => h.value) ?? []
  const chgCol = pctColor(series.change_pct)
  return (
    <B1Card label={label}>
      <span style={{ fontFamily: FD, fontSize: 15, fontWeight: 700, color: col, lineHeight: 1 }}>
        {series.series_id === 'GOLDAMGBD228NLBM' ? `$${series.value.toFixed(0)}` : series.value.toFixed(1)}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <span style={{ fontSize: 9, fontFamily: FM, color: chgCol }}>{pct(series.change_pct)}</span>
        {hist.length > 1 && <Sparkline values={hist.slice(-20)} width={58} height={22} color={chgCol} fill />}
      </div>
    </B1Card>
  )
}

// ── Band 2 Left: Chokepoints ───────────────────────────────────────────────────

const CP_COL: Record<string, string> = { NORMAL: '#22c55e', ELEVATED: '#eab308', DISRUPTED: '#ef4444' }
const CP_LABEL: Record<string, string> = {
  'Hormuz': 'HORMUZ', 'Strait of Hormuz': 'HORMUZ',
  'Suez': 'SUEZ', 'Suez Canal': 'SUEZ',
  'Bab el-Mandeb': 'BAB-EL-MANDEB', 'Bab-el-Mandeb': 'BAB-EL-MANDEB',
  'Malacca': 'MALACCA', 'Strait of Malacca': 'MALACCA',
  'Singapore': 'SINGAPORE',
}

function ChokepointCard({ cp }: { cp: PortWatchChokepoint }) {
  const col     = CP_COL[cp.status] ?? '#94a3b8'
  const name    = CP_LABEL[cp.name] ?? cp.name.replace('Strait of ', '').replace(' Canal', '').toUpperCase()
  const history = getCpHistory(cp.name, cp.disruption_index)
  const idxPct  = (cp.disruption_index * 100).toFixed(1)

  return (
    <div style={{
      flex: 1, minWidth: 120,
      background: '#0d1224',
      border: `1px solid ${col}33`,
      borderRadius: 3, padding: '6px 8px',
      display: 'flex', flexDirection: 'column', gap: 3,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 8, color: '#475569', fontFamily: FM, letterSpacing: '0.12em' }}>{name}</span>
        <span style={{
          fontSize: 7, color: col, background: `${col}18`,
          border: `1px solid ${col}44`, borderRadius: 2,
          padding: '1px 4px', fontFamily: FM, letterSpacing: '0.08em',
        }}>{cp.status}</span>
      </div>
      {/* Main value + sparkline */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontFamily: FD, fontSize: 14, fontWeight: 700, color: col, lineHeight: 1 }}>
            {idxPct}%
          </span>
          <span style={{ fontSize: 7, color: '#475569', fontFamily: FM }}>DISRUPTION IDX</span>
        </div>
        {history.length > 1 && <Sparkline values={history} width={54} height={28} color={col} fill />}
      </div>
      {/* Vessel count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 8, color: '#94a3b8', fontFamily: FM }}>
          {cp.vessel_count > 0 ? `${cp.vessel_count} vessels in transit` : 'AIS data pending'}
        </span>
      </div>
    </div>
  )
}

function ChokepointsPanel({ status, portwatch }: {
  status: SourceStatus
  portwatch: import('@sentinel/shared').PortWatchData | null
}) {
  if (status === 'unconfigured') return null

  if (status !== 'ok' || !portwatch) {
    const hasErr = status === 'error'
    return (
      <div style={{ display: 'flex', gap: 6, flex: 1 }}>
        {['HORMUZ', 'SUEZ', 'BAB-EL-MANDEB'].map(n => (
          <div key={n} style={{ flex: 1, minWidth: 120, background: '#0d1224', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 3, padding: 8 }}>
            <div style={{ fontSize: 8, color: '#475569', fontFamily: FM, letterSpacing: '0.12em', marginBottom: 6 }}>{n}</div>
            <Skel style={{ height: 40 }} hasError={hasErr} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 6, flex: 1 }}>
      {portwatch.chokepoints.map(cp => <ChokepointCard key={cp.name} cp={cp} />)}
    </div>
  )
}

// ── Band 2 Right: Currencies ───────────────────────────────────────────────────

const THEATER_PAIRS: Record<string, string[]> = {
  'us-iran':        ['IRR/USD', 'ILS/USD'],
  'israel-gaza':    ['ILS/USD', 'EUR/USD'],
  'russia-ukraine': ['RUB/USD', 'EUR/USD'],
}

function CurrenciesPanel({ slug, status, currencies, rialStatus, rial }: {
  slug:        string
  status:      SourceStatus
  currencies:  import('@sentinel/shared').CurrenciesData | null
  rialStatus:  SourceStatus
  rial:        RialRateData | null
}) {
  const pairs = THEATER_PAIRS[slug] ?? ['ILS/USD', 'EUR/USD']

  // Build rows
  type Row = { pair: string; rate: number; change: number; alert: boolean; label?: string; history: number[] }
  const rows: Row[] = []

  for (const pair of pairs) {
    if (pair === 'IRR/USD' && rial && rialStatus === 'ok') {
      const r    = rial.usd_irr
      const open = getDailyOpen('IRR/USD', r)
      const chg  = open ? ((r - open) / open) * 100 : (rial.change_24h ?? 0)
      const hist = getCurrencyHistory('IRR/USD', r)
      rows.push({ pair, rate: r, change: chg, alert: Math.abs(chg) > 5, label: 'PARALLEL MKT', history: hist })
    } else if (currencies && status === 'ok') {
      const found = currencies.rates.find(r => r.pair === pair)
      if (found) {
        const open = getDailyOpen(pair, found.rate)
        const chg  = open ? ((found.rate - open) / open) * 100 : 0
        const hist = getCurrencyHistory(pair, found.rate)
        rows.push({ pair, rate: found.rate, change: chg, alert: Math.abs(chg) >= 2, history: hist })
      }
    }
  }

  const anyOk = status === 'ok' || rialStatus === 'ok'

  return (
    <div style={{
      width: '38%', flexShrink: 0,
      background: '#0d1224',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 3, padding: '6px 8px',
      display: 'flex', flexDirection: 'column', gap: 0,
    }}>
      {/* Header */}
      <div style={{
        fontSize: 7, color: '#475569', fontFamily: FM, letterSpacing: '0.12em',
        textTransform: 'uppercase', marginBottom: 6,
      }}>
        Currencies · 24h Δ
      </div>

      {!anyOk && (
        <Skel style={{ flex: 1 }} hasError={status === 'error'} />
      )}

      {anyOk && rows.map(r => {
        const alertCol = r.alert ? '#f97316' : '#e2e8f0'
        const cCol     = pctColor(r.change)
        const isIRR    = r.pair === 'IRR/USD'
        // Format rate: IRR → integer with commas, others → 4 decimal places
        const rateStr  = isIRR
          ? Math.round(r.rate).toLocaleString()
          : r.rate.toFixed(4)
        // Change: always 2dp with sign, grey if effectively zero
        const changeStr = `${r.change >= 0 ? '+' : ''}${r.change.toFixed(2)}%`
        const changeCol = Math.abs(r.change) < 0.01 ? '#475569' : cCol

        return (
          <div key={r.pair} style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(60px,auto) 1fr auto',
            alignItems: 'center',
            gap: '0 8px',
            paddingBottom: 6,
          }}>
            {/* Col 1: pair + sublabel */}
            <div>
              <div style={{
                fontSize: 9, fontFamily: FM, color: alertCol,
                display: 'flex', alignItems: 'center', gap: 2,
                letterSpacing: '0.04em',
              }}>
                {r.alert && <span>⚡</span>}
                {r.pair}
              </div>
              {r.label && (
                <div style={{ fontSize: 6, color: '#475569', fontFamily: FM, letterSpacing: '0.08em' }}>
                  {r.label}
                </div>
              )}
            </div>

            {/* Col 2: rate (left) + change (right) on same line */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontSize: 11, fontFamily: FM, color: '#e2e8f0', letterSpacing: '0.02em' }}>
                {rateStr}
              </span>
              <span style={{ fontSize: 8, fontFamily: FM, color: changeCol }}>
                {changeStr}
              </span>
            </div>

            {/* Col 3: sparkline (or empty placeholder) */}
            <div>
              {r.history.length > 1
                ? <Sparkline values={r.history} width={42} height={22} color={changeCol} />
                : <div style={{ width: 42, height: 22 }} />
              }
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Band 3: Defense Equities ───────────────────────────────────────────────────

const MSTATUS_COL: Record<string, string> = {
  REGULAR: '#22c55e', PRE_MARKET: '#eab308', POST_MARKET: '#f97316', CLOSED: '#475569',
}

function EquityChip({ q }: { q: EquityQuote }) {
  const col = pctColor(q.change_pct ?? 0)
  return (
    <div style={{
      flexShrink: 0, width: 100,
      background: '#0d1224',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 3, padding: '5px 7px',
      display: 'flex', flexDirection: 'column', gap: 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 9, fontFamily: FM, color: '#e2e8f0', fontWeight: 700 }}>{q.ticker}</span>
        <span style={{ fontSize: 8, fontFamily: FM, color: col }}>{sign(q.change_pct ?? 0)}{(q.change_pct ?? 0).toFixed(1)}%</span>
      </div>
      <span style={{ fontSize: 10, fontFamily: FD, fontWeight: 700, color: '#94a3b8' }}>
        ${(q.price ?? 0).toFixed(0)}
      </span>
      <span style={{ fontSize: 7, color: '#475569', fontFamily: FM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {q.name}
      </span>
    </div>
  )
}

function EquitiesStrip({ status, equities }: {
  status:   SourceStatus
  equities: import('@sentinel/shared').EquitiesData | null
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: 1 | -1) => {
    scrollRef.current?.scrollBy({ left: dir * 220, behavior: 'smooth' })
  }

  if (status === 'unconfigured') return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
      {/* Market status badge */}
      {equities && (
        <div style={{
          flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2,
          paddingRight: 8, borderRight: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{ fontSize: 7, color: '#475569', fontFamily: FM, letterSpacing: '0.1em' }}>MARKET</span>
          <span style={{ fontSize: 7, fontFamily: FM, color: MSTATUS_COL[equities.market_status] ?? '#475569' }}>
            ● {equities.market_status.replace('_', ' ')}
          </span>
        </div>
      )}

      <button onClick={() => scroll(-1)} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 11, color: '#475569', padding: '0 2px', flexShrink: 0,
      }}>‹</button>

      <div ref={scrollRef} style={{
        flex: 1, display: 'flex', gap: 5,
        overflowX: 'auto', scrollbarWidth: 'none',
        alignItems: 'center',
      }}>
        {status !== 'ok' || !equities ? (
          [0,1,2,3,4,5,6,7,8].map(i => (
            <div key={i} style={{ width: 100, flexShrink: 0, height: 54, background: '#0d1224', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 3 }}>
              <Skel style={{ width: '100%', height: '100%' }} hasError={status === 'error'} />
            </div>
          ))
        ) : (
          equities.quotes.map(q => <EquityChip key={q.ticker} q={q} />)
        )}
      </div>

      <button onClick={() => scroll(1)} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 11, color: '#475569', padding: '0 2px', flexShrink: 0,
      }}>›</button>
    </div>
  )
}

// ── Prediction Market card ─────────────────────────────────────────────────────

const SRC_COL: Record<string, string> = { polymarket: '#8b5cf6', kalshi: '#0ea5e9' }

function MarketCard({ m }: { m: PredictionMarket }) {
  const p   = m.probability ?? 0
  const col = p >= 0.7 ? '#22c55e' : p >= 0.4 ? '#eab308' : '#ef4444'
  const src = SRC_COL[m.source] ?? '#94a3b8'
  return (
    <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', flexShrink: 0, display: 'flex' }}>
      <div style={{
        width: 200,
        background: '#0d1224',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 3, padding: '5px 8px',
        display: 'flex', flexDirection: 'column', gap: 3, cursor: 'pointer',
      }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontSize: 7, color: src, background: `${src}22`,
            border: `1px solid ${src}44`, borderRadius: 2,
            padding: '1px 4px', fontFamily: FM, letterSpacing: '0.06em',
          }}>{m.source}</span>
          <span style={{ fontSize: 7, fontFamily: FM, color: fmtClose(m.close_time) === 'TODAY' ? '#f97316' : '#475569' }}>
            {fmtClose(m.close_time)}
          </span>
        </div>
        <div style={{
          fontSize: 9, fontFamily: FM, color: '#e2e8f0',
          lineHeight: 1.3, display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {m.question}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontFamily: FD, color: col, fontWeight: 700 }}>{Math.round(p * 100)}% YES</span>
          <span style={{ fontSize: 7, fontFamily: FM, color: '#475569' }}>{fmtVol(m.volume_24h)}/24h</span>
        </div>
      </div>
    </a>
  )
}

// ── Freshness footer ───────────────────────────────────────────────────────────

interface FEntry { label: string; updatedAt: number | null; status: SourceStatus }

function FreshnessFooter({ entries }: { entries: FEntry[] }) {
  const visible = entries.filter(e => e.status === 'ok' && e.updatedAt)
  if (!visible.length) return null
  return (
    <div style={{
      height: 20, flexShrink: 0,
      borderTop: '1px solid rgba(255,255,255,0.05)',
      display: 'flex', alignItems: 'center',
      padding: '0 10px', gap: 12, overflowX: 'auto',
    }}>
      <span style={{ fontSize: 7, color: '#2d3748', fontFamily: FM, letterSpacing: '0.1em', flexShrink: 0 }}>
        SOURCES
      </span>
      {visible.map(e => (
        <div key={e.label} style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
          <span style={{ width: 4, height: 4, borderRadius: '50%', display: 'inline-block', background: ageColor(e.updatedAt!) }} />
          <span style={{ fontSize: 7, color: '#475569', fontFamily: FM }}>{e.label}</span>
          <span style={{ fontSize: 7, color: '#94a3b8', fontFamily: FM }}>●{fmtAge(e.updatedAt!)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props { slug: string }

export function FinancialBar({ slug }: Props) {
  const [tab, setTab] = useState<Tab>('financial')
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem('finbar:collapsed') === '1'
  })

  useEffect(() => {
    const s = localStorage.getItem('finbar:collapsed')
    if (s !== null) setCollapsed(s === '1')
  }, [])

  const toggleCollapse = useCallback(() => {
    setCollapsed(c => {
      const next = !c
      if (typeof localStorage !== 'undefined') localStorage.setItem('finbar:collapsed', next ? '1' : '0')
      return next
    })
  }, [])

  const { vix, ovx, gold, equities, currencies, portwatch, futures, oil, rial } = useFinancialData()
  const { data: marketsData, loading: marketsLoading } = useMarketsData(slug)
  const markets = marketsData?.markets ?? []

  const freshnessEntries: FEntry[] = [
    { label: 'EIA',       updatedAt: oil.data?.updated_at       ?? null, status: oil.status },
    { label: 'FRED',      updatedAt: vix.data?.updated_at       ?? null, status: vix.status },
    { label: 'Equities',  updatedAt: equities.data?.updated_at  ?? null, status: equities.status },
    { label: 'FX',        updatedAt: currencies.data?.updated_at ?? null, status: currencies.status },
    { label: 'PortWatch', updatedAt: portwatch.data?.updated_at  ?? null, status: portwatch.status },
    { label: 'Polymarket',updatedAt: marketsData?.updated_at     ?? null, status: marketsData ? 'ok' : 'loading' },
  ]
  if (rial.status === 'ok') {
    freshnessEntries.splice(1, 0, { label: 'Bonbast', updatedAt: rial.data?.updated_at ?? null, status: rial.status })
  }

  // Heights (financial tab):
  //   header 30 + border 1 + band1 88 + border 1 + band2 110 + border 1 + band3 76 + freshness 20 = 327px
  // Heights (markets tab):
  //   header 30 + card row 110 = 140px (avoid huge empty space)
  const PANEL_H = tab === 'markets' ? 140 : 330

  return (
    <div style={{
      flexShrink: 0,
      borderTop: '1px solid rgba(255,255,255,0.08)',
      background: 'var(--bg-surface)',
      display: 'flex', flexDirection: 'column',
      height: collapsed ? 30 : PANEL_H,
      transition: 'height 0.2s ease',
      overflow: 'hidden',
    }}>
      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', height: 30, flexShrink: 0,
        borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.05)',
        paddingLeft: 6,
      }}>
        <span style={{ fontSize: 8, color: '#475569', fontFamily: FM, letterSpacing: '0.12em', padding: '0 8px', flexShrink: 0 }}>
          ◆ INTEL
        </span>
        {(['financial', 'markets'] as Tab[]).map(t => (
          <button key={t}
            onClick={() => { setTab(t); if (collapsed) toggleCollapse() }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '0 10px', height: 30,
              fontSize: 8, fontFamily: FM, letterSpacing: '0.12em', textTransform: 'uppercase',
              color: tab === t && !collapsed ? '#e2e8f0' : '#475569',
              borderBottom: tab === t && !collapsed ? '2px solid #00b0ff' : '2px solid transparent',
            }}
          >
            {t === 'financial' ? 'FINANCIAL' : `MARKETS${markets.length > 0 ? ` · ${markets.length}` : ''}`}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={toggleCollapse} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '0 10px', height: 30, fontSize: 9, color: '#475569', fontFamily: FM,
        }} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? '▲' : '▼'}
        </button>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      {!collapsed && tab === 'financial' && (
        <>
          {/* Band 1 — price signals */}
          <div style={{
            flexShrink: 0, height: 88,
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 8px', overflowX: 'auto',
          }}>
            <WarPremiumCard status={futures.status} f={futures.data} />
            <OilPriceSection status={oil.status} oil={oil.data} />
            <FredCard status={vix.status}  series={vix.data}  />
            <FredCard status={ovx.status}  series={ovx.data}  />
            <FredCard status={gold.status} series={gold.data} />
          </div>

          {/* Band 2 — chokepoints + currencies */}
          <div style={{
            flexShrink: 0, height: 110,
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            display: 'flex', gap: 6, padding: '6px 8px',
          }}>
            <ChokepointsPanel status={portwatch.status} portwatch={portwatch.data} />
            <CurrenciesPanel
              slug={slug}
              status={currencies.status}
              currencies={currencies.data}
              rialStatus={rial.status}
              rial={rial.data}
            />
          </div>

          {/* Band 3 — defense equities */}
          <div style={{
            flexShrink: 0, height: 76,
            display: 'flex', alignItems: 'center', padding: '0 8px',
          }}>
            <EquitiesStrip status={equities.status} equities={equities.data} />
          </div>

          <FreshnessFooter entries={freshnessEntries} />
        </>
      )}

      {!collapsed && tab === 'markets' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'stretch', gap: 6, padding: '6px 8px', overflowX: 'auto', overflowY: 'hidden' }}>
          {marketsLoading && (
            <span style={{ fontSize: 9, fontFamily: FM, color: '#475569', alignSelf: 'center' }}>loading markets…</span>
          )}
          {!marketsLoading && markets.length === 0 && (
            <span style={{ fontSize: 9, fontFamily: FM, color: '#475569', alignSelf: 'center' }}>no relevant markets found</span>
          )}
          {markets.map(m => <MarketCard key={m.id} m={m} />)}
        </div>
      )}
    </div>
  )
}
