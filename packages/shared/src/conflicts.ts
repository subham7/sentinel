// Conflict configuration registry
// To add a new conflict: add one ConflictConfig object to ALL_CONFLICTS. Nothing else.

export interface MilitaryBase {
  id: string
  name: string
  lat: number
  lon: number
  type: 'airbase' | 'naval' | 'army' | 'combined'
  party: string         // shortCode of the party that operates it
  country: string
  strikeRanges?: { type: string; rangeKm: number }[]
}

export interface ShippingLane {
  id: string
  name: string
  coordinates: [number, number][]   // [lon, lat] pairs
}

export interface NuclearSite {
  id: string
  name: string
  lat: number
  lon: number
  status: 'active' | 'suspected' | 'modified' | 'operational' | 'shutdown'
  enrichment: string
  notes?: string
}

export interface SamSite {
  id: string
  name: string
  lat: number
  lon: number
  system: string        // 'S-300PMU2', 'Bavar-373', etc.
  range_km: number
  party: string
}

export interface Chokepoint {
  id: string
  name: string
  lat: number
  lon: number
  radius_km: number
}

export interface ConflictConfig {
  slug: string
  name: string
  shortName: string
  description: string
  status: 'active' | 'frozen' | 'monitoring'
  intensity: 'critical' | 'high' | 'elevated' | 'low'
  startDate: string

  parties: {
    name: string
    shortCode: string
    color: string
    flagEmoji: string
  }[]

  map: {
    center: [number, number]    // [lon, lat]
    zoom: number
    bounds: { latMin: number; latMax: number; lonMin: number; lonMax: number }
    theaters: {
      id: string
      name: string
      bounds: { latMin: number; latMax: number; lonMin: number; lonMax: number }
    }[]
  }

  dataSources: {
    adsb: {
      enabled: boolean
      queryPoints: { lat: number; lon: number; radiusNm: number }[]
    }
    ais: {
      enabled: boolean
      boundingBoxes: [[number, number], [number, number]][]
    }
    gdelt: {
      enabled: boolean
      keywords: string[]
      cameoRootCodes: string[]
    }
    acled: {
      enabled: boolean
      regions: number[]
      countries: string[]
    }
    telegram: {
      channels: string[]
    }
  }

  overlays: {
    bases: MilitaryBase[]
    nuclearSites?: NuclearSite[]
    samSites?: SamSite[]
    shippingLanes?: ShippingLane[]
    chokepoints?: Chokepoint[]
    countryHighlights?: { iso3: string; party: string }[]
  }

  card: {
    accentColor: string
    keyMetrics: string[]
  }
}

// ─── US–Iran ──────────────────────────────────────────────────────────────────

export const US_IRAN: ConflictConfig = {
  slug: 'us-iran',
  name: 'US–Iran',
  shortName: 'Persian Gulf',
  description: 'US-Iran tensions across the Persian Gulf, Strait of Hormuz, and broader CENTCOM theater.',
  status: 'active',
  intensity: 'high',
  startDate: '1979-11-04',
  parties: [
    { name: 'United States',    shortCode: 'US',  color: '#00b0ff', flagEmoji: '🇺🇸' },
    { name: 'Iran',             shortCode: 'IR',  color: '#ef4444', flagEmoji: '🇮🇷' },
    { name: 'Israel',           shortCode: 'IL',  color: '#22c55e', flagEmoji: '🇮🇱' },
    { name: 'US Allies (Gulf)', shortCode: 'GCC', color: '#f59e0b', flagEmoji: '🤝' },
  ],
  map: {
    center: [51.0, 27.0],
    zoom: 5,
    bounds: { latMin: -5, latMax: 65, lonMin: -15, lonMax: 90 },
    theaters: [
      { id: 'persian_gulf',     name: 'Persian Gulf',     bounds: { latMin: 23, latMax: 30, lonMin: 47, lonMax: 57 } },
      { id: 'strait_of_hormuz', name: 'Strait of Hormuz', bounds: { latMin: 25, latMax: 27, lonMin: 55, lonMax: 58 } },
      { id: 'gulf_of_oman',     name: 'Gulf of Oman',     bounds: { latMin: 22, latMax: 26, lonMin: 57, lonMax: 63 } },
      { id: 'red_sea',          name: 'Red Sea',          bounds: { latMin: 12, latMax: 30, lonMin: 32, lonMax: 45 } },
      { id: 'eastern_med',      name: 'Eastern Med',      bounds: { latMin: 30, latMax: 42, lonMin: 20, lonMax: 37 } },
      { id: 'arabian_sea',      name: 'Arabian Sea',      bounds: { latMin: 10, latMax: 25, lonMin: 55, lonMax: 75 } },
      { id: 'central_europe',   name: 'Central Europe',   bounds: { latMin: 44, latMax: 58, lonMin:  5, lonMax: 25 } },
    ],
  },
  dataSources: {
    adsb: {
      enabled: true,
      queryPoints: [
        // ── Core CENTCOM theater ──────────────────────────────────────────
        { lat: 27.0, lon: 51.0, radiusNm: 250 },   // Persian Gulf
        { lat: 33.0, lon: 53.0, radiusNm: 250 },   // Iran (center)
        { lat: 20.0, lon: 39.0, radiusNm: 250 },   // Red Sea / Yemen
        // ── Extended CENTCOM / AFRICOM ────────────────────────────────────
        { lat: 17.0, lon: 63.0, radiusNm: 250 },   // Arabian Sea (carrier ops, P-8 patrols)
        { lat: 11.0, lon: 43.0, radiusNm: 250 },   // Djibouti / Horn of Africa (Camp Lemonnier)
        { lat: 34.0, lon: 68.0, radiusNm: 250 },   // Pakistan / Afghanistan / Central Asia
        // ── EUCOM / Eastern Med ───────────────────────────────────────────
        { lat: 37.0, lon: 28.0, radiusNm: 300 },   // Eastern Med / Turkey (İncirlik, Akrotiri)
        { lat: 49.5, lon: 10.0, radiusNm: 300 },   // Central Europe / Germany (Ramstein, Spangdahlem)
        { lat: 51.0, lon: -1.0, radiusNm: 300 },   // UK / Western Europe (RAF Fairford B-52s, USAFE)
      ],
    },
    ais: {
      enabled: true,
      boundingBoxes: [
        [[23.0, 48.0], [30.0, 57.0]],
        [[25.5, 55.5], [27.0, 57.0]],
        [[22.0, 57.0], [26.0, 62.0]],
        [[12.0, 32.0], [30.0, 44.0]],
      ],
    },
    gdelt: {
      enabled: true,
      keywords: ['Iran', 'IRGC', 'Hormuz', 'Natanz', 'Fordow', 'Houthi', 'Persian Gulf'],
      cameoRootCodes: ['14', '15', '18', '19', '20'],
    },
    acled: {
      enabled: true,
      regions: [11],
      countries: ['IRN', 'IRQ', 'YEM', 'SAU', 'ISR', 'LBN', 'SYR'],
    },
    telegram: { channels: [] },
  },
  overlays: {
    bases: [
      { id: 'al-udeid',      name: 'Al Udeid AB',        lat: 25.1173, lon: 51.3150, type: 'airbase', party: 'US', country: 'Qatar',        strikeRanges: [{ type: 'F-22A', rangeKm: 760 }, { type: 'F-35A', rangeKm: 1100 }, { type: 'F-15E (ext.)', rangeKm: 2200 }] },
      { id: 'al-dhafra',     name: 'Al Dhafra AB',       lat: 24.2481, lon: 54.5483, type: 'airbase', party: 'US', country: 'UAE',           strikeRanges: [{ type: 'F-35A', rangeKm: 1100 }, { type: 'F-22A', rangeKm: 760 }] },
      { id: 'prince-sultan', name: 'Prince Sultan AB',   lat: 24.0627, lon: 47.5802, type: 'airbase', party: 'US', country: 'Saudi Arabia',  strikeRanges: [{ type: 'F-15E', rangeKm: 1700 }, { type: 'ALCM', rangeKm: 2500 }] },
      { id: 'bahrain-5th',   name: 'NSA Bahrain (5th Fleet)', lat: 26.2361, lon: 50.5954, type: 'naval',   party: 'US', country: 'Bahrain' },
      { id: 'camp-arifjan',  name: 'Camp Arifjan',       lat: 29.1130, lon: 48.0851, type: 'army',    party: 'US', country: 'Kuwait' },
      { id: 'bandar-abbas',  name: 'Bandar Abbas',       lat: 27.2189, lon: 56.3639, type: 'naval',   party: 'IR', country: 'Iran' },
      { id: 'bushehr-ab',    name: 'Bushehr AB',         lat: 28.9448, lon: 50.8347, type: 'airbase', party: 'IR', country: 'Iran' },
      { id: 'isfahan-ab',    name: 'Isfahan AB',         lat: 32.6207, lon: 51.6611, type: 'airbase', party: 'IR', country: 'Iran' },
    ],
    nuclearSites: [
      { id: 'natanz',   name: 'Natanz FEP',   lat: 33.7235, lon: 51.7271, status: 'active',      enrichment: '60%' },
      { id: 'fordow',   name: 'Fordow FFEP',  lat: 34.8846, lon: 50.9960, status: 'active',      enrichment: '84%' },
      { id: 'isfahan',  name: 'Isfahan UCF',  lat: 32.6569, lon: 51.6764, status: 'active',      enrichment: 'conversion' },
      { id: 'arak',     name: 'Arak IR-40',   lat: 34.3734, lon: 49.2408, status: 'modified',    enrichment: 'n/a' },
      { id: 'bushehr',  name: 'Bushehr NPP',  lat: 28.8314, lon: 50.8883, status: 'operational', enrichment: 'power reactor' },
      { id: 'parchin',  name: 'Parchin',      lat: 35.5167, lon: 51.7667, status: 'suspected',   enrichment: 'weapons research' },
    ],
    samSites: [
      { id: 'sam-isfahan',    name: 'S-300 Isfahan',       lat: 32.657, lon: 51.676, system: 'S-300PMU2',  range_km: 200, party: 'IR' },
      { id: 'sam-tehran-s',   name: 'S-300 Tehran South',  lat: 35.45,  lon: 51.15,  system: 'S-300PMU2',  range_km: 200, party: 'IR' },
      { id: 'sam-fordow',     name: 'Bavar-373 Fordow',    lat: 34.884, lon: 50.996, system: 'Bavar-373',  range_km: 200, party: 'IR' },
      { id: 'sam-tehran-n',   name: 'Khordad-15 Tehran N', lat: 35.75,  lon: 51.30,  system: 'Khordad-15', range_km: 120, party: 'IR' },
    ],
    shippingLanes: [
      {
        id: 'persian-gulf-main',
        name: 'Persian Gulf Main Channel',
        coordinates: [
          [56.6, 26.0], [55.0, 25.8], [53.5, 26.2],
          [52.0, 26.5], [50.8, 26.8], [49.5, 27.4],
          [48.8, 28.2], [48.3, 29.0],
        ],
      },
      {
        id: 'red-sea-main',
        name: 'Red Sea Main Channel',
        coordinates: [
          [43.5, 12.8], [42.8, 14.5], [41.5, 17.0],
          [39.5, 20.5], [38.0, 23.0], [36.2, 26.0],
          [34.5, 28.5], [32.5, 30.0],
        ],
      },
    ],
    chokepoints: [
      { id: 'hormuz',      name: 'Strait of Hormuz', lat: 26.5, lon: 56.3, radius_km: 50 },
      { id: 'bab-mandeb',  name: 'Bab el-Mandeb',    lat: 12.6, lon: 43.3, radius_km: 40 },
    ],
    countryHighlights: [
      { iso3: 'USA', party: 'US'  },
      { iso3: 'IRN', party: 'IR'  },
      { iso3: 'ISR', party: 'IL'  },
      { iso3: 'JOR', party: 'GCC' },
      { iso3: 'SAU', party: 'GCC' },
      { iso3: 'QAT', party: 'US'  },
      { iso3: 'ARE', party: 'US'  },
      { iso3: 'OMN', party: 'GCC' },
      { iso3: 'IRQ', party: 'GCC' },
      { iso3: 'BHR', party: 'US'  },
    ],
  },
  card: {
    accentColor: '#ef4444',
    keyMetrics: ['Aircraft tracked', 'AIS vessels', 'Incidents 24h', 'Strait status'],
  },
}

// ─── Israel–Gaza ──────────────────────────────────────────────────────────────

export const ISRAEL_GAZA: ConflictConfig = {
  slug: 'israel-gaza',
  name: 'Israel–Gaza',
  shortName: 'Levant',
  description: 'Israel-Gaza conflict, West Bank tensions, Lebanese front, and regional escalation.',
  status: 'active',
  intensity: 'critical',
  startDate: '2023-10-07',
  parties: [
    { name: 'Israel',       shortCode: 'IL', color: '#00b0ff', flagEmoji: '🇮🇱' },
    { name: 'Hamas / Gaza', shortCode: 'PS', color: '#ef4444', flagEmoji: '🇵🇸' },
    { name: 'Hezbollah',    shortCode: 'LB', color: '#f97316', flagEmoji: '🇱🇧' },
    { name: 'UNRWA / Aid',  shortCode: 'UN', color: '#94a3b8', flagEmoji: '🇺🇳' },
  ],
  map: {
    center: [35.2, 31.8],
    zoom: 7,
    bounds: { latMin: 27, latMax: 38, lonMin: 28, lonMax: 42 },
    theaters: [
      { id: 'gaza',      name: 'Gaza Strip',    bounds: { latMin: 31.2, latMax: 31.6, lonMin: 34.2, lonMax: 34.6 } },
      { id: 'west-bank', name: 'West Bank',     bounds: { latMin: 31.3, latMax: 32.6, lonMin: 34.8, lonMax: 35.6 } },
      { id: 'lebanon',   name: 'Lebanon Front', bounds: { latMin: 33.0, latMax: 34.7, lonMin: 35.0, lonMax: 36.7 } },
      { id: 'syria',     name: 'Syria',         bounds: { latMin: 32.0, latMax: 37.5, lonMin: 36.0, lonMax: 42.5 } },
    ],
  },
  dataSources: {
    adsb: {
      enabled: true,
      queryPoints: [
        { lat: 31.8, lon: 35.2, radiusNm: 200 },
        { lat: 33.8, lon: 36.0, radiusNm: 150 },
      ],
    },
    ais: {
      enabled: true,
      boundingBoxes: [
        [[29.0, 32.0], [34.0, 37.0]],
        [[27.0, 32.5], [32.0, 35.5]],
      ],
    },
    gdelt: {
      enabled: true,
      keywords: ['Israel', 'Gaza', 'Hamas', 'Hezbollah', 'West Bank', 'IDF', 'Netanyahu'],
      cameoRootCodes: ['14', '15', '18', '19', '20'],
    },
    acled: {
      enabled: true,
      regions: [11],
      countries: ['ISR', 'PSE', 'LBN', 'SYR', 'JOR'],
    },
    telegram: { channels: [] },
  },
  overlays: {
    bases: [
      { id: 'tel-nof',     name: 'Tel Nof AB',     lat: 31.840, lon: 34.818, type: 'airbase', party: 'IL', country: 'Israel', strikeRanges: [{ type: 'F-35I (Adir)', rangeKm: 1400 }, { type: "F-15I (Ra'am)", rangeKm: 1800 }] },
      { id: 'hatzerim',    name: 'Hatzerim AB',    lat: 31.225, lon: 34.664, type: 'airbase', party: 'IL', country: 'Israel', strikeRanges: [{ type: 'F-16I (Sufa)', rangeKm: 1600 }] },
      { id: 'ramat-david', name: 'Ramat David AB', lat: 32.665, lon: 35.179, type: 'airbase', party: 'IL', country: 'Israel', strikeRanges: [{ type: 'F-15I (Ra\'am)', rangeKm: 1800 }] },
    ],
    chokepoints: [
      { id: 'suez',  name: 'Suez Canal',   lat: 30.7,  lon: 32.3,  radius_km: 30 },
      { id: 'aqaba', name: 'Gulf of Aqaba', lat: 29.5, lon: 34.9,  radius_km: 25 },
    ],
    countryHighlights: [
      { iso3: 'ISR', party: 'IL' },
      { iso3: 'PSE', party: 'PS' },
      { iso3: 'LBN', party: 'LB' },
      { iso3: 'SYR', party: 'UN' },
      { iso3: 'EGY', party: 'UN' },
      { iso3: 'JOR', party: 'UN' },
    ],
  },
  card: {
    accentColor: '#00b0ff',
    keyMetrics: ['Aircraft tracked', 'Incidents 24h', 'Airstrikes', 'Casualties reported'],
  },
}

// ─── Russia–Ukraine ────────────────────────────────────────────────────────────

export const RUSSIA_UKRAINE: ConflictConfig = {
  slug: 'russia-ukraine',
  name: 'Russia–Ukraine',
  shortName: 'Eastern Europe',
  description: 'Full-scale Russian invasion of Ukraine. Active front lines across the east and south.',
  status: 'active',
  intensity: 'critical',
  startDate: '2022-02-24',
  parties: [
    { name: 'Russia',  shortCode: 'RU',   color: '#ef4444', flagEmoji: '🇷🇺' },
    { name: 'Ukraine', shortCode: 'UA',   color: '#3b82f6', flagEmoji: '🇺🇦' },
    { name: 'NATO',    shortCode: 'NATO', color: '#a855f7', flagEmoji: '🟦' },
  ],
  map: {
    center: [32.0, 49.0],
    zoom: 5,
    bounds: { latMin: 44, latMax: 53, lonMin: 22, lonMax: 42 },
    theaters: [
      { id: 'donbas',      name: 'Donbas Front',    bounds: { latMin: 47, latMax: 49.5, lonMin: 36, lonMax: 40 } },
      { id: 'zaporizhzhia', name: 'Zaporizhzhia',   bounds: { latMin: 46, latMax: 48,   lonMin: 34, lonMax: 37 } },
      { id: 'kherson',     name: 'Kherson/South',   bounds: { latMin: 46, latMax: 47.5, lonMin: 32, lonMax: 35 } },
      { id: 'kharkiv',     name: 'Kharkiv Region',  bounds: { latMin: 49, latMax: 51,   lonMin: 35, lonMax: 38 } },
    ],
  },
  dataSources: {
    adsb: {
      enabled: true,
      queryPoints: [
        { lat: 50.4, lon: 30.5, radiusNm: 250 },  // Kyiv
        { lat: 50.0, lon: 36.2, radiusNm: 200 },  // Kharkiv
        { lat: 46.5, lon: 30.7, radiusNm: 150 },  // Odesa
      ],
    },
    ais: {
      enabled: true,
      boundingBoxes: [
        [[41.0, 27.0], [47.5, 41.5]],  // Black Sea
      ],
    },
    gdelt: {
      enabled: true,
      keywords: ['Ukraine', 'Russia', 'Zelensky', 'Putin', 'Kharkiv', 'Zaporizhzhia', 'Crimea', 'Bakhmut'],
      cameoRootCodes: ['14', '15', '18', '19', '20'],
    },
    acled: {
      enabled: true,
      regions: [12],
      countries: ['UKR', 'RUS', 'BLR'],
    },
    telegram: { channels: [] },
  },
  overlays: {
    bases: [
      { id: 'boryspil',          name: 'Kyiv Boryspil IAP',           lat: 50.3450, lon: 30.8946, type: 'airbase',  party: 'UA', country: 'Ukraine',   strikeRanges: [{ type: 'MiG-29 (UA)', rangeKm: 700 }, { type: 'Su-27 (UA)', rangeKm: 900 }] },
      { id: 'myrhorod',          name: 'Myrhorod AB',                 lat: 49.9663, lon: 33.4796, type: 'airbase',  party: 'UA', country: 'Ukraine' },
      { id: 'starokostiantyniv', name: 'Starokostiantyniv AB',        lat: 49.7367, lon: 27.1900, type: 'airbase',  party: 'UA', country: 'Ukraine',   strikeRanges: [{ type: 'Su-24M (UA)', rangeKm: 1200 }] },
      { id: 'belgorod',          name: 'Belgorod AB',                 lat: 50.6439, lon: 36.5900, type: 'airbase',  party: 'RU', country: 'Russia',    strikeRanges: [{ type: 'Su-35S (RU)', rangeKm: 1500 }, { type: 'Su-34 (RU)', rangeKm: 1100 }] },
      { id: 'minsk-machulishchy', name: 'Minsk-Machulishchy AB',     lat: 53.8645, lon: 27.5371, type: 'airbase',  party: 'RU', country: 'Belarus' },
      { id: 'sevastopol',        name: 'Sevastopol Naval Base',       lat: 44.6235, lon: 33.5228, type: 'naval',    party: 'RU', country: 'Crimea' },
    ],
    chokepoints: [
      { id: 'kerch',   name: 'Kerch Strait',  lat: 45.3,  lon: 36.5, radius_km: 40 },
      { id: 'odesa',   name: 'Odesa Port',    lat: 46.48, lon: 30.73, radius_km: 25 },
    ],
    countryHighlights: [
      { iso3: 'UKR', party: 'UA'   },
      { iso3: 'RUS', party: 'RU'   },
      { iso3: 'BLR', party: 'RU'   },
      { iso3: 'POL', party: 'NATO' },
      { iso3: 'ROU', party: 'NATO' },
      { iso3: 'MDA', party: 'NATO' },
      { iso3: 'HUN', party: 'NATO' },
      { iso3: 'SVK', party: 'NATO' },
    ],
  },
  card: {
    accentColor: '#3b82f6',
    keyMetrics: ['Aircraft tracked', 'AIS vessels', 'Incidents 24h', 'Front line'],
  },
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const ALL_CONFLICTS: ConflictConfig[] = [US_IRAN, ISRAEL_GAZA, RUSSIA_UKRAINE]

export function getConflict(slug: string): ConflictConfig | undefined {
  return ALL_CONFLICTS.find(c => c.slug === slug)
}
