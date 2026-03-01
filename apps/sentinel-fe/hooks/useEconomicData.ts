'use client'

// Fetches oil price + Rial rate from the API.
// Refetches every 30 minutes. Non-fatal on error.

import { useState, useEffect } from 'react'
import type { OilPriceData, RialRateData } from '@sentinel/shared'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const REFETCH_MS = 30 * 60 * 1000  // 30 minutes

export interface EconomicData {
  oil:   OilPriceData | null
  rial:  RialRateData | null
  oilPending:  boolean
  rialPending: boolean
}

export function useEconomicData(): EconomicData {
  const [oil,  setOil]  = useState<OilPriceData | null>(null)
  const [rial, setRial] = useState<RialRateData | null>(null)
  const [oilPending,  setOilPending]  = useState(false)
  const [rialPending, setRialPending] = useState(false)

  async function fetchAll() {
    try {
      const res = await fetch(`${API_BASE}/api/economic/oil`)
      if (res.status === 202) { setOilPending(true) }
      else if (res.ok) { setOil(await res.json() as OilPriceData); setOilPending(false) }
    } catch { /* non-fatal */ }

    try {
      const res = await fetch(`${API_BASE}/api/economic/rial`)
      if (res.status === 202) { setRialPending(true) }
      else if (res.ok) { setRial(await res.json() as RialRateData); setRialPending(false) }
    } catch { /* non-fatal */ }
  }

  useEffect(() => {
    void fetchAll()
    const interval = setInterval(() => void fetchAll(), REFETCH_MS)
    return () => clearInterval(interval)
  }, [])

  return { oil, rial, oilPending, rialPending }
}
