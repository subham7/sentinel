## Satellite / Imagery

| Source | Endpoint | Auth | Notes |
|---|---|---|---|
| NASA GIBS | `https://gibs.earthdata.nasa.gov/wmts/...` | None | ~24h latency |
| NASA FIRMS | `https://firms.modaps.eosdis.nasa.gov/mapserver/wms/fires/{key}/...` | Free key | 15-min latency |
| Copernicus Sentinel Hub | `https://sh.dataspace.copernicus.eu/ogc/wms/{INSTANCE_ID}` | OAuth2 (proxied) | 10m resolution |
| Element84 Earth Search (STAC) | `https://earth-search.aws.element84.com/v1/search` | None | Sentinel-2 L2A scene discovery |
| GPSJam.org | `https://gpsjam.org/export.json?day=YYYY-MM-DD` | None | Daily, cache 24h |

## Intelligence / Context

| Source | Endpoint | Auth | Use |
|---|---|---|---|
| UCDP GED | `https://ucdpapi.pcr.uu.se/api/gedevents/25.1` | None | Home globe choropleth |
| Global Fishing Watch | `https://gateway.api.globalfishingwatch.org/v3/` | Free key | AIS gaps, SAR vessel detections |
| IODA | `https://api.ioda.inetintel.cc.gatech.edu/v2/outages/country` | None | Internet connectivity (BGP) |
| OONI | `https://api.ooni.io/api/v1/measurements` | None | Censorship measurements |
| OpenSanctions | `https://api.opensanctions.org/match/default` | Free for OSS | Entity sanctions cross-reference |
| Cloudflare Radar | `https://api.cloudflare.com/client/v4/radar/traffic/timeseries` | Free token | Country traffic anomalies |
| IMF PortWatch | ArcGIS GeoServices REST (public) | None | Chokepoint transit volumes |

## Additional Env Vars (additions to existing list)
```bash
# Satellite
FIRMS_MAP_KEY=                  # firms.modaps.eosdis.nasa.gov — free registration
SENTINEL_HUB_CLIENT_ID=         # dataspace.copernicus.eu — free tier
SENTINEL_HUB_CLIENT_SECRET=     # dataspace.copernicus.eu

# Push Notifications
VAPID_PUBLIC_KEY=               # npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=
VAPID_EMAIL=                    # mailto:your@email.com

# Internal Microservices
NER_SERVICE_URL=http://localhost:8001    # ConfliBERT Python sidecar
TITILER_URL=http://localhost:8080        # Optional: for COG tile serving
```