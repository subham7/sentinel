'use client'

import { useState, useEffect } from 'react'

/** Returns true after `ms` ms of no user interaction, false on any activity. */
export function useInactivity(ms = 120_000): boolean {
  const [inactive, setInactive] = useState(false)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const reset = () => {
      setInactive(false)
      clearTimeout(timer)
      timer = setTimeout(() => setInactive(true), ms)
    }
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => {
      clearTimeout(timer)
      events.forEach(e => window.removeEventListener(e, reset))
    }
  }, [ms])
  return inactive
}
