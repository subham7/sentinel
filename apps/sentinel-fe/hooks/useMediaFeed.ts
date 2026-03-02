'use client'

import { useState, useEffect, useCallback } from 'react'
import type { TelegramMedia } from '@sentinel/shared'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const PAGE_SIZE = 24

interface MediaFeedState {
  items:    TelegramMedia[]
  total:    number
  hasMore:  boolean
  loading:  boolean
  page:     number
}

export function useMediaFeed(slug: string) {
  const [state, setState] = useState<MediaFeedState>({
    items: [], total: 0, hasMore: false, loading: true, page: 1,
  })

  const load = useCallback(async (page: number, replace: boolean) => {
    setState(s => ({ ...s, loading: true }))
    try {
      const resp = await fetch(
        `${API}/api/conflicts/${slug}/media?page=${page}&limit=${PAGE_SIZE}`,
        { cache: 'no-store' },
      )
      if (!resp.ok) return
      const data = await resp.json() as {
        items: TelegramMedia[]; total: number; hasMore: boolean
      }
      setState(s => ({
        items:   replace ? data.items : [...s.items, ...data.items],
        total:   data.total,
        hasMore: data.hasMore,
        loading: false,
        page,
      }))
    } catch {
      setState(s => ({ ...s, loading: false }))
    }
  }, [slug])

  // Initial load
  useEffect(() => {
    setState({ items: [], total: 0, hasMore: false, loading: true, page: 1 })
    void load(1, true)
  }, [slug, load])

  // Refresh every 60s for new items
  useEffect(() => {
    const t = setInterval(() => void load(1, true), 60_000)
    return () => clearInterval(t)
  }, [load])

  const loadMore = useCallback(() => {
    if (state.hasMore && !state.loading) {
      void load(state.page + 1, false)
    }
  }, [state.hasMore, state.loading, state.page, load])

  return { ...state, loadMore }
}
