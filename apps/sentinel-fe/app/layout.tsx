import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SENTINEL — Conflict Intelligence',
  description: 'Real-time multi-conflict geospatial intelligence platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Classification banner */}
        <div style={{
          background: '#1a0505',
          borderBottom: '1px solid rgba(239,68,68,0.3)',
          textAlign: 'center',
          fontSize: 10,
          padding: '2px 0',
          letterSpacing: '0.2em',
          fontFamily: "'Orbitron', monospace",
          fontWeight: 700,
          color: 'rgba(239,68,68,0.9)',
          userSelect: 'none',
        }}>
          ██ UNCLASSIFIED · FOR DEMONSTRATION PURPOSES ONLY · SIMULATED DATA ██
        </div>
        {children}
      </body>
    </html>
  )
}
