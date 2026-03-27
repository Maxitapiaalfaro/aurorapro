"use client"

import { Card } from "@/components/ui/card"
import { Brain, BookOpen, Stethoscope, User, FileText, ImageIcon, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AgentType } from "@/types/clinical-types"
import { getAgentVisualConfigSafe } from "@/config/agent-visual-config"

interface Message {
  id: string
  content: string
  sender: "user" | "ai"
  agent?: AgentType
  timestamp: Date
  attachments?: Array<{
    name: string
    type: string
    size: number
  }>
}

interface MessageBubbleProps {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.sender === "user"
  const config = message.agent ? getAgentVisualConfigSafe(message.agent) : getAgentVisualConfigSafe()
  const IconComponent = config.icon

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const getFileIcon = (type: string) => {
    if (type.startsWith("image/")) return ImageIcon
    return FileText
  }

  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 border",
            config.bgColor,
            config.borderColor,
          )}
        >
          <IconComponent className={cn("h-4 w-4", config.textColor)} />
        </div>
      )}

      <div className={cn("max-w-[70%] space-y-1", isUser && "items-end")}>
        {!isUser && <div className={cn("text-xs font-medium px-1", config.textColor)}>{config.name}</div>}

        <Card
          className={cn(
            "p-4 shadow-sm transition-colors ring-1 ring-transparent",
            isUser
              ? "text-[hsl(var(--user-bubble-text))] bg-[hsl(var(--user-bubble-bg))] border-0 shadow-[0_3px_12px_rgba(0,0,0,0.12)]"
              : config.bgColor,
            !isUser && `border ${config.borderColor} hover:bg-secondary/40`,
          )}
        >
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</div>

          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-3 space-y-2">
              {message.attachments.map((attachment, index) => {
                const FileIcon = getFileIcon(attachment.type)
                return (
                  <div
                    key={index}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded border",
                      isUser ? "bg-clarity-blue-500 dark:bg-clarity-blue-600 border-clarity-blue-400 dark:border-clarity-blue-500" : "bg-secondary border-border",
                    )}
                  >
                    <FileIcon className="h-4 w-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{attachment.name}</div>
                      <div className="text-xs opacity-75">{formatFileSize(attachment.size)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <div className={cn("text-xs text-muted-foreground px-1", isUser && "text-right")}>
          {message.timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full bg-[hsl(var(--user-bubble-bg))] flex items-center justify-center flex-shrink-0 mt-1 shadow-[0_3px_12px_rgba(0,0,0,0.12)]">
          <User className="h-4 w-4 text-[hsl(var(--user-bubble-text))]" />
        </div>
      )}
    </div>
  )
}
