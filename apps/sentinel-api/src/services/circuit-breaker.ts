// Per-feed circuit breaker
// States: closed (normal) → open (after N failures) → half-open (after cooldown) → closed/open

type State = 'closed' | 'open' | 'half-open'

export class CircuitBreaker {
  private state:       State  = 'closed'
  private failures:    number = 0
  private nextAttempt: number = 0

  constructor(
    private readonly name:        string,
    private readonly maxFailures: number = 3,
    private readonly openMs:      number = 5 * 60 * 1000,
  ) {}

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() < this.nextAttempt) {
        throw new Error(`CircuitBreaker[${this.name}] is OPEN — retry after ${new Date(this.nextAttempt).toISOString()}`)
      }
      this.state = 'half-open'
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (err) {
      this.onFailure()
      throw err
    }
  }

  private onSuccess(): void {
    this.failures = 0
    this.state    = 'closed'
  }

  private onFailure(): void {
    this.failures++
    if (this.failures >= this.maxFailures) {
      this.state       = 'open'
      this.nextAttempt = Date.now() + this.openMs
      console.warn(
        `[circuit-breaker] ${this.name} OPEN for ${this.openMs / 60_000}min after ${this.failures} failures`,
      )
    }
  }

  get isOpen(): boolean {
    return this.state === 'open' && Date.now() < this.nextAttempt
  }

  get currentState(): State {
    return this.state
  }
}
