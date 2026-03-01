'use client'

import { useState, useEffect } from 'react'

/** Returns true when the browser tab is visible, false when hidden. */
export function useVisibility(): boolean {
  const [visible, setVisible] = useState(() =>
    typeof document !== 'undefined' ? !document.hidden : true
  )
  useEffect(() => {
    const fn = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', fn)
    return () => document.removeEventListener('visibilitychange', fn)
  }, [])
  return visible
}
