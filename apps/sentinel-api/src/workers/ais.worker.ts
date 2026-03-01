import WebSocket from 'ws'
import { ALL_CONFLICTS } from '@sentinel/shared'
import type { Vessel, VesselSide, VesselType, ConflictConfig } from '@sentinel/shared'
import { cacheGet, cacheSet } from '../services/cache.js'
import { insertVesselTrail, pruneOldVesselTrails } from '../db/queries.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const WRITE_INTERVAL_MS    = 15_000
const AIS_DARK_THRESHOLD   = 60 * 60 * 1000    // 60 min → mark as dark
const MAX_VESSEL_AGE       = 2 * 60 * 60 * 1000 // 2h → drop from state entirely

// ── MMSI MID prefix → party side ─────────────────────────────────────────────
// MID = Maritime Identification Digits (first 3 digits of MMSI)

const MID_SIDE: Record<string, VesselSide> = {
  '338': 'US',  // United States (inland)
  '366': 'US',  // United States
  '367': 'US',  // United States
  '368': 'US',  // United States
  '369': 'US',  // United States
  '422': 'IR',  // Iran
  '428': 'IL',  // Israel
}

function sideFromMmsi(mmsi: string): VesselSide {
  return MID_SIDE[mmsi.slice(0, 3)] ?? 'UNKNOWN'
}

// ── AIS vessel type code → VesselType ─────────────────────────────────────────
// https://www.itu.int/rec/R-REC-M.1371/en — Annex 8, Table 18

function typeFromAisCode(code: number): VesselType {
  if (code === 35)                          return 'warship'
  if (code >= 80 && code <= 89)             return 'tanker'
  if (code >= 70 && code <= 79)             return 'cargo'
  if (code >= 60 && code <= 69)             return 'cargo'   // passenger, treat as cargo for display
  if (code === 30 || code === 34)           return 'fast_boat'
  return 'unknown'
}

// ── Bounds check ──────────────────────────────────────────────────────────────

function inBounds(lat: number, lon: number, bounds: ConflictConfig['map']['bounds']): boolean {
  return (
    lat >= bounds.latMin && lat <= bounds.latMax &&
    lon >= bounds.lonMin && lon <= bounds.lonMax
  )
}

// ── In-memory state ───────────────────────────────────────────────────────────

// Per-conflict: mmsi → Vessel
const conflictVessels = new Map<string, Map<string, Vessel>>()
// mmsi → AIS type code (populated by ShipStaticData messages)
const vesselTypeCodes = new Map<string, number>()
// mmsi → vessel name (populated by ShipStaticData messages)
const vesselNames     = new Map<string, string>()

for (const c of ALL_CONFLICTS) {
  if (c.dataSources.ais.enabled) {
    conflictVessels.set(c.slug, new Map())
  }
}

// ── Message handling ──────────────────────────────────────────────────────────

function handlePosition(
  mmsi:    string,
  lat:     number,
  lon:     number,
  heading: number,
  sog:     number,
): void {
  if (!mmsi || typeof lat !== 'number' || typeof lon !== 'number') return

  const now      = Date.now()
  const aisCode  = vesselTypeCodes.get(mmsi) ?? 0
  const name     = vesselNames.get(mmsi)     ?? mmsi

  for (const conflict of ALL_CONFLICTS) {
    if (!conflict.dataSources.ais.enabled) continue
    if (!inBounds(lat, lon, conflict.map.bounds)) continue

    const map  = conflictVessels.get(conflict.slug)
    if (!map) continue

    const vessel: Vessel = {
      mmsi,
      name,
      lat,
      lon,
      heading: heading !== 511 ? heading : 0,
      speed:   sog,
      type:    typeFromAisCode(aisCode),
      side:    sideFromMmsi(mmsi),
      flag:    '',
      ais_dark:   false,
      sanctioned: false,
      last_seen:  now,
    }

    map.set(mmsi, vessel)

    try {
      insertVesselTrail(mmsi, conflict.slug, vessel, now)
    } catch { /* SQLite unavailable */ }
  }
}

function handleStaticData(mmsi: string, typeCode: number, name: string): void {
  if (!mmsi) return

  if (typeCode) vesselTypeCodes.set(mmsi, typeCode)
  if (name)     vesselNames.set(mmsi, name)

  // Back-fill type/name into any active vessel state
  for (const map of conflictVessels.values()) {
    const v = map.get(mmsi)
    if (!v) continue
    map.set(mmsi, {
      ...v,
      name: name || v.name,
      type: typeCode ? typeFromAisCode(typeCode) : v.type,
    })
  }
}

// ── Periodic cache write ──────────────────────────────────────────────────────

async function writeToCache(): Promise<void> {
  const now = Date.now()

  for (const [slug, map] of conflictVessels) {
    const vessels: Vessel[] = []

    for (const [mmsi, v] of map) {
      const age = now - v.last_seen

      if (age > MAX_VESSEL_AGE) {
        map.delete(mmsi)
        continue
      }

      vessels.push({ ...v, ais_dark: age > AIS_DARK_THRESHOLD })
    }

    await cacheSet(`vessels:${slug}`, vessels, 60)
    await cacheSet(`vessels:${slug}:stale`, vessels, 86400)

    const darkCount = vessels.filter(v => v.ais_dark).length
    console.log(`[ais] ${slug}: ${vessels.length} vessels (${darkCount} dark)`)
  }

  // Prune old DB trails periodically (non-fatal)
  try {
    pruneOldVesselTrails(24)
  } catch { /* SQLite unavailable */ }
}

// ── AISStream WebSocket ───────────────────────────────────────────────────────

interface AISMetaData {
  MMSI?:      number
  ShipName?:  string
  latitude?:  number
  longitude?: number
}

interface AISPositionReport {
  Latitude?:    number
  Longitude?:   number
  TrueHeading?: number
  Sog?:         number
  Mmsi?:        number
}

interface AISShipStatic {
  Mmsi?: number
  Name?: string
  Type?: number
}

interface AISMessage {
  MessageType: string
  MetaData:    AISMetaData
  Message: {
    PositionReport?:  AISPositionReport
    ShipStaticData?:  AISShipStatic
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

async function connectAIS(
  boundingBoxes: [[number, number], [number, number]][],
  retries:       number,
): Promise<void> {
  const apiKey = process.env.AISSTREAM_API_KEY
  if (!apiKey) {
    console.warn('[ais] AISSTREAM_API_KEY not set — vessel data disabled (cache/DB only)')
    return
  }

  console.log(`[ais] connecting to AISStream (attempt ${retries + 1})...`)

  const ws = new WebSocket('wss://stream.aisstream.io/v0/stream')

  ws.on('open', () => {
    retries = 0
    console.log('[ais] connected')
    ws.send(JSON.stringify({
      APIKey:             apiKey,
      BoundingBoxes:      boundingBoxes,
      FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
    }))
  })

  ws.on('message', (rawData: Buffer | string) => {
    try {
      const msg = JSON.parse(rawData.toString()) as AISMessage
      const meta = msg.MetaData

      if (msg.MessageType === 'PositionReport') {
        const p = msg.Message.PositionReport
        if (!p) return

        const mmsi    = String(meta.MMSI ?? p.Mmsi ?? '')
        const lat     = p.Latitude  ?? meta.latitude  ?? NaN
        const lon     = p.Longitude ?? meta.longitude ?? NaN
        const heading = p.TrueHeading ?? 511
        const sog     = p.Sog ?? 0

        handlePosition(mmsi, lat, lon, heading, sog)

      } else if (msg.MessageType === 'ShipStaticData') {
        const s = msg.Message.ShipStaticData
        if (!s) return

        const mmsi = String(meta.MMSI ?? s.Mmsi ?? '')
        handleStaticData(mmsi, s.Type ?? 0, s.Name ?? meta.ShipName ?? '')
      }
    } catch { /* ignore parse errors */ }
  })

  ws.on('close', () => {
    console.warn('[ais] connection closed — reconnecting...')
    const delay = Math.min(60_000, 1000 * Math.pow(2, retries))
    setTimeout(() => void connectAIS(boundingBoxes, retries + 1), delay)
  })

  ws.on('error', (err: Error) => {
    console.warn('[ais] WebSocket error:', err.message)
  })
}

// ── Public entry point ────────────────────────────────────────────────────────

export function startAISWorker(): void {
  const boundingBoxes: [[number, number], [number, number]][] = []

  for (const c of ALL_CONFLICTS) {
    if (c.dataSources.ais.enabled) {
      boundingBoxes.push(...c.dataSources.ais.boundingBoxes)
    }
  }

  if (boundingBoxes.length === 0) {
    console.log('[ais] no AIS-enabled conflicts — worker not started')
    return
  }

  // Initial cache write (may restore from stale), then periodic writes
  void writeToCache()
  setInterval(() => void writeToCache(), WRITE_INTERVAL_MS)

  // Start WebSocket
  void connectAIS(boundingBoxes, 0)
}
