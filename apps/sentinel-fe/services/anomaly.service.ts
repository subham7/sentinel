// Browser-side anomaly detection: Z-score spike + surge on 30-day trend data

export interface AnomalyAlert {
  type:        'SPIKE' | 'SURGE'
  description: string
  severity:    number   // z-score or ratio
  slug:        string
}

function mean(vals: number[]): number {
  return vals.length === 0 ? 0 : vals.reduce((s, v) => s + v, 0) / vals.length
}

function std(vals: number[], mu: number): number {
  if (vals.length < 2) return 0
  return Math.sqrt(vals.reduce((s, v) => s + (v - mu) ** 2, 0) / (vals.length - 1))
}

export function detectAnomalies(
  slug:     string,
  trend:    { date: string; count: number; avgSeverity: number }[],
  today24h: number,   // incident count in last 24h (from SSE)
): AnomalyAlert[] {
  const alerts: AnomalyAlert[] = []
  if (trend.length < 7) return alerts

  const todayStr = new Date().toISOString().slice(0, 10)
  const baseline = trend.filter(d => d.date < todayStr).map(d => d.count)
  if (baseline.length < 5) return alerts

  const mu    = mean(baseline)
  const sigma = std(baseline, mu)

  // Spike: today's 24h count vs baseline
  if (sigma > 0) {
    const z = (today24h - mu) / sigma
    if (z > 2.5) {
      const pct = mu > 0 ? Math.round(((today24h - mu) / mu) * 100) : 0
      alerts.push({
        type:        'SPIKE',
        description: `${z.toFixed(1)}σ above 30-day baseline (↑${pct}% in 24h)`,
        severity:    z,
        slug,
      })
    }
  }

  // Surge: last 7 days avg vs prior period avg
  if (trend.length >= 14) {
    const last7 = trend.slice(-7).map(d => d.count)
    const prior = trend.slice(0, Math.max(trend.length - 7, 0)).map(d => d.count)
    if (prior.length > 0) {
      const last7Avg = mean(last7)
      const priorAvg = mean(prior)
      if (priorAvg > 0 && last7Avg > priorAvg * 2.5) {
        alerts.push({
          type:        'SURGE',
          description: `7-day average ${(last7Avg / priorAvg).toFixed(1)}× prior baseline`,
          severity:    last7Avg / priorAvg,
          slug,
        })
      }
    }
  }

  return alerts
}
