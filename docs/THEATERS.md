# SENTINEL — Conflict Theater System

How to add, configure, and extend conflict theaters.

---

## The ConflictConfig Interface (`packages/shared/src/conflicts.ts`)
```typescript
export interface ConflictConfig {
  slug: string                          // URL segment: 'us-iran', 'israel-gaza'
  name: string                          // 'US–Iran'
  shortName: string                     // 'Persian Gulf'
  description: string
  status: 'active' | 'frozen' | 'monitoring'
  intensity: 'critical' | 'high' | 'elevated' | 'low'
  startDate: string                     // ISO date

  parties: {
    name: string
    shortCode: string                   // 'US', 'IR', 'IL'
    color: string                       // hex — used for map markers + chart colors
    flagEmoji: string
  }[]

  map: {
    center: [number, number]            // [lon, lat]
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
      countries: string[]               // ISO3 codes e.g. 'IRN', 'ISR', 'PSE'
    }
    telegram: {
      channels: string[]                // public channel usernames, no @
    }
  }

  overlays: {
    bases: MilitaryBase[]
    nuclearSites?: NuclearSite[]
    samSites?: SamSite[]
    shippingLanes?: GeoJSON.Feature[]
    chokepoints?: Chokepoint[]
  }

  // Prediction market keyword filter
  markets: {
    polymarketKeywords: string[]        // e.g. ['iran', 'nuclear', 'hormuz']
    kalshiKeywords: string[]
  }

  card: {
    accentColor: string
    keyMetrics: string[]
  }
}
```

---

## Adding a New Theater (Step by Step)

1. Add a new `ConflictConfig` object to `packages/shared/src/conflicts.ts`
   and push it into `ALL_CONFLICTS`.

2. Set `dataSources.adsb.queryPoints` to 2–4 lat/lon points covering the
   region with appropriate radius (200–500 NM).

3. Set `dataSources.ais.boundingBoxes` to cover key maritime areas.

4. Set `dataSources.gdelt.keywords` (10–20 terms) and `cameoRootCodes`
   (use CAMEO codes 14=protest, 19=fight, 20=use force).

5. Set `dataSources.acled.countries` with ISO3 codes and `regions` with
   ACLED region numbers.

6. Add public Telegram channel usernames to `dataSources.telegram.channels`.

7. Add static overlay data (military bases, SAM sites) to
   `packages/shared/src/military-data.ts` and reference in `overlays`.

8. Run `npm run dev` — the theater appears on the home page, its dashboard
   opens at `/conflicts/{slug}`, and all workers begin ingesting data.
   No other code changes required.

---

## Active Theater Summaries

### `us-iran`
- Parties: US (blue `#00b0ff`), Iran/IRGC (red `#ef4444`)
- Focus: Persian Gulf, Strait of Hormuz, Red Sea, CENTCOM theater
- Unique widgets: Hormuz vessel counter, oil price widget, Rial rate, IMF PortWatch
- Nuclear sites: Natanz, Fordow, Arak, Bushehr
- SAM sites: S-300, Bavar-373, HQ-9, Tor-M1 (Iran) + Patriot, THAAD, SM-3 (CENTCOM)

### `israel-gaza`
- Parties: Israel (green `#22c55e`), Hamas/PIJ (red), Hezbollah (amber)
- Focus: Gaza Strip, West Bank, Lebanon front, Syria
- Unique overlays: Suez chokepoint

### `russia-ukraine`
- Parties: Ukraine (blue), Russia (red `#ef4444`)
- Focus: Eastern Ukraine, Black Sea, Crimea
- Unique layers: Frontline / territorial control GeoJSON

---

## Known Limitations Per Theater

| Theater | Limitation | Mitigation |
|---|---|---|
| us-iran | ADS-B sparse over central Iran (IRIAF activity partially blind) | Note in DataFreshness panel |
| us-iran | AIS limited to coastal/port areas — IRGC fast boats invisible | AIS-dark flag |
| israel-gaza | GDELT geocoding unreliable for small Gaza localities | ACLED takes priority |
| all | ACLED updates weekly (7-day lag on ground events) | GDELT + Telegram fill gap |