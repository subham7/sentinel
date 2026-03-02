export interface DiplomaticEvent {
  id:               string
  title:            string
  description?:     string
  date:             string   // ISO date string
  type:             'vote' | 'talks' | 'ceasefire' | 'inspection' | 'deadline' | 'summit'
  conflictSlug?:    string
  countdownEnabled: boolean
}

export const DIPLOMATIC_EVENTS: DiplomaticEvent[] = [
  {
    id:               'gaza-phase2-review-mar26',
    title:            'Gaza Hostage Deal — Phase 2 Review',
    description:      'Scheduled review of Phase 2 terms; failure risks full collapse of the ceasefire framework',
    date:             '2026-03-15T12:00:00Z',
    type:             'ceasefire',
    conflictSlug:     'israel-gaza',
    countdownEnabled: true,
  },
  {
    id:               'iaea-natanz-q1-2026',
    title:            'IAEA Inspection — Natanz Complex',
    description:      'Quarterly IAEA safeguards inspection at Natanz enrichment facility',
    date:             '2026-03-22T08:00:00Z',
    type:             'inspection',
    conflictSlug:     'us-iran',
    countdownEnabled: true,
  },
  {
    id:               'us-iran-talks-muscat-mar26',
    title:            'US–Iran Indirect Talks — Muscat',
    description:      'Third round of indirect negotiations via Omani intermediaries on nuclear file',
    date:             '2026-03-28T00:00:00Z',
    type:             'talks',
    conflictSlug:     'us-iran',
    countdownEnabled: true,
  },
  {
    id:               'unsc-iran-sanctions-apr26',
    title:            'UNSC Vote — Iran Sanctions Review',
    date:             '2026-04-08T15:00:00Z',
    type:             'vote',
    conflictSlug:     'us-iran',
    countdownEnabled: true,
  },
  {
    id:               'ukraine-support-summit-brussels-apr26',
    title:            'Ukraine Support Summit — Brussels',
    description:      'NATO + EU joint summit on long-term security guarantees and weapons packages',
    date:             '2026-04-10T09:00:00Z',
    type:             'summit',
    conflictSlug:     'russia-ukraine',
    countdownEnabled: false,
  },
  {
    id:               'lebanon-ceasefire-180d-apr26',
    title:            'Lebanon Ceasefire — 180-Day Review',
    description:      'Mandatory review point for UNSCR 1701 ceasefire compliance; withdrawal benchmarks assessed',
    date:             '2026-04-17T00:00:00Z',
    type:             'ceasefire',
    conflictSlug:     'israel-gaza',
    countdownEnabled: true,
  },
]
