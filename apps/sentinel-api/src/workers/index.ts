import { startADSBWorker }      from './adsb.worker.js'
import { startAISWorker }       from './ais.worker.js'
import { startGDELTWorker }     from './gdelt.worker.js'
import { startACLEDWorker }     from './acled.worker.js'
import { startTelegramWorker }  from './telegram.worker.js'
import { startIAEAWorker }      from './iaea.worker.js'
import { startSitrepWorker }    from './sitrep.worker.js'
import { startEconomicWorker }  from './economic.worker.js'

export function startWorkers(): void {
  console.log('[workers] starting...')
  startADSBWorker(60_000)  // 60s — accommodates 18 query points across all conflicts
  startAISWorker()
  startGDELTWorker()
  startACLEDWorker()
  startTelegramWorker()
  startIAEAWorker()
  startSitrepWorker()
  startEconomicWorker()
}
