'use client'

import { useMemo } from 'react'
import type { EntityGraph as EntityGraphData, EntityGraphNode, EntityGraphEdge } from '@sentinel/shared'

interface Props {
  graph:   EntityGraphData | null
  pending: boolean
  loading: boolean
  slug:    string
}

interface PositionedNode extends EntityGraphNode {
  x: number
  y: number
  r: number
  color: string
}

const COLORS = [
  '#00b0ff', '#ef4444', '#22c55e', '#eab308', '#a855f7',
  '#f97316', '#06b6d4', '#ec4899', '#84cc16', '#f59e0b',
]

function layoutNodes(nodes: EntityGraphNode[], width: number, height: number): PositionedNode[] {
  const cx = width / 2
  const cy = height / 2
  const radius = Math.min(width, height) * 0.38

  const maxFreq = Math.max(...nodes.map(n => n.frequency), 1)

  return nodes.map((node, i) => {
    const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2
    const x     = cx + radius * Math.cos(angle)
    const y     = cy + radius * Math.sin(angle)
    const r     = Math.max(4, Math.min(10, 4 + (node.frequency / maxFreq) * 6))
    const color = COLORS[i % COLORS.length] ?? '#94a3b8'
    return { ...node, x, y, r, color }
  })
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

export default function EntityGraph({ graph, pending, loading, slug }: Props) {
  const W = 280
  const H = 240

  const positioned = useMemo<PositionedNode[]>(() => {
    if (!graph || graph.nodes.length === 0) return []
    return layoutNodes(graph.nodes, W, H)
  }, [graph])

  const nodeMap = useMemo<Map<string, PositionedNode>>(() => {
    const m = new Map<string, PositionedNode>()
    positioned.forEach(n => m.set(n.id, n))
    return m
  }, [positioned])

  const mono: React.CSSProperties = { fontFamily: "'Share Tech Mono', monospace" }

  return (
    <div style={{ flex: 1, overflowY: 'auto', ...mono }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.12em',
        textTransform: 'uppercase',
        borderBottom: '1px solid var(--border)',
      }}>
        ◈ Entity Graph
        {graph && (
          <span style={{ fontSize: 8, color: 'var(--text-muted)', marginLeft: 8, letterSpacing: '0.06em' }}>
            {graph.nodes.length} actors · {graph.edges.length} links
          </span>
        )}
      </div>

      {loading ? (
        <div style={{
          padding: '20px 12px', textAlign: 'center',
          fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em',
          animation: 'pulse-opacity 1.5s ease-in-out infinite',
        }}>
          // BUILDING GRAPH...
        </div>
      ) : pending || !graph || positioned.length === 0 ? (
        <div style={{
          padding: '20px 12px', textAlign: 'center',
          fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em',
        }}>
          // INSUFFICIENT DATA — accumulates from Telegram + GDELT classification
        </div>
      ) : (
        <>
          <svg
            width={W}
            height={H}
            style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}
          >
            {/* Edges */}
            {(graph.edges as (EntityGraphEdge & { category?: string })[]).map((edge, i) => {
              const src = nodeMap.get(edge.source)
              const tgt = nodeMap.get(edge.target)
              if (!src || !tgt) return null
              const maxW = Math.max(...graph.edges.map(e => e.weight), 1)
              const strokeW = 0.5 + (edge.weight / maxW) * 1.5
              const opacity = 0.15 + (edge.weight / maxW) * 0.25
              return (
                <line
                  key={i}
                  x1={src.x} y1={src.y}
                  x2={tgt.x} y2={tgt.y}
                  stroke="rgba(148,163,184,0.8)"
                  strokeWidth={strokeW}
                  opacity={opacity}
                />
              )
            })}

            {/* Nodes */}
            {positioned.map(node => (
              <g key={node.id}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.r}
                  fill={node.color}
                  opacity={0.85}
                />
                <text
                  x={node.x}
                  y={node.y + node.r + 9}
                  textAnchor="middle"
                  fontSize={7}
                  fill="rgba(148,163,184,0.8)"
                  fontFamily="Share Tech Mono, monospace"
                >
                  {truncate(node.label, 12)}
                </text>
              </g>
            ))}
          </svg>

          {/* Top actors table */}
          <div style={{
            padding: '6px 12px',
            borderTop: '1px solid var(--border)',
          }}>
            <div style={{
              fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.1em',
              textTransform: 'uppercase', marginBottom: 4,
            }}>
              Top Actors (30d)
            </div>
            {positioned.slice(0, 8).map((node, i) => (
              <div key={node.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '2px 0',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: node.color, flexShrink: 0,
                    display: 'inline-block',
                  }} />
                  <span style={{
                    fontSize: 9, color: 'var(--text-secondary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {truncate(node.label, 20)}
                  </span>
                </div>
                <span style={{
                  fontSize: 9, color: node.color,
                  fontFamily: "'Orbitron', monospace", fontWeight: 700, flexShrink: 0,
                }}>
                  {node.frequency}
                </span>
              </div>
            ))}
          </div>

          <div style={{
            padding: '4px 12px',
            fontSize: 7, color: 'var(--text-muted)', letterSpacing: '0.06em',
          }}>
            Updated {new Date(graph.generated_at).toUTCString().slice(0, 16)}
          </div>
        </>
      )}
    </div>
  )
}
