// ACLED OAuth token manager
// ACLED switched from static API keys to OAuth2 password-grant in early 2026.
// Tokens are valid for 86400 seconds (24h). We refresh when < 1 hour remains.

const TOKEN_URL = 'https://acleddata.com/oauth/token'
const REFRESH_THRESHOLD_MS = 60 * 60 * 1000   // refresh when < 1h left

interface TokenResponse {
  access_token:  string
  refresh_token: string
  expires_in:    number   // seconds
  token_type:    string
}

interface CachedToken {
  accessToken:  string
  refreshToken: string
  expiresAt:    number    // Date.now() ms
}

let cached: CachedToken | null = null
let inflight: Promise<string>  | null = null

async function fetchToken(body: Record<string, string>): Promise<TokenResponse> {
  const resp = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams(body).toString(),
    signal:  AbortSignal.timeout(15_000),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText)
    throw new Error(`ACLED OAuth failed (${resp.status}): ${text}`)
  }

  return resp.json() as Promise<TokenResponse>
}

async function acquireToken(): Promise<string> {
  const email    = process.env.ACLED_EMAIL
  const password = process.env.ACLED_PASSWORD

  if (!email || !password) {
    throw new Error('ACLED_EMAIL and ACLED_PASSWORD must be set in environment')
  }

  // Try refresh first if we have a cached token with a refresh_token
  if (cached) {
    try {
      const data = await fetchToken({
        grant_type:    'refresh_token',
        refresh_token: cached.refreshToken,
        client_id:     'acled',
      })
      cached = {
        accessToken:  data.access_token,
        refreshToken: data.refresh_token,
        expiresAt:    Date.now() + data.expires_in * 1000,
      }
      console.log('[acled-auth] token refreshed')
      return cached.accessToken
    } catch (e) {
      console.warn('[acled-auth] refresh failed, re-authenticating:', (e as Error).message)
      cached = null
    }
  }

  // Full password grant
  const data = await fetchToken({
    grant_type: 'password',
    username:   email,
    password:   password,
    client_id:  'acled',
  })

  cached = {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:    Date.now() + data.expires_in * 1000,
  }
  console.log('[acled-auth] authenticated (token valid 24h)')
  return cached.accessToken
}

/**
 * Returns a valid ACLED Bearer token, fetching or refreshing as needed.
 * Deduplicates concurrent callers — only one token request in-flight at a time.
 */
export async function getACLEDToken(): Promise<string> {
  // Return cached token if still fresh
  if (cached && cached.expiresAt - Date.now() > REFRESH_THRESHOLD_MS) {
    return cached.accessToken
  }

  // Deduplicate concurrent calls
  if (inflight) return inflight

  inflight = acquireToken().finally(() => { inflight = null })
  return inflight
}
