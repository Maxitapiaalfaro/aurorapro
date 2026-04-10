/**
 * Production Performance Logger
 *
 * Aggregates timing measurements for orchestration pipeline monitoring.
 * Tracks P50/P95/P99 latency distributions for key operations.
 *
 * Part of Phase 5: Production Instrumentation (Task 2)
 *
 * @see tasks/PERFORMANCE_OPTIMIZATION_PLAN.md
 */

interface TimingEntry {
  operation: string
  duration: number
  timestamp: number
}

interface Stats {
  count: number
  avg: number
  p50: number
  p95: number
  p99: number
  min: number
  max: number
}

class PerformanceLogger {
  private static timings: TimingEntry[] = []
  private static maxEntries = 1000 // Prevent memory leak
  private static messageCount = 0

  /**
   * Log a timing measurement for a specific operation
   */
  static log(operation: string, duration: number): void {
    this.timings.push({
      operation,
      duration,
      timestamp: Date.now()
    })

    // Prevent memory leak by keeping only last N entries
    if (this.timings.length > this.maxEntries) {
      this.timings.shift()
    }
  }

  /**
   * Increment message counter and trigger periodic reporting
   */
  static incrementMessageCount(): void {
    this.messageCount++

    // Report every 100 messages
    if (this.messageCount % 100 === 0) {
      this.report()
    }
  }

  /**
   * Calculate percentile from sorted array
   */
  private static percentile(values: number[], p: number): number {
    if (values.length === 0) return 0

    const sorted = [...values].sort((a, b) => a - b)
    const index = Math.ceil(sorted.length * p) - 1
    return sorted[Math.max(0, index)]
  }

  /**
   * Calculate mean from array
   */
  private static mean(values: number[]): number {
    if (values.length === 0) return 0
    return values.reduce((sum, val) => sum + val, 0) / values.length
  }

  /**
   * Get statistics for a specific operation
   */
  static getStats(operation: string): Stats {
    const entries = this.timings.filter(t => t.operation === operation)
    const durations = entries.map(e => e.duration)

    if (durations.length === 0) {
      return { count: 0, avg: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 }
    }

    return {
      count: durations.length,
      avg: this.mean(durations),
      p50: this.percentile(durations, 0.5),
      p95: this.percentile(durations, 0.95),
      p99: this.percentile(durations, 0.99),
      min: Math.min(...durations),
      max: Math.max(...durations)
    }
  }

  /**
   * Generate performance report
   */
  static report(): void {
    console.log('\n📊 Orchestration Performance Report')
    console.log(`📈 Messages processed: ${this.messageCount}`)
    console.log(`📊 Sample size: ${this.timings.length} measurements\n`)

    const operations = [
      'orchestration-total',
      'metadata-collection',
      'routing',
      'metrics-update'
    ]

    for (const op of operations) {
      const stats = this.getStats(op)

      if (stats.count === 0) {
        console.log(`${op}: No measurements`)
        continue
      }

      console.log(`${op}:`)
      console.log(`  Count: ${stats.count}`)
      console.log(`  Avg:   ${stats.avg.toFixed(2)}ms`)
      console.log(`  P50:   ${stats.p50.toFixed(2)}ms`)
      console.log(`  P95:   ${stats.p95.toFixed(2)}ms ← Target: <5ms`)
      console.log(`  P99:   ${stats.p99.toFixed(2)}ms`)
      console.log(`  Range: ${stats.min.toFixed(2)}ms - ${stats.max.toFixed(2)}ms`)

      // Alert if P95 exceeds target
      if (op === 'orchestration-total' && stats.p95 > 5) {
        console.log(`  ⚠️  WARNING: P95 exceeds 5ms target`)
      }

      console.log('')
    }
  }

  /**
   * Get raw timing data for analysis
   */
  static getRawTimings(): TimingEntry[] {
    return [...this.timings]
  }

  /**
   * Clear all accumulated timing data
   */
  static clear(): void {
    this.timings = []
    this.messageCount = 0
  }
}

export { PerformanceLogger }
export type { TimingEntry, Stats }
