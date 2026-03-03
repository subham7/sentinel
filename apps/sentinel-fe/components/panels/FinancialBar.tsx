'use client'

// FinancialBar — bottom panel below the map + posture column.
// Tabbed: FINANCIAL INTEL (war premium, oil, rial, FRED, equities, currencies, PortWatch)
//         PREDICTION MARKETS (Polymarket + Kalshi contract cards)
//
// Compact horizontal-scroll layout to minimise vertical real estate.

import { useState } from 'react'
import { useFinancialData } from '@/hooks/useFinancialData'
import { useMarketsData }   from '@/hooks/useMarketsData'
import { FinancialChart }   from './FinancialChart'
import type {
  OilFuturesData, FredData, EquityQuote,
  CurrencyRate, PortWatchChokepoint, PredictionMarket,
} from '@sentinel/shared'

type Tab = 'financial' | 'markets'

// ── Helpers ───────────────────────────────────────────────────────────────────

function chg(v: number, suffix = '%') {
  const s = v >= 0 ? '+' : ''
  return `${s}${v.toFixed(2)}${suffix}`
}
function chgColor(v: number) { return v > 0 ? '#22c55e' : v < 0 ? '#ef4444' : '#94a3b8' }
function fmtVol(v: number) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v}`
}
function fmtClose(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const days = Math.floor((d.getTime() - Date.now()) / 86_400_000)
  if (days < 0)  return 'CLOSED'
  if (days === 0) return 'TODAY'
  if (days === 1) return 'TOMORROW'
  return `${days}d`
}

// ── Compact card shell ────────────────────────────────────────────────────────

function Card({ title, children, width = 140 }: { title: string; children: React.ReactNode; width?: number }) {
  return (
    <div style={{
      width, flexShrink: 0,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 4, padding: '6px 8px',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ fontSize: 9, color: '#475569', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'Share Tech Mono', monospace" }}>
        {title}
      </div>
      {children}
    </div>
  )
}

// ── Financial tab cards ───────────────────────────────────────────────────────

function WarPremiumCard({ f }: { f: OilFuturesData }) {
  const wp    = f.war_premium ?? 0
  const abs   = Math.abs(wp)
  const color = abs > 5 ? '#ef4444' : abs > 2 ? '#f97316' : abs > 0 ? '#eab308' : '#22c55e'
  const label = abs > 5 ? 'SEVERE' : abs > 2 ? 'ELEVATED' : abs > 0 ? 'MODERATE' : 'NORMAL'
  return (
    <Card title="War Premium" width={150}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 18, fontFamily: "'Share Tech Mono', monospace", color, fontWeight: 700 }}>
          {wp >= 0 ? '+' : ''}{wp.toFixed(2)}%
        </span>
        <span style={{
          fontSize: 9, color, background: `${color}22`,
          border: `1px solid ${color}55`, borderRadius: 2, padding: '1px 4px',
          fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.08em',
        }}>{label}</span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {([['M1', f.spot ?? 0], ['M3', f.m3 ?? 0]] as [string, number][]).map(([k, v]) => (
          <div key={k} style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: '#94a3b8' }}>
            {k}: <span style={{ color: '#e2e8f0' }}>{v > 0 ? `$${v.toFixed(1)}` : '—'}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function FredCard({ s }: { s: FredData }) {
  const value = s.value ?? 0
  const chgPct = s.change_pct ?? 0
  return (
    <Card title={s.series_id} width={130}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 16, fontFamily: "'Share Tech Mono', monospace", color: '#e2e8f0' }}>
          {value.toFixed(2)}
        </span>
        <span style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: chgColor(chgPct) }}>
          {chg(chgPct)}
        </span>
      </div>
      <FinancialChart data={s.history ?? []} height={28} color={chgColor(chgPct)} />
    </Card>
  )
}

function EquityCard({ q }: { q: EquityQuote }) {
  const price  = q.price      ?? 0
  const chgPct = q.change_pct ?? 0
  return (
    <Card title={q.ticker} width={110}>
      <div style={{ fontSize: 14, fontFamily: "'Share Tech Mono', monospace", color: '#e2e8f0' }}>
        ${price.toFixed(2)}
      </div>
      <div style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: chgColor(chgPct) }}>
        {chg(chgPct)}
      </div>
    </Card>
  )
}

function CurrenciesCard({ rates }: { rates: CurrencyRate[] }) {
  return (
    <Card title="Currencies" width={160}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {rates.map(r => (
          <div key={r.pair} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: '#e2e8f0' }}>{r.pair}</span>
              {r.alert && (
                <span style={{ fontSize: 8, color: '#f97316', border: '1px solid #f9731655', borderRadius: 2, padding: '0 3px', fontFamily: "'Share Tech Mono', monospace" }}>!</span>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: '#e2e8f0' }}>{(r.rate ?? 0).toFixed(4)}</span>
              <span style={{ fontSize: 9, marginLeft: 4, fontFamily: "'Share Tech Mono', monospace", color: chgColor(r.change_pct ?? 0) }}>{chg(r.change_pct ?? 0)}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

const CP_COLOR: Record<string, string> = { NORMAL: '#22c55e', ELEVATED: '#eab308', DISRUPTED: '#ef4444' }

function ChokeCard({ cp }: { cp: PortWatchChokepoint }) {
  const color = CP_COLOR[cp.status] ?? '#94a3b8'
  return (
    <Card title={cp.name} width={130}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: 9, color, background: `${color}22`, border: `1px solid ${color}55`,
          borderRadius: 2, padding: '1px 4px', fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.08em',
        }}>{cp.status}</span>
        <span style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: '#94a3b8' }}>
          {(cp.disruption_index * 100).toFixed(1)}%
        </span>
      </div>
      <div style={{ fontSize: 9, fontFamily: "'Share Tech Mono', monospace", color: '#475569' }}>
        {cp.vessel_count} vessels
      </div>
    </Card>
  )
}

// ── Market card (horizontal) ─────────────────────────────────────────────────

const SRC_COLOR: Record<string, string> = { polymarket: '#8b5cf6', kalshi: '#0ea5e9' }

function MarketCard({ m }: { m: PredictionMarket }) {
  const p     = m.probability ?? 0
  const color = p >= 0.7 ? '#22c55e' : p >= 0.4 ? '#eab308' : '#ef4444'
  const src   = SRC_COLOR[m.source] ?? '#94a3b8'
  const close = fmtClose(m.close_time)
  return (
    <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', flexShrink: 0 }}>
      <div style={{
        width: 200, background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 4, padding: '6px 8px',
        display: 'flex', flexDirection: 'column', gap: 5, cursor: 'pointer',
        transition: 'background 0.1s',
      }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
      >
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontSize: 9, color: src, background: `${src}22`, border: `1px solid ${src}44`,
            borderRadius: 2, padding: '1px 4px', fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.06em',
          }}>{m.source}</span>
          <span style={{ fontSize: 9, fontFamily: "'Share Tech Mono', monospace", color: close === 'TODAY' ? '#f97316' : '#475569' }}>
            {close}
          </span>
        </div>
        {/* Question */}
        <div style={{
          fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: '#e2e8f0',
          lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {m.question}
        </div>
        {/* Probability + volume */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontFamily: "'Share Tech Mono', monospace", color, fontWeight: 700 }}>
            {Math.round(p * 100)}% YES
          </span>
          <span style={{ fontSize: 9, fontFamily: "'Share Tech Mono', monospace", color: '#475569' }}>
            {fmtVol(m.volume_24h)}/24h
          </span>
        </div>
      </div>
    </a>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  slug:        string
  showOilRial: boolean    // true for us-iran (already has OilWidget + RialWidget above)
}

export function FinancialBar({ slug, showOilRial }: Props) {
  const [tab,       setTab]       = useState<Tab>('financial')
  const [collapsed, setCollapsed] = useState(false)

  const { vix, ovx, gold, equities, currencies, portwatch, futures } = useFinancialData()
  const { data: marketsData, loading: marketsLoading } = useMarketsData(slug)

  const markets = marketsData?.markets ?? []

  return (
    <div style={{
      flexShrink: 0,
      borderTop: '1px solid rgba(255,255,255,0.08)',
      background: '#0a0e1a',
      display: 'flex', flexDirection: 'column',
      height: collapsed ? 30 : 190,
      transition: 'height 0.2s ease',
      overflow: 'hidden',
    }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', alignItems: 'center', height: 30, flexShrink: 0,
        borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.08)',
        paddingLeft: 8, gap: 0,
      }}>
        {(['financial', 'markets'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); if (collapsed) setCollapsed(false) }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '0 12px', height: 30,
              fontSize: 9, fontFamily: "'Share Tech Mono', monospace",
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: tab === t && !collapsed ? '#e2e8f0' : '#475569',
              borderBottom: tab === t && !collapsed ? '2px solid #00b0ff' : '2px solid transparent',
              transition: 'color 0.1s',
            }}
          >
            {t === 'financial' ? 'FINANCIAL INTEL' : `MARKETS${markets.length > 0 ? ` · ${markets.length}` : ''}`}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '0 10px', height: 30,
            fontSize: 10, color: '#475569',
            fontFamily: "'Share Tech Mono', monospace",
          }}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▲' : '▼'}
        </button>
      </div>

      {/* Content */}
      {!collapsed && (
        <div style={{
          flex: 1, overflowX: 'auto', overflowY: 'hidden',
          display: 'flex', alignItems: 'flex-start',
          padding: '8px 10px', gap: 8,
        }}>

          {/* ── FINANCIAL TAB ── */}
          {tab === 'financial' && (
            <>
              {futures    && <WarPremiumCard f={futures} />}
              {vix        && <FredCard s={vix}  />}
              {ovx        && <FredCard s={ovx}  />}
              {gold       && <FredCard s={gold} />}
              {equities   && equities.quotes.map(q => <EquityCard key={q.ticker} q={q} />)}
              {currencies && <CurrenciesCard rates={currencies.rates} />}
              {portwatch  && portwatch.chokepoints.map(cp => <ChokeCard key={cp.name} cp={cp} />)}

              {!futures && !vix && !equities && !currencies && !portwatch && (
                <div style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: '#475569', padding: '8px 4px' }}>
                  // LOADING FINANCIAL DATA…
                </div>
              )}
            </>
          )}

          {/* ── MARKETS TAB ── */}
          {tab === 'markets' && (
            <>
              {marketsLoading && (
                <div style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: '#475569', padding: '8px 4px' }}>
                  // LOADING MARKETS…
                </div>
              )}
              {!marketsLoading && markets.length === 0 && (
                <div style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: '#475569', padding: '8px 4px' }}>
                  // NO RELEVANT MARKETS FOUND
                </div>
              )}
              {markets.map(m => <MarketCard key={m.id} m={m} />)}
            </>
          )}
        </div>
      )}
    </div>
  )
}
