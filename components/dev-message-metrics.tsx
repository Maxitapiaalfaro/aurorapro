"use client"

import { useState, useEffect } from "react"
import { ArrowUpDown, Zap } from "lucide-react"
import { sessionMetricsTracker, type ComprehensiveSessionMetrics } from "@/lib/session-metrics-comprehensive-tracker"

interface DevMessageMetricsProps {
  sessionId: string;
  messageIndex: number;
}

export function DevMessageMetrics({ sessionId, messageIndex }: DevMessageMetricsProps) {
  const [metrics, setMetrics] = useState<ComprehensiveSessionMetrics | null>(null)
  const [showComparison, setShowComparison] = useState(false)
  
  // Only show in development mode
  const isDev = process.env.NODE_ENV === 'development'
  
  useEffect(() => {
    if (!isDev) return
    
    // Get metrics for this specific message
    const { interactions } = sessionMetricsTracker.getSessionMetrics(sessionId)
    if (interactions && interactions[messageIndex]) {
      setMetrics(interactions[messageIndex])
    }
  }, [sessionId, messageIndex, isDev])
  
  if (!isDev || !metrics) return null
  
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
  
  // Calculate what the cost would be with different models
  const calculateAlternativeCost = (modelName: string) => {
    const pricing = sessionMetricsTracker.getModelPricing(modelName)
    if (!pricing || typeof pricing === 'object' && !pricing.inputCostPer1KTokens) return null
    
    const pricingData = pricing as { inputCostPer1KTokens: number; outputCostPer1KTokens: number; displayName: string }
    
    const inputCost = (metrics.tokens.inputTokens / 1000) * pricingData.inputCostPer1KTokens
    const outputCost = (metrics.tokens.outputTokens / 1000) * pricingData.outputCostPer1KTokens
    return {
      total: inputCost + outputCost,
      displayName: pricingData.displayName
    }
  }
  
  const currentModel = metrics.computational.modelUsed
  const allPricing = sessionMetricsTracker.getModelPricing() as Record<string, { displayName: string }>
  const availableModels = Object.keys(allPricing)

  return (
    <div className="inline-block ml-2">
      <button
        onClick={() => setShowComparison(!showComparison)}
        className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] bg-gray-800/50 hover:bg-gray-800 text-gray-400 rounded border border-gray-700/50 transition-colors"
        title="View message metrics"
      >
        <Zap className="w-3 h-3" />
        <span className="font-mono">{formatCost(metrics.tokens.estimatedCost)}</span>
        <span className="text-gray-600">|</span>
        <span className="font-mono">{formatTime(metrics.timing.modelResponseTime)}</span>
        <span className="text-gray-600">|</span>
        <span className="font-mono">{formatNumber(metrics.tokens.totalTokens)}t</span>
      </button>
      
      {showComparison && (
        <div className="absolute z-50 mt-2 w-96 bg-gray-900/98 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-700">
            <h3 className="text-xs font-semibold text-gray-300">Message Metrics</h3>
            <button
              onClick={() => setShowComparison(false)}
              className="text-gray-500 hover:text-gray-300 text-xs"
            >
              Close
            </button>
          </div>
          
          {/* Current metrics */}
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Model:</span>
              <span className="font-mono text-white">{allPricing[currentModel]?.displayName || currentModel}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Agent:</span>
              <span className="font-mono text-blue-400">{metrics.computational.agentUsed}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Input tokens:</span>
              <span className="font-mono text-white">{formatNumber(metrics.tokens.inputTokens)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Output tokens:</span>
              <span className="font-mono text-white">{formatNumber(metrics.tokens.outputTokens)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Context tokens:</span>
              <span className="font-mono text-gray-500">{formatNumber(metrics.tokens.contextTokens)}</span>
            </div>
            <div className="flex justify-between text-xs pt-2 border-t border-gray-700">
              <span className="text-gray-400">Total tokens:</span>
              <span className="font-mono text-white font-semibold">{formatNumber(metrics.tokens.totalTokens)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Response time:</span>
              <span className="font-mono text-purple-400">{formatTime(metrics.timing.modelResponseTime)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Cost:</span>
              <span className="font-mono text-green-400 font-semibold">{formatCost(metrics.tokens.estimatedCost)}</span>
            </div>
          </div>
          
          {/* Model comparison */}
          <div className="pt-3 border-t border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <ArrowUpDown className="w-3 h-3 text-gray-400" />
              <span className="text-xs font-semibold text-gray-400">Model Comparison</span>
            </div>
            
            <div className="space-y-1.5">
              {availableModels.map(modelKey => {
                const altCost = calculateAlternativeCost(modelKey)
                if (!altCost) return null
                
                const isCurrent = modelKey === currentModel
                const difference = altCost.total - metrics.tokens.estimatedCost
                const percentDiff = ((difference / metrics.tokens.estimatedCost) * 100)
                
                return (
                  <div
                    key={modelKey}
                    className={`flex items-center justify-between p-2 rounded ${
                      isCurrent ? 'bg-blue-900/20 border border-blue-700/30' : 'bg-gray-800/30'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isCurrent && (
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                      )}
                      <span className={`text-xs font-mono ${isCurrent ? 'text-white' : 'text-gray-400'}`}>
                        {altCost.displayName}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-mono ${isCurrent ? 'text-green-400' : 'text-gray-400'}`}>
                        {formatCost(altCost.total)}
                      </span>
                      
                      {!isCurrent && (
                        <span className={`text-[10px] font-mono ${
                          difference > 0 ? 'text-red-400' : 'text-green-400'
                        }`}>
                          {difference > 0 ? '+' : ''}{percentDiff.toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            
            <div className="mt-3 text-[10px] text-gray-500 italic">
              * Comparison based on same token counts
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
