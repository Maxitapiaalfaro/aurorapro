"use client"

import { Zap, Brain, Search, MessageSquare } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { getAgentVisualConfig } from "@/config/agent-visual-config"
import type { AgentType } from "@/types/clinical-types"
import type { TransitionState } from "@/hooks/use-hopeai-system"

interface AgentIndicatorProps {
  activeAgent: AgentType
  isTyping: boolean
  transitionState?: TransitionState
}

export function AgentIndicator({ activeAgent, isTyping, transitionState = 'idle' }: AgentIndicatorProps) {
  const config = getAgentVisualConfig(activeAgent)
  const IconComponent = config.icon

  const getTransitionConfig = () => {
    switch (transitionState) {
      case 'thinking':
        return {
          icon: Brain,
          message: 'Evaluando consulta clínica...',
          textColor: 'text-muted-foreground',
          bgColor: 'bg-secondary/80',
          borderColor: 'border-border'
        }
      case 'selecting_agent':
        return {
          icon: Search,
          message: 'Determinando modalidad de análisis especializado...',
          textColor: 'text-muted-foreground',
          bgColor: 'bg-secondary/80',
          borderColor: 'border-border'
        }
      case 'specialist_responding':
        return {
          icon: MessageSquare,
          message: `${config.name} procesando análisis...`,
          textColor: config.textColor,
          bgColor: config.bgColor,
          borderColor: config.borderColor
        }
      default:
        return null
    }
  }

  const transitionConfig = getTransitionConfig()
  const isInTransition = transitionState !== 'idle'
  const showTyping = isTyping || isInTransition

  const displayConfig = transitionConfig || config
  const DisplayIcon = transitionConfig?.icon || IconComponent

  return (
    <motion.div 
      className={cn("px-4 pb-2 pt-0 paper-noise color-fragment", displayConfig.bgColor || "bg-[hsl(var(--agent-orquestador-bg))]")}
      animate={{
        backgroundColor: displayConfig.bgColor
      }}
      transition={{ duration: 0.4, ease: "easeInOut" }}
    >
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeAgent}-${transitionState}`}
              initial={{ scale: 0.8, opacity: 0, rotate: -10 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.8, opacity: 0, rotate: 10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="relative"
            >
              <DisplayIcon className={cn("h-5 w-5 transition-colors duration-300 animate-gentle-flicker", displayConfig.textColor)} />
              <AnimatePresence>
                {showTyping && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute -top-1 -right-1"
                  >
                    <Zap className="h-3 w-3 text-primary animate-pulse" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </AnimatePresence>
          
          <AnimatePresence mode="wait">
            <motion.div
              key={`text-${activeAgent}-${transitionState}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <h3 className={cn("font-semibold text-sm transition-colors duration-300 font-sans", displayConfig.textColor)}>
                {isInTransition ? 'HopeAI' : config.name}
              </h3>
              <p className="text-xs text-muted-foreground font-sans transition-all duration-300">
                {isInTransition ? transitionConfig?.message : config.description}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {showTyping && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 text-xs text-muted-foreground font-sans"
            >
              <div className="flex gap-1">
                <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", config.typingDotColor)}></div>
                <div
                  className={cn("w-1.5 h-1.5 rounded-full animate-pulse", config.typingDotColor)}
                  style={{ animationDelay: "0.2s" }}
                ></div>
                <div
                  className={cn("w-1.5 h-1.5 rounded-full animate-pulse", config.typingDotColor)}
                  style={{ animationDelay: "0.4s" }}
                ></div>
              </div>
              <span className="animate-pulse">
                {transitionConfig?.message || 'Procesando...'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
