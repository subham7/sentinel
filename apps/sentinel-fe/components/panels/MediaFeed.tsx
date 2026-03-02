'use client'

import { useState, useCallback } from 'react'
import type { TelegramMedia } from '@sentinel/shared'
import { useMediaFeed } from '@/hooks/useMediaFeed'

// ── Relative time ─────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Lightbox overlay ──────────────────────────────────────────────────────────

function Lightbox({ item, onClose }: { item: TelegramMedia; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.9)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Share Tech Mono', monospace",
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 16, right: 16,
          background: 'none', border: 'none', color: 'var(--text-muted)',
          fontSize: 20, cursor: 'pointer', lineHeight: 1,
        }}
      >
        ✕
      </button>

      {/* Image / video poster */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.url}
        alt={item.caption ?? 'Telegram media'}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '90vw', maxHeight: '75vh',
          objectFit: 'contain', borderRadius: 4,
          border: '1px solid var(--border-bright)',
        }}
        loading="lazy"
      />

      {/* Meta */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          marginTop: 12, maxWidth: 560, width: '90vw',
          padding: '8px 12px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 4,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-accent)', letterSpacing: '0.06em' }}>
            @{item.channel}
          </span>
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            {timeAgo(item.posted_at)} · {item.view_count > 0 ? `${item.view_count.toLocaleString()} views` : ''}
          </span>
        </div>
        {item.caption && (
          <p style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.5, margin: 0 }}>
            {item.caption}
          </p>
        )}
        <a
          href={`https://t.me/${item.channel}/${item.message_id}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 9, color: 'var(--text-accent)', letterSpacing: '0.06em', display: 'block', marginTop: 6 }}
        >
          OPEN IN TELEGRAM ↗
        </a>
      </div>
    </div>
  )
}

// ── Media card ────────────────────────────────────────────────────────────────

function MediaCard({ item, onClick }: { item: TelegramMedia; onClick: () => void }) {
  const [imgError, setImgError] = useState(false)

  return (
    <div
      onClick={onClick}
      style={{
        breakInside: 'avoid',
        marginBottom: 6,
        cursor: 'pointer',
        border: '1px solid var(--border)',
        borderRadius: 4,
        overflow: 'hidden',
        background: 'var(--bg-elevated)',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-bright)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)' }}
    >
      {/* Thumbnail */}
      {!imgError ? (
        <div style={{ position: 'relative', width: '100%' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.url}
            alt={item.caption ?? ''}
            onError={() => setImgError(true)}
            style={{ width: '100%', display: 'block', objectFit: 'cover', maxHeight: 180 }}
            loading="lazy"
          />
          {item.media_type === 'video' && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.35)',
            }}>
              <span style={{ fontSize: 20, color: 'rgba(255,255,255,0.9)', lineHeight: 1 }}>▶</span>
            </div>
          )}
        </div>
      ) : (
        <div style={{
          height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-overlay)',
          fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.1em',
        }}>
          {item.media_type === 'video' ? '▶ VIDEO' : '// NO PREVIEW'}
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: '4px 6px', fontFamily: "'Share Tech Mono', monospace" }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 8, color: 'var(--text-accent)', letterSpacing: '0.04em' }}>
            @{item.channel.slice(0, 14)}
          </span>
          <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>
            {timeAgo(item.posted_at)}
          </span>
        </div>
        {item.caption && (
          <p style={{
            fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.4,
            margin: '3px 0 0',
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {item.caption}
          </p>
        )}
        {item.view_count > 0 && (
          <div style={{ fontSize: 7, color: 'var(--text-muted)', marginTop: 2, textAlign: 'right' }}>
            {item.view_count.toLocaleString()} views
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  slug: string
}

export default function MediaFeed({ slug }: Props) {
  const { items, total, hasMore, loading, loadMore } = useMediaFeed(slug)
  const [lightboxItem, setLightboxItem] = useState<TelegramMedia | null>(null)

  const handleClose = useCallback(() => setLightboxItem(null), [])

  const mono: React.CSSProperties = { fontFamily: "'Share Tech Mono', monospace" }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', ...mono }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          MEDIA FEED
        </span>
        {total > 0 && (
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            {total.toLocaleString()} items
          </span>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
        {loading && items.length === 0 ? (
          <div style={{
            padding: '20px 12px', textAlign: 'center',
            fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em',
            animation: 'pulse-opacity 1.5s ease-in-out infinite',
          }}>
            // LOADING MEDIA...
          </div>
        ) : items.length === 0 ? (
          <div style={{
            padding: '20px 12px', textAlign: 'center',
            fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em',
          }}>
            // NO MEDIA — configure TELEGRAM_CHANNELS in .env
          </div>
        ) : (
          <>
            {/* 2-column masonry via CSS columns */}
            <div style={{ columns: 2, columnGap: 6 }}>
              {items.map(item => (
                <MediaCard
                  key={item.id}
                  item={item}
                  onClick={() => setLightboxItem(item)}
                />
              ))}
            </div>

            {/* Load more */}
            {hasMore && (
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <button
                  onClick={loadMore}
                  disabled={loading}
                  style={{
                    padding: '4px 16px',
                    background: 'transparent',
                    border: '1px solid var(--border-bright)',
                    borderRadius: 2,
                    color: 'var(--text-secondary)',
                    fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
                    cursor: loading ? 'default' : 'pointer',
                    ...mono,
                  }}
                >
                  {loading ? 'LOADING...' : 'LOAD MORE'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Lightbox */}
      {lightboxItem && <Lightbox item={lightboxItem} onClose={handleClose} />}
    </div>
  )
}
