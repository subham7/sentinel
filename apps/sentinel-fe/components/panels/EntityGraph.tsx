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

// Max nodes to display — 16 gives 22.5° arc spacing (readable labels)
const MAX_NODES = 16

function layoutNodes(nodes: EntityGraphNode[], width: number, height: number): PositionedNode[] {
  const cx     = width / 2
  const cy     = height / 2
  // Smaller radius → more padding at edges for labels
  const radius = Math.min(width, height) * 0.30

  const maxFreq = Math.max(...nodes.map(n => n.frequency), 1)

  return nodes.slice(0, MAX_NODES).map((node, i) => {
    const angle = (i / Math.min(nodes.length, MAX_NODES)) * 2 * Math.PI - Math.PI / 2
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

// Position label anchor based on which quadrant the node is in
function labelAnchor(x: number, cx: number): 'start' | 'middle' | 'end' {
  const rel = x - cx
  if (rel > 20)  return 'start'
  if (rel < -20) return 'end'
  return 'middle'
}

function labelOffset(y: number, cy: number, r: number): { dx: number; dy: number } {
  const rel = y - cy
  if (rel > 20)  return { dx: 0, dy: r + 10 }   // bottom → label below
  if (rel < -20) return { dx: 0, dy: -(r + 4) }  // top → label above
  return { dx: 0, dy: r + 10 }
}

export default function EntityGraph({ graph, pending, loading, slug }: Props) {
  const W = 260
  const H = 260

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
  const cx = W / 2

  return (
    <div style={{ ...mono }}>
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
          padding: '16px 12px', textAlign: 'center',
          fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em',
          animation: 'pulse-opacity 1.5s ease-in-out infinite',
        }}>
          // BUILDING GRAPH...
        </div>
      ) : pending || !graph || positioned.length === 0 ? (
        <div style={{
          padding: '16px 12px', textAlign: 'center',
          fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em',
        }}>
          // INSUFFICIENT DATA
        </div>
      ) : (
        <>
          {/* SVG graph — overflow:visible so labels never clip */}
          <div style={{ padding: '4px 0', overflow: 'visible' }}>
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
                const maxW    = Math.max(...graph.edges.map(e => e.weight), 1)
                const strokeW = 0.5 + (edge.weight / maxW) * 1.5
                const opacity = 0.12 + (edge.weight / maxW) * 0.22
                return (
                  <line
                    key={i}
                    x1={src.x} y1={src.y}
                    x2={tgt.x} y2={tgt.y}
                    stroke="rgba(148,163,184,0.9)"
                    strokeWidth={strokeW}
                    opacity={opacity}
                  />
                )
              })}

              {/* Nodes + labels */}
              {positioned.map(node => {
                const anchor = labelAnchor(node.x, cx)
                const off    = labelOffset(node.y, W / 2, node.r)
                return (
                  <g key={node.id}>
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.r}
                      fill={node.color}
                      opacity={0.85}
                    />
                    <text
                      x={node.x + off.dx}
                      y={node.y + off.dy}
                      textAnchor={anchor}
                      fontSize={7}
                      fill="rgba(148,163,184,0.85)"
                      fontFamily="Share Tech Mono, monospace"
                    >
                      {truncate(node.label, 11)}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>

          {/* Top actors compact list */}
          <div style={{ padding: '4px 12px 8px', borderTop: '1px solid var(--border)' }}>
            <div style={{
              fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.1em',
              textTransform: 'uppercase', marginBottom: 4,
            }}>
              Top Actors (30d)
            </div>
            {positioned.slice(0, 6).map(node => (
              <div key={node.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '2px 0',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: node.color, flexShrink: 0, display: 'inline-block',
                  }} />
                  <span style={{
                    fontSize: 9, color: 'var(--text-secondary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {truncate(node.label, 22)}
                  </span>
                </div>
                <span style={{
                  fontSize: 9, color: node.color, fontFamily: "'Orbitron', monospace",
                  fontWeight: 700, flexShrink: 0, marginLeft: 6,
                }}>
                  {node.frequency}
                </span>
              </div>
            ))}
          </div>

          <div style={{
            padding: '2px 12px 6px',
            fontSize: 7, color: 'var(--text-muted)', letterSpacing: '0.06em',
          }}>
            Updated {new Date(graph.generated_at).toUTCString().slice(0, 16)}
          </div>
        </>
      )}
    </div>
  )
}
