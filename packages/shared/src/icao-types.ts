// ICAO hex address ranges → country/side
// ICAO type codes → AircraftType
import type { AircraftSide, AircraftType } from './types'

// ── Hex ranges ────────────────────────────────────────────────────────────────
// Checked in order; first match wins.
// Source: ICAO Doc 9303, ADS-B Exchange documentation

export interface HexRange {
  min:     number   // inclusive
  max:     number   // inclusive
  country: string
  side:    AircraftSide
}

export const HEX_RANGES: HexRange[] = [
  // United States (0xa00000–0xafffff)
  { min: 0xa00000, max: 0xafffff, country: 'US',            side: 'US' },
  // Iran (0x730000–0x737fff)
  { min: 0x730000, max: 0x737fff, country: 'Iran',          side: 'IR' },
  // Israel (0x738000–0x73ffff)
  { min: 0x738000, max: 0x73ffff, country: 'Israel',        side: 'IL' },
  // UK (0x400000–0x43ffff)
  { min: 0x400000, max: 0x43ffff, country: 'UK',            side: 'ALLIED' },
  // France (0x380000–0x3bffff)
  { min: 0x380000, max: 0x3bffff, country: 'France',        side: 'ALLIED' },
  // Germany (0x3c0000–0x3fffff)
  { min: 0x3c0000, max: 0x3fffff, country: 'Germany',       side: 'ALLIED' },
  // UAE (0x896000–0x8963ff)
  { min: 0x896000, max: 0x8963ff, country: 'UAE',           side: 'ALLIED' },
  // Saudi Arabia (0x710000–0x717fff)
  { min: 0x710000, max: 0x717fff, country: 'Saudi Arabia',  side: 'ALLIED' },
  // Canada (0xc00000–0xc3ffff)
  { min: 0xc00000, max: 0xc3ffff, country: 'Canada',        side: 'ALLIED' },
  // Australia (0x7c0000–0x7fffff)
  { min: 0x7c0000, max: 0x7fffff, country: 'Australia',     side: 'ALLIED' },
  // Turkey (0x4b8000–0x4bffff)
  { min: 0x4b8000, max: 0x4bffff, country: 'Turkey',        side: 'ALLIED' },
  // Jordan (0x740000–0x747fff)
  { min: 0x740000, max: 0x747fff, country: 'Jordan',        side: 'ALLIED' },
  // Egypt (0x010000–0x017fff)
  { min: 0x010000, max: 0x017fff, country: 'Egypt',         side: 'ALLIED' },
]

export function sideFromHex(icao24: string): AircraftSide {
  const n = parseInt(icao24, 16)
  if (isNaN(n)) return 'UNKNOWN'
  for (const range of HEX_RANGES) {
    if (n >= range.min && n <= range.max) return range.side
  }
  return 'UNKNOWN'
}

// ── ICAO type codes → AircraftType ────────────────────────────────────────────
// Source: ICAO Doc 8643, cross-referenced with common military designators

export const ICAO_TYPE_MAP: Record<string, AircraftType> = {
  // Fighters / attack / bombers
  F15:   'fighter', F15E:  'fighter',
  F16:   'fighter', F16C:  'fighter', F16D:  'fighter',
  F18:   'fighter', FA18:  'fighter', FA18S: 'fighter', F18E: 'fighter',
  F22:   'fighter', F22A:  'fighter',
  F35:   'fighter', F35A:  'fighter', F35B:  'fighter', F35C: 'fighter',
  F14:   'fighter', F14A:  'fighter', F14B:  'fighter',
  B1:    'fighter', B1B:   'fighter',
  B2:    'fighter', B2A:   'fighter',
  B52:   'fighter', B52H:  'fighter',
  AV8:   'fighter', AV8B:  'fighter',
  EA18:  'fighter', EA18G: 'fighter',
  SU30:  'fighter', SU35:  'fighter', SU24:  'fighter', SU25: 'fighter',
  MIG29: 'fighter', MIG31: 'fighter',
  F4:    'fighter', F5:    'fighter',
  A10:   'fighter', A10C:  'fighter',
  // Tankers
  KC135: 'tanker',  KC10:  'tanker',  KC46:  'tanker',
  IL78:  'tanker',  A330:  'tanker',  // A330 MRTT
  // ISR
  E3:    'isr',     E3A:   'isr',     E3B:   'isr',     E3C:  'isr',
  E8:    'isr',     E8C:   'isr',
  RC135: 'isr',
  P3:    'isr',     P3C:   'isr',
  P8:    'isr',     P8A:   'isr',
  U2:    'isr',     U2S:   'isr',
  RQ4:   'isr',     RQ4B:  'isr',
  MQ9:   'uav',     MQ9A:  'uav',
  E2:    'isr',     E2C:   'isr',     E2D:   'isr',
  EP3:   'isr',
  // Transport
  C17:   'transport', C17A:  'transport',
  C130:  'transport', C130J: 'transport', C130H: 'transport',
  C5:    'transport', C5M:   'transport',
  IL76:  'transport',
  // General UAV
  TB2:   'uav',
}

export function typeFromIcaoCode(typeCode: string): AircraftType {
  if (!typeCode) return 'unknown'
  return ICAO_TYPE_MAP[typeCode.toUpperCase()] ?? 'unknown'
}
