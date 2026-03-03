/**
 * Source credibility tiering for incident sources.
 *
 * T1 — Primary newswire / major international broadcaster (highest reliability)
 * T2 — Established regional / investigative outlet (high reliability, editorial standards)
 * T3 — Aggregators, secondary press, OSINT outlets (moderate — verify independently)
 * T4 — State-controlled, official adversary media, unverified social (treat as raw signal)
 */

export type CredibilityTier = 1 | 2 | 3 | 4

export interface TierMeta {
  label: string
  color: string          // full color token
  bgColor: string        // muted background
  borderColor: string    // badge border
}

export const TIER_META: Record<CredibilityTier, TierMeta> = {
  1: { label: 'T1', color: '#00b0ff', bgColor: '#00b0ff18', borderColor: '#00b0ff55' },
  2: { label: 'T2', color: '#22c55e', bgColor: '#22c55e18', borderColor: '#22c55e55' },
  3: { label: 'T3', color: '#eab308', bgColor: '#eab30818', borderColor: '#eab30855' },
  4: { label: 'T4', color: '#ef4444', bgColor: '#ef444418', borderColor: '#ef444455' },
}

/** Map from (lowercase) domain → tier */
const DOMAIN_TIERS: Record<string, CredibilityTier> = {
  // ── T1: primary newswires + major international broadcasters ──────────────
  'reuters.com':         1,
  'apnews.com':          1,
  'ap.org':              1,
  'bbc.com':             1,
  'bbc.co.uk':           1,
  'afp.com':             1,
  'bloomberg.com':       1,
  'ft.com':              1,
  'nytimes.com':         1,
  'wsj.com':             1,
  'theguardian.com':     1,
  'washingtonpost.com':  1,
  'economist.com':       1,

  // ── T2: established regional / investigative ─────────────────────────────
  'haaretz.com':             2,
  'kyivindependent.com':     2,
  'aljazeera.com':           2,
  'france24.com':            2,
  'dw.com':                  2,
  'euronews.com':            2,
  'rferl.org':               2,
  'rferl.com':               2,
  'middleeasteye.net':       2,
  'timesofisrael.com':       2,
  'jpost.com':               2,
  'arabnews.com':            2,
  'alarabiya.net':           2,
  'i24news.tv':              2,
  'iraniinternational.com':  2,
  'iranintl.com':            2,
  'ukrinform.net':           2,
  'unian.net':               2,

  // ── T3: aggregators / OSINT / secondary press ────────────────────────────
  'bellingcat.com':         3,
  'understandingwar.org':   3,
  'crisisgroup.org':        3,
  'acleddata.com':          3,
  'gdeltproject.org':       3,
  'cnn.com':                3,
  'nbcnews.com':            3,
  'cbsnews.com':            3,
  'abcnews.go.com':         3,
  'foxnews.com':            3,
  'sky.com':                3,
  'timesofindia.com':       3,
  'dawn.com':               3,
  'thenationalnews.com':    3,
  'asharq-awsat.com':       3,

  // ── T4: state-controlled adversary media / unverified social ─────────────
  'rt.com':          4,
  'rt.ru':           4,
  'tass.com':        4,
  'tass.ru':         4,
  'presstv.ir':      4,
  'presstv.com':     4,
  'farsnews.ir':     4,
  'mehrnews.com':    4,
  'tasnimnews.com':  4,
  'irna.ir':         4,
  'sputniknews.com': 4,
  'ria.ru':          4,
  'izvestia.ru':     4,
  't.me':            4,   // Telegram (raw channel, unverified)
  'twitter.com':     4,
  'x.com':           4,
}

/** Fallback tiers when no URL is available */
const PIPELINE_TIERS: Record<string, CredibilityTier> = {
  manual:   1,   // analyst-verified
  acled:    2,   // academic with human verification
  gdelt:    3,   // machine-aggregated, mixed
  telegram: 4,   // raw social/channel
}

/**
 * Returns the credibility tier for an incident.
 * Prefers URL-based domain matching; falls back to pipeline source.
 */
export function getTier(sourceUrl: string | undefined, pipelineSource: string): CredibilityTier {
  if (sourceUrl) {
    try {
      const hostname = new URL(sourceUrl).hostname.replace(/^www\./, '').toLowerCase()
      // Direct match
      if (Object.prototype.hasOwnProperty.call(DOMAIN_TIERS, hostname)) {
        return DOMAIN_TIERS[hostname]!
      }
      // Parent domain match (e.g. live.bbc.co.uk → bbc.co.uk)
      const parts = hostname.split('.')
      for (let i = 1; i < parts.length - 1; i++) {
        const parent = parts.slice(i).join('.')
        if (Object.prototype.hasOwnProperty.call(DOMAIN_TIERS, parent)) {
          return DOMAIN_TIERS[parent]!
        }
      }
    } catch {
      // malformed URL — fall through
    }
  }
  return PIPELINE_TIERS[pipelineSource] ?? 3
}
