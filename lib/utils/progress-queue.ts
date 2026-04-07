/**
 * ProgressQueue — Lightweight async iterable queue for real-time progress events.
 *
 * Used by streaming-handler.ts to drain sub-agent progress messages concurrently
 * with tool execution, enabling the async generator to yield SSE events in real-time
 * while tools are still running.
 *
 * Pattern: producer calls push(), consumer iterates with for-await-of.
 * Call finish() when producers are done — the iterator will drain remaining items and return.
 */
export class ProgressQueue<T> {
  private buffer: T[] = [];
  private resolve: (() => void) | null = null;
  private done = false;

  /** Enqueue an item. Wakes the consumer if it's waiting. */
  push(item: T) {
    this.buffer.push(item);
    if (this.resolve) {
      this.resolve();
      this.resolve = null;
    }
  }

  /** Signal that no more items will be pushed. The iterator drains remaining items and returns. */
  finish() {
    this.done = true;
    if (this.resolve) {
      this.resolve();
      this.resolve = null;
    }
  }

  /** Async iterator — yields items as they arrive, returns when finish() is called. */
  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    while (true) {
      // Drain buffered items
      while (this.buffer.length > 0) {
        yield this.buffer.shift()!;
      }
      // If done and buffer empty, we're finished
      if (this.done) return;
      // Wait for next push() or finish()
      await new Promise<void>(r => { this.resolve = r; });
    }
  }
}
