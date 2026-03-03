'use client'

import { useEffect, useState, useCallback } from 'react'
import type { FredData, EquitiesData, CurrenciesData, PortWatchData, OilFuturesData, OilPriceData, RialRateData } from '@sentinel/shared'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const REFETCH_MS = 10 * 60 * 1000   // 10 min

export type SourceStatus = 'loading' | 'ok' | 'unconfigured' | 'error'

export interface SourceResult<T> {
  data:   T | null
  status: SourceStatus
}

export interface FinancialData {
  vix:        SourceResult<FredData>
  ovx:        SourceResult<FredData>
  gold:       SourceResult<FredData>
  equities:   SourceResult<EquitiesData>
  currencies: SourceResult<CurrenciesData>
  portwatch:  SourceResult<PortWatchData>
  futures:    SourceResult<OilFuturesData>
  oil:        SourceResult<OilPriceData>
  rial:       SourceResult<RialRateData>
}

const LOADING: SourceResult<never> = { data: null, status: 'loading' }

async function fetchSrc<T>(path: string): Promise<SourceResult<T>> {
  try {
    const r = await fetch(`${API}${path}`)
    if (r.status === 202) return { data: null, status: 'unconfigured' }
    if (!r.ok)            return { data: null, status: 'error' }
    const data = await r.json() as T
    return { data, status: 'ok' }
  } catch {
    return { data: null, status: 'error' }
  }
}

export function useFinancialData(): FinancialData {
  const [data, setData] = useState<FinancialData>({
    vix: LOADING, ovx: LOADING, gold: LOADING,
    equities: LOADING, currencies: LOADING,
    portwatch: LOADING, futures: LOADING,
    oil: LOADING, rial: LOADING,
  })

  const load = useCallback(async () => {
    const [vix, ovx, gold, equities, currencies, portwatch, futures, oil, rial] = await Promise.all([
      fetchSrc<FredData>('/api/financial/fred/VIXCLS'),
      fetchSrc<FredData>('/api/financial/fred/OVXCLS'),
      fetchSrc<FredData>('/api/financial/fred/GOLDAMGBD228NLBM'),
      fetchSrc<EquitiesData>('/api/financial/equities'),
      fetchSrc<CurrenciesData>('/api/financial/currencies'),
      fetchSrc<PortWatchData>('/api/signals/portwatch'),
      fetchSrc<OilFuturesData>('/api/financial/oil-futures'),
      fetchSrc<OilPriceData>('/api/economic/oil'),
      fetchSrc<RialRateData>('/api/economic/rial'),
    ])
    setData({ vix, ovx, gold, equities, currencies, portwatch, futures, oil, rial })
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), REFETCH_MS)
    return () => clearInterval(id)
  }, [load])

  return data
}
