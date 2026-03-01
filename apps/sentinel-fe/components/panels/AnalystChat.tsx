'use client'

import { useState, useRef, useEffect } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

interface ChatMessage {
  role:       'user' | 'assistant'
  content:    string
  tools_used?: string[]
}

interface AnalystChatProps {
  slug: string
}

export default function AnalystChat({ slug }: AnalystChatProps) {
  const [messages,  setMessages]  = useState<ChatMessage[]>([])
  const [input,     setInput]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    const userMsg: ChatMessage = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const history = [...messages, userMsg].map(m => ({
        role:    m.role,
        content: m.content,
      }))
      // Remove last user message from history (it's the current message)
      const historyForApi = history.slice(0, -1)

      const resp = await fetch(`${API_BASE}/api/conflicts/${slug}/analyst-chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text, history: historyForApi }),
      })

      if (resp.status === 503) {
        setUnavailable(true)
        setMessages(prev => prev.slice(0, -1))  // Remove user message
        return
      }

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`)
      }

      const data = await resp.json() as { response: string; tools_used: string[] }
      setMessages(prev => [...prev, {
        role:       'assistant',
        content:    data.response,
        tools_used: data.tools_used,
      }])
    } catch (e) {
      setMessages(prev => [...prev, {
        role:    'assistant',
        content: `// ANALYST ERROR: ${(e as Error).message}`,
      }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  const containerStyle: React.CSSProperties = {
    display:       'flex',
    flexDirection: 'column',
    borderBottom:  '1px solid var(--border)',
    flexShrink:    0,
    maxHeight:     260,
    fontFamily:    "'Share Tech Mono', monospace",
  }

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{
        padding:       '6px 12px',
        borderBottom:  '1px solid var(--border)',
        fontSize:       10,
        color:          'var(--text-secondary)',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        flexShrink:    0,
      }}>
        ANALYST CHAT
      </div>

      {unavailable ? (
        <div style={{
          padding:       '10px 12px',
          fontSize:       10,
          color:          'var(--text-muted)',
          letterSpacing: '0.06em',
        }}>
          // ANALYST UNAVAILABLE — ANTHROPIC_API_KEY NOT CONFIGURED
        </div>
      ) : (
        <>
          {/* Message history */}
          <div
            ref={scrollRef}
            style={{
              flex:      1,
              overflowY: 'auto',
              padding:   '6px 0',
              minHeight: 40,
            }}
          >
            {messages.length === 0 && !loading && (
              <div style={{
                padding:       '6px 12px',
                fontSize:       10,
                color:          'var(--text-muted)',
                letterSpacing: '0.08em',
              }}>
                // ASK THE ANALYST
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  padding:       '4px 12px',
                  display:       'flex',
                  flexDirection: 'column',
                  alignItems:    msg.role === 'user' ? 'flex-end' : 'flex-start',
                  gap:           2,
                }}
              >
                {/* Tool annotations */}
                {msg.tools_used && msg.tools_used.length > 0 && (
                  <div style={{
                    fontSize:      9,
                    color:         'var(--text-muted)',
                    letterSpacing: '0.06em',
                    fontStyle:     'italic',
                  }}>
                    // queried: {msg.tools_used.join(', ')}
                  </div>
                )}
                <div style={{
                  maxWidth:    '90%',
                  padding:     '4px 8px',
                  background:  msg.role === 'user' ? 'var(--bg-overlay)' : 'transparent',
                  borderLeft:  msg.role === 'assistant' ? '2px solid var(--text-accent)' : 'none',
                  borderRadius: 2,
                  fontSize:    11,
                  color:       msg.role === 'user' ? 'var(--text-primary)' : '#93c5fd',
                  lineHeight:  1.5,
                  whiteSpace:  'pre-wrap',
                  wordBreak:   'break-word',
                }}>
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{
                padding:       '4px 12px',
                fontSize:       10,
                color:          'var(--text-muted)',
                letterSpacing: '0.08em',
                animation:     'pulse-opacity 1.5s ease-in-out infinite',
              }}>
                // ANALYST PROCESSING...
              </div>
            )}
          </div>

          {/* Input area */}
          <div style={{
            display:     'flex',
            gap:         4,
            padding:     '6px 8px',
            borderTop:   '1px solid var(--border)',
            background:  'var(--bg-elevated)',
            flexShrink:  0,
          }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask the analyst..."
              disabled={loading}
              rows={1}
              style={{
                flex:        1,
                background:  'transparent',
                border:      '1px solid var(--border)',
                borderRadius: 2,
                color:       'var(--text-primary)',
                fontFamily:  "'Share Tech Mono', monospace",
                fontSize:    11,
                padding:     '4px 6px',
                resize:      'none',
                outline:     'none',
                lineHeight:  1.5,
                minHeight:   28,
              }}
            />
            <button
              onClick={() => void sendMessage()}
              disabled={loading || !input.trim()}
              style={{
                padding:       '4px 10px',
                background:    loading || !input.trim() ? 'transparent' : 'var(--bg-overlay)',
                border:        '1px solid var(--border)',
                borderRadius:  2,
                color:         loading || !input.trim() ? 'var(--text-muted)' : 'var(--text-accent)',
                fontFamily:    "'Share Tech Mono', monospace",
                fontSize:      10,
                letterSpacing: '0.1em',
                cursor:        loading || !input.trim() ? 'default' : 'pointer',
                whiteSpace:    'nowrap',
              }}
            >
              SEND
            </button>
          </div>
        </>
      )}
    </div>
  )
}
