// In-process pub/sub for SSE incident streaming
// Workers emit here; SSE route handler subscribes per client

import { EventEmitter } from 'node:events'
import type { Incident } from '@sentinel/shared'

class IncidentBus extends EventEmitter {}

export const incidentBus = new IncidentBus()
incidentBus.setMaxListeners(500)

export function emitIncident(incident: Incident): void {
  for (const slug of incident.conflict_slugs) {
    incidentBus.emit(`incident:${slug}`, incident)
  }
}
