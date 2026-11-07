/**
 * Counts work in flight (promises handed to `track`) so a caller can wait until none is left, e.g. a page that may
 * only report itself ready once every file it started loading has arrived.
 */
export class PendingWork {
  private inFlight = 0;
  private waiters: (() => void)[] = [];

  get count(): number {
    return this.inFlight;
  }

  /** Counts `work` until it settles; returns it unchanged. */
  track<T>(work: Promise<T>): Promise<T> {
    this.inFlight++;
    const done = () => {
      this.inFlight--;
      if (this.inFlight > 0) return;
      const waiters = this.waiters;
      this.waiters = [];
      for (const wake of waiters) wake();
    };
    work.then(done, done);
    return work;
  }

  /** Resolves once nothing is in flight (at once when nothing is). */
  idle(): Promise<void> {
    if (this.inFlight === 0) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}
