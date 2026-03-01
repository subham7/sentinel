// Military callsign prefix → AircraftSide + AircraftType lookup
import type { AircraftSide, AircraftType } from './types'

export interface CallsignPattern {
  prefix: string
  side:   AircraftSide
  type:   AircraftType
  label?: string
}

export const CALLSIGN_PATTERNS: CallsignPattern[] = [
  // ── United States — tankers ────────────────────────────────────────────
  { prefix: 'REACH',  side: 'US',     type: 'transport', label: 'USAF airlift (C-17/C-5)' },
  { prefix: 'SHELL',  side: 'US',     type: 'tanker',    label: 'KC-135/KC-10 tanker' },
  { prefix: 'ATLAS',  side: 'US',     type: 'tanker',    label: 'KC-135 tanker' },
  { prefix: 'QUID',   side: 'US',     type: 'tanker',    label: 'KC-135 tanker' },
  { prefix: 'JAKE',   side: 'US',     type: 'tanker',    label: 'KC-135 tanker' },
  { prefix: 'PENN',   side: 'US',     type: 'tanker',    label: 'KC-135 tanker' },
  { prefix: 'ARCO',   side: 'US',     type: 'tanker',    label: 'KC-135 tanker' },
  { prefix: 'COLT',   side: 'US',     type: 'tanker',    label: 'KC-135 tanker' },
  { prefix: 'BARON',  side: 'US',     type: 'tanker',    label: 'KC-46 tanker' },
  // ── United States — ISR ──────────────────────────────────────────────
  { prefix: 'SNTRY',  side: 'US',     type: 'isr',       label: 'E-3 Sentry AWACS' },
  { prefix: 'ODEN',   side: 'US',     type: 'isr',       label: 'E-8 JSTARS' },
  { prefix: 'HAVOC',  side: 'US',     type: 'isr',       label: 'RC-135 Rivet Joint' },
  { prefix: 'COBRA',  side: 'US',     type: 'isr',       label: 'RC-135 Cobra Ball' },
  { prefix: 'GOLF',   side: 'US',     type: 'isr',       label: 'U-2 Dragon Lady' },
  { prefix: 'DRAGON', side: 'US',     type: 'isr',       label: 'RQ-4 Global Hawk' },
  { prefix: 'GHOST',  side: 'US',     type: 'isr',       label: 'ISR platform' },
  { prefix: 'SIGIL',  side: 'US',     type: 'isr',       label: 'ISR platform' },
  { prefix: 'FORTE',  side: 'US',     type: 'isr',       label: 'RC-135 Rivet Joint' },
  { prefix: 'TOPAZ',  side: 'US',     type: 'isr',       label: 'ISR platform' },
  { prefix: 'JEDI',   side: 'US',     type: 'isr',       label: 'ISR/P-8' },
  // ── United States — fighters / strike ────────────────────────────────
  { prefix: 'HAWK',   side: 'US',     type: 'fighter',   label: 'F-15' },
  { prefix: 'EAGLE',  side: 'US',     type: 'fighter',   label: 'F-15 Eagle' },
  { prefix: 'VIPER',  side: 'US',     type: 'fighter',   label: 'F-16' },
  { prefix: 'RAPTOR', side: 'US',     type: 'fighter',   label: 'F-22 Raptor' },
  { prefix: 'BONE',   side: 'US',     type: 'fighter',   label: 'B-1B Lancer' },
  { prefix: 'SPIRIT', side: 'US',     type: 'fighter',   label: 'B-2 Spirit' },
  { prefix: 'RHINO',  side: 'US',     type: 'fighter',   label: 'F/A-18 Hornet' },
  { prefix: 'HORNET', side: 'US',     type: 'fighter',   label: 'F/A-18' },
  { prefix: 'STRIKE', side: 'US',     type: 'fighter',   label: 'Strike mission' },
  { prefix: 'FURY',   side: 'US',     type: 'fighter',   label: 'Fighter' },
  { prefix: 'BISON',  side: 'US',     type: 'fighter',   label: 'Fighter' },
  { prefix: 'WOLF',   side: 'US',     type: 'fighter',   label: 'Fighter' },
  // ── Allied ───────────────────────────────────────────────────────────
  { prefix: 'MAGIC',  side: 'ALLIED', type: 'isr',       label: 'E-2C/D Hawkeye' },
  { prefix: 'ASCOT',  side: 'ALLIED', type: 'transport', label: 'RAF transport' },
  { prefix: 'RRR',    side: 'ALLIED', type: 'tanker',    label: 'RAF tanker' },
  { prefix: 'COMET',  side: 'ALLIED', type: 'transport', label: 'Allied transport' },
  { prefix: 'BOXER',  side: 'ALLIED', type: 'transport', label: 'Allied transport' },
  { prefix: 'TARTAN', side: 'ALLIED', type: 'fighter',   label: 'RAF Typhoon' },
  { prefix: 'OPTIC',  side: 'ALLIED', type: 'isr',       label: 'Allied ISR' },
  // ── Israel ───────────────────────────────────────────────────────────
  { prefix: 'IAF',    side: 'IL',     type: 'fighter',   label: 'Israeli Air Force' },
  { prefix: 'HATAV',  side: 'IL',     type: 'fighter',   label: 'IAF F-35' },
  { prefix: 'TZIR',   side: 'IL',     type: 'fighter',   label: 'IAF F-16' },
  { prefix: 'BARAK',  side: 'IL',     type: 'fighter',   label: 'IAF fighter' },
  { prefix: 'RAAM',   side: 'IL',     type: 'fighter',   label: 'IAF F-35I' },
  // ── Iran ─────────────────────────────────────────────────────────────
  { prefix: 'IRIAF',  side: 'IR',     type: 'fighter',   label: 'Islamic Republic of Iran AF' },
  { prefix: 'IRM',    side: 'IR',     type: 'transport', label: 'IRGC transport' },
  { prefix: 'IR-',    side: 'IR',     type: 'transport', label: 'Iran Air (civil)' },
]

/**
 * Longest-prefix match. Returns null if no pattern matches.
 */
export function classifyCallsign(
  callsign: string,
): Pick<CallsignPattern, 'side' | 'type'> | null {
  if (!callsign) return null
  const cs = callsign.trim().toUpperCase()
  let best: CallsignPattern | null = null
  for (const p of CALLSIGN_PATTERNS) {
    if (cs.startsWith(p.prefix)) {
      if (!best || p.prefix.length > best.prefix.length) best = p
    }
  }
  return best ? { side: best.side, type: best.type } : null
}
