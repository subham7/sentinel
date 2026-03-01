import { startADSBWorker }     from './adsb.worker.js'
import { startAISWorker }      from './ais.worker.js'
import { startGDELTWorker }    from './gdelt.worker.js'
import { startACLEDWorker }    from './acled.worker.js'
import { startTelegramWorker } from './telegram.worker.js'

export function startWorkers(): void {
  console.log('[workers] starting...')
  startADSBWorker()
  startAISWorker()
  startGDELTWorker()
  startACLEDWorker()
  startTelegramWorker()
}
