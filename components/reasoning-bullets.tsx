"use client"

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Circle, AlertCircle, Loader2 } from 'lucide-react'
import type { ReasoningBullet } from '@/types/clinical-types'

interface ReasoningBulletsProps {
  bullets: ReasoningBullet[]
  isGenerating?: boolean
  className?: string
  showHeader?: boolean
}

export function ReasoningBullets({ bullets, isGenerating = false, className = '', showHeader = true }: ReasoningBulletsProps) {
  // Si no hay bullets y no está generando, no mostrar nada
  if (!bullets || (bullets.length === 0 && !isGenerating)) {
    return null
  }

  const getBulletIcon = (bullet: ReasoningBullet) => {
    // Separadores no tienen icono
    if (bullet.type === 'separator') {
      return null
    }
    switch (bullet.status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-serene-teal-500 dark:text-serene-teal-400 flex-shrink-0" />
      case 'generating':
        return <Loader2 className="w-4 h-4 text-clarity-blue-500 dark:text-clarity-blue-400 animate-spin flex-shrink-0" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0" />
      default:
        return <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    }
  }

  const getBulletTextColor = (bullet: ReasoningBullet) => {
    if (bullet.type === 'separator') {
      return 'text-muted-foreground text-xs font-medium border-t border-border pt-2 mt-2'
    }
    switch (bullet.status) {
      case 'completed':
        return 'text-foreground'
      case 'generating':
        return 'text-clarity-blue-600 dark:text-clarity-blue-400'
      case 'error':
        return 'text-red-600 dark:text-red-400'
      default:
        return 'text-muted-foreground'
    }
  }

  return (
    <div className={className}>
      {showHeader && (
        <div className="flex items-center gap-2 pb-2">
          <span className="text-xs font-semibold text-muted-foreground">Proceso</span>
          {isGenerating && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Pensando
            </span>
          )}
        </div>
      )}
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {bullets.map((bullet) => (
            <motion.li
              key={bullet.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className={bullet.type === 'separator' ? 'pt-1' : ''}
            >
              {bullet.type === 'separator' ? (
                <div className={getBulletTextColor(bullet)}>{bullet.content}</div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">
                    {getBulletIcon(bullet)}
                  </div>
                  <div className={`text-sm leading-relaxed ${getBulletTextColor(bullet)}`}>
                    {bullet.content}
                  </div>
                </div>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  )
}