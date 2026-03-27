"use client"

import { useState, useEffect } from "react"
import { Clock, DollarSign, Cpu, TrendingUp, X, ChevronDown, ChevronUp } from "lucide-react"
import { sessionMetricsTracker, type SessionMetricsSnapshot } from "@/lib/session-metrics-comprehensive-tracker"

interface DevMetricsIndicatorProps {
  sessionId: string;
}

export function DevMetricsIndicator({ sessionId }: DevMetricsIndicatorProps) {
  const [metrics, setMetrics] = useState<SessionMetricsSnapshot | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isVisible, setIsVisible] = useState(true)
  
  // Only show in development mode
  const isDev = process.env.NODE_ENV === 'development'
  
  useEffect(() => {
    if (!isDev) return
    
    // Poll for metrics updates
    const interval = setInterval(() => {
      const { snapshot } = sessionMetricsTracker.getSessionMetrics(sessionId)
      if (snapshot) {
        setMetrics(snapshot)
      }
    }, 1000) // Update every second
    
    return () => clearInterval(interval)
  }, [sessionId, isDev])
  
  // Hide in production
  if (!isDev || !isVisible || !metrics) return null
  
  const formatCost = (cost: number) => {
    return cost < 0.01 ? `$${cost.toFixed(6)}` : `$${cost.toFixed(4)}`
  }
  
  const formatTime = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }
  
  const formatNumber = (num: number) => {
    return num.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-gray-900/95 backdrop-blur-sm text-white rounded-lg shadow-2xl border border-gray-700 max-w-md">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-xs font-semibold text-gray-300">DEV METRICS</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-gray-800 rounded transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            )}
          </button>
          <button
            onClick={() => setIsVisible(false)}
            className="p-1 hover:bg-gray-800 rounded transition-colors"
            title="Hide metrics"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>
      
      {/* Compact View */}
      {!isExpanded && (
        <div className="px-4 py-3">
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <div className="text-gray-400 mb-1">Interactions</div>
              <div className="font-mono text-lg font-semibold">{metrics.totalInteractions}</div>
            </div>
            <div>
              <div className="text-gray-400 mb-1">Total Cost</div>
              <div className="font-mono text-lg font-semibold text-green-400">
                {formatCost(metrics.totals.totalCost)}
              </div>
            </div>
            <div>
              <div className="text-gray-400 mb-1">Avg Time</div>
              <div className="font-mono text-lg font-semibold">
                {formatTime(metrics.totals.averageResponseTime)}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Expanded View */}
      {isExpanded && (
        <div className="px-4 py-3 space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Cpu className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-gray-400">Tokens</span>
              </div>
              <div className="font-mono text-xl font-semibold">
                {formatNumber(metrics.totals.tokensConsumed)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {formatNumber(metrics.efficiency.tokensPerInteraction)}/interaction
              </div>
            </div>
            
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-green-400" />
                <span className="text-xs text-gray-400">Cost</span>
              </div>
              <div className="font-mono text-xl font-semibold text-green-400">
                {formatCost(metrics.totals.totalCost)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {formatCost(metrics.efficiency.costPerInteraction)}/interaction
              </div>
            </div>
            
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-purple-400" />
                <span className="text-xs text-gray-400">Time</span>
              </div>
              <div className="font-mono text-xl font-semibold">
                {formatTime(metrics.totals.totalTime)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {formatTime(metrics.totals.averageResponseTime)}/response
              </div>
            </div>
            
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-yellow-400" />
                <span className="text-xs text-gray-400">Throughput</span>
              </div>
              <div className="font-mono text-xl font-semibold">
                {formatNumber(metrics.efficiency.averageTokensPerSecond)}
              </div>
              <div className="text-xs text-gray-500 mt-1">tokens/sec</div>
            </div>
          </div>
          
          {/* Agent Usage */}
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-2">Agent Usage</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-500 h-full transition-all duration-300"
                  style={{ width: '100%' }}
                />
              </div>
              <span className="text-xs font-mono text-gray-300">
                {metrics.patterns.preferredAgent}
              </span>
            </div>
          </div>
          
          {/* Session Info */}
          <div className="pt-2 border-t border-gray-700 text-xs text-gray-500">
            <div className="flex justify-between">
              <span>Total Interactions:</span>
              <span className="font-mono">{metrics.totalInteractions}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span>Agent Switches:</span>
              <span className="font-mono">
                {(metrics.patterns.agentSwitchFrequency * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      )}
      
      {/* Footer with model info */}
      <div className="px-4 py-2 border-t border-gray-700 bg-gray-800/30">
        <div className="text-[10px] text-gray-500 text-center">
          Session: {sessionId.slice(0, 8)}... | Click to {isExpanded ? 'collapse' : 'expand'}
        </div>
      </div>
    </div>
  )
}

// Button to toggle visibility (shown when indicator is hidden)
export function DevMetricsToggle({ onClick }: { onClick: () => void }) {
  const isDev = process.env.NODE_ENV === 'development'
  
  if (!isDev) return null
  
  return (
    <button
      onClick={onClick}
      className="fixed bottom-4 right-4 z-50 bg-gray-900/95 backdrop-blur-sm text-white rounded-full p-3 shadow-2xl border border-gray-700 hover:bg-gray-800 transition-colors"
      title="Show dev metrics"
    >
      <TrendingUp className="w-5 h-5" />
    </button>
  )
}
