'use client'

import { useEffect, useState, useCallback } from 'react'
import type { FredData, EquitiesData, CurrenciesData, PortWatchData, OilFuturesData } from '@sentinel/shared'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const REFETCH_MS = 10 * 60 * 1000   // 10 min

type FredSeries = 'VIXCLS' | 'OVXCLS' | 'GOLDAMGBD228NLBM'

interface FinancialData {
  vix:       FredData | null
  ovx:       FredData | null
  gold:      FredData | null
  equities:  EquitiesData | null
  currencies: CurrenciesData | null
  portwatch: PortWatchData | null
  futures:   OilFuturesData | null
  loading:   boolean
}

async function fetchFred(series: FredSeries): Promise<FredData | null> {
  try {
    const r = await fetch(`${API}/api/financial/fred/${series}`)
    if (!r.ok) return null
    return r.json()
  } catch { return null }
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${API}${path}`)
    if (!r.ok) return null
    return r.json()
  } catch { return null }
}

export function useFinancialData(): FinancialData {
  const [data, setData] = useState<FinancialData>({
    vix: null, ovx: null, gold: null,
    equities: null, currencies: null,
    portwatch: null, futures: null,
    loading: true,
  })

  const load = useCallback(async () => {
    const [vix, ovx, gold, equities, currencies, portwatch, futures] = await Promise.all([
      fetchFred('VIXCLS'),
      fetchFred('OVXCLS'),
      fetchFred('GOLDAMGBD228NLBM'),
      fetchJson<EquitiesData>('/api/financial/equities'),
      fetchJson<CurrenciesData>('/api/financial/currencies'),
      fetchJson<PortWatchData>('/api/signals/portwatch'),
      fetchJson<OilFuturesData>('/api/financial/oil-futures'),
    ])
    setData({ vix, ovx, gold, equities, currencies, portwatch, futures, loading: false })
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), REFETCH_MS)
    return () => clearInterval(id)
  }, [load])

  return data
}
