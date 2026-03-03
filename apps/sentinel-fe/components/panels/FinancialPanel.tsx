'use client'

// FinancialPanel — Sprint 2 Financial Intelligence Layer
// Shows: War Premium (oil futures backwardation), FRED macro signals (VIX/OVX/Gold),
// defense sector equities, ILS/RUB/EUR currency rates, IMF PortWatch chokepoints.
//
// Only rendered on us-iran conflict (passed as prop from parent).

import { useFinancialData } from '@/hooks/useFinancialData'
import { FinancialChart }   from './FinancialChart'
import type { OilFuturesData, FredData, EquityQuote, CurrencyRate, PortWatchChokepoint } from '@sentinel/shared'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtChange(v: number, suffix = '%') {
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}${suffix}`
}

function changeColor(v: number): string {
  if (v > 0)  return '#22c55e'
  if (v < 0)  return '#ef4444'
  return '#94a3b8'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function WarPremiumBadge({ futures }: { futures: OilFuturesData }) {
  const wp   = futures.war_premium ?? 0
  const abs  = Math.abs(wp)
  const color = abs > 5 ? '#ef4444' : abs > 2 ? '#f97316' : abs > 0 ? '#eab308' : '#22c55e'
  const label = abs > 5 ? 'SEVERE' : abs > 2 ? 'ELEVATED' : abs > 0 ? 'MODERATE' : 'NORMAL'

  return (
    <div className="flex flex-col gap-1 p-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono uppercase tracking-widest text-[#94a3b8]">
          WAR PREMIUM (OIL)
        </span>
        <span
          className="text-[11px] font-mono uppercase tracking-widest px-1.5 py-0.5"
          style={{
            color,
            background: `${color}22`,
            border:     `1px solid ${color}66`,
            borderRadius: 2,
          }}
        >
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-mono" style={{ color }}>
          {wp >= 0 ? '+' : ''}{wp.toFixed(2)}%
        </span>
        <span className="text-xs text-[#475569] font-mono">backwardation (M1–M3)</span>
      </div>
      <div className="grid grid-cols-4 gap-1 mt-1">
        {([
          ['SPOT', futures.spot  ?? 0],
          ['M2',   futures.m2    ?? 0],
          ['M3',   futures.m3    ?? 0],
          ['M4',   futures.m4    ?? 0],
        ] as [string, number][]).map(([k, v]) => (
          <div key={k} className="flex flex-col items-center">
            <span className="text-[10px] text-[#475569] font-mono">{k}</span>
            <span className="text-[12px] text-[#e2e8f0] font-mono">{v > 0 ? `$${v.toFixed(2)}` : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FredRow({ series }: { series: FredData }) {
  const value      = series.value      ?? 0
  const change_pct = series.change_pct ?? 0
  return (
    <div className="flex items-center gap-2 py-1.5 px-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-mono text-[#e2e8f0]">
            {value.toFixed(2)}
          </span>
          <span
            className="text-[11px] font-mono"
            style={{ color: changeColor(change_pct) }}
          >
            {fmtChange(change_pct)}
          </span>
        </div>
        <div className="text-[10px] font-mono text-[#475569] truncate">
          {series.series_id}
        </div>
      </div>
      <div style={{ width: 80 }}>
        <FinancialChart data={series.history ?? []} height={32} color={changeColor(series.change_pct)} />
      </div>
    </div>
  )
}

function EquityRow({ q }: { q: EquityQuote }) {
  const price      = q.price      ?? 0
  const change_pct = q.change_pct ?? 0
  return (
    <div className="flex items-center justify-between py-1 px-3"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-mono text-[#e2e8f0] w-8">{q.ticker}</span>
        <span className="text-[10px] font-mono text-[#475569] truncate max-w-[100px]">{q.name}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[12px] font-mono text-[#e2e8f0]">${price.toFixed(2)}</span>
        <span className="text-[11px] font-mono" style={{ color: changeColor(change_pct) }}>
          {fmtChange(change_pct)}
        </span>
      </div>
    </div>
  )
}

function CurrencyRow({ r }: { r: CurrencyRate }) {
  const rate       = r.rate       ?? 0
  const change_pct = r.change_pct ?? 0
  return (
    <div className="flex items-center justify-between py-1.5 px-3"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-mono text-[#e2e8f0]">{r.pair}</span>
        {r.alert && (
          <span className="text-[10px] font-mono px-1 py-0.5"
            style={{ color: '#f97316', background: '#f9731622', border: '1px solid #f9731666', borderRadius: 2 }}
          >
            ALERT
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[12px] font-mono text-[#e2e8f0]">{rate.toFixed(4)}</span>
        <span className="text-[11px] font-mono" style={{ color: changeColor(change_pct) }}>
          {fmtChange(change_pct)}
        </span>
      </div>
    </div>
  )
}

const STATUS_COLOR: Record<string, string> = {
  NORMAL:    '#22c55e',
  ELEVATED:  '#eab308',
  DISRUPTED: '#ef4444',
}

function ChokeRow({ cp }: { cp: PortWatchChokepoint }) {
  const color = STATUS_COLOR[cp.status] ?? '#94a3b8'
  return (
    <div className="flex items-center justify-between py-1.5 px-3"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
    >
      <div className="flex items-center gap-2">
        <span
          className="text-[10px] font-mono px-1 py-0.5"
          style={{ color, background: `${color}22`, border: `1px solid ${color}66`, borderRadius: 2 }}
        >
          {cp.status}
        </span>
        <span className="text-[12px] font-mono text-[#e2e8f0]">{cp.name}</span>
      </div>
      <div className="text-right">
        <div className="text-[12px] font-mono text-[#94a3b8]">
          {(cp.disruption_index * 100).toFixed(1)}%
        </div>
        <div className="text-[10px] font-mono text-[#475569]">{cp.vessel_count} vessels</div>
      </div>
    </div>
  )
}

// ── Panel header ──────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="px-3 pt-2 pb-1">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[#475569]">
          {title}
        </span>
      </div>
      {children}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function FinancialPanel() {
  const { vix, ovx, gold, equities, currencies, portwatch, futures, loading } = useFinancialData()

  const marketStatusColor = (s: string) => {
    if (s === 'REGULAR')     return '#22c55e'
    if (s === 'PRE_MARKET')  return '#eab308'
    if (s === 'POST_MARKET') return '#f97316'
    return '#475569'
  }

  return (
    <div
      className="flex flex-col"
      style={{
        background:   'var(--bg-surface, #0d1224)',
        border:       '1px solid rgba(255,255,255,0.08)',
        borderRadius: 4,
        fontSize:     13,
        overflow:     'hidden',
      }}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <span className="text-[11px] font-mono uppercase tracking-widest text-[#94a3b8]">
          FINANCIAL INTELLIGENCE
        </span>
        {loading && (
          <span className="text-[10px] font-mono text-[#475569]">LOADING…</span>
        )}
      </div>

      {/* War Premium */}
      {futures && <WarPremiumBadge futures={futures} />}
      {!futures && !loading && (
        <div className="px-3 py-2 text-[11px] font-mono text-[#475569]">
          // WAR PREMIUM — EIA_API_KEY not configured
        </div>
      )}

      {/* FRED Macro Signals */}
      {(vix || ovx || gold) && (
        <Section title="MACRO SIGNALS">
          {vix  && <FredRow series={vix}  />}
          {ovx  && <FredRow series={ovx}  />}
          {gold && <FredRow series={gold} />}
        </Section>
      )}

      {/* Defense Equities */}
      {equities && (
        <Section title={`DEFENSE EQUITIES · ${equities.market_status}`}>
          <div style={{ paddingBottom: 4 }}>
            {equities.quotes.map(q => <EquityRow key={q.ticker} q={q} />)}
          </div>
          <div className="px-3 pb-2">
            <span
              className="text-[10px] font-mono"
              style={{ color: marketStatusColor(equities.market_status) }}
            >
              ● {equities.market_status.replace('_', ' ')}
            </span>
          </div>
        </Section>
      )}

      {/* Currency Signals */}
      {currencies && (
        <Section title="CURRENCY SIGNALS">
          {currencies.rates.map(r => <CurrencyRow key={r.pair} r={r} />)}
        </Section>
      )}

      {/* IMF PortWatch Chokepoints */}
      {portwatch && (
        <Section title="CHOKEPOINT MONITOR · IMF PORTWATCH">
          {portwatch.chokepoints.map(cp => <ChokeRow key={cp.name} cp={cp} />)}
        </Section>
      )}
    </div>
  )
}
