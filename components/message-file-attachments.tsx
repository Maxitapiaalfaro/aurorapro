"use client"

import React from 'react'
import { FileText, Image, File, Eye, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ClinicalFile } from '@/types/clinical-types'

interface MessageFileAttachmentsProps {
  files: ClinicalFile[]
  variant?: 'compact' | 'detailed'
  isUserMessage?: boolean
}

export function MessageFileAttachments({ files, variant = 'compact', isUserMessage = false }: MessageFileAttachmentsProps) {
  if (!files || files.length === 0 || !isUserMessage) {
    return null
  }

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase()
    switch (extension) {
      case 'pdf':
        return <FileText className="w-3 h-3 text-red-400" />
      case 'doc':
      case 'docx':
        return <FileText className="w-3 h-3 text-blue-400" />
      case 'txt':
        return <FileText className="w-3 h-3 text-gray-400" />
      case 'jpg':
       case 'jpeg':
       case 'png':
       case 'gif':
         return <Image className="w-3 h-3 text-green-400" />
      default:
         return <File className="w-3 h-3 text-gray-400" />
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const getStatusIndicator = (status: string) => {
    switch (status) {
      case 'processed':
      case 'active':
        return <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
      case 'processing':
        return <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
      case 'uploading':
        return <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse" />
      case 'error':
      case 'timeout':
        return <div className="w-1.5 h-1.5 bg-red-400 rounded-full" />
      default:
        return <div className="w-1.5 h-1.5 bg-gray-300 rounded-full" />
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'processed':
      case 'active':
        return 'Procesado'
      case 'processing':
        return 'Procesando'
      case 'uploading':
        return 'Subiendo'
      case 'error':
        return 'Error'
      case 'timeout':
        return 'Timeout'
      default:
        return 'Desconocido'
    }
  }

  if (variant === 'compact') {
    return (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {files.map((file) => (
          <div
            key={file.id}
            className="inline-flex items-center gap-1.5 px-2 py-1 bg-secondary/70 text-foreground rounded-md border border-border text-xs font-medium hover:bg-secondary/50 transition-colors paper-noise"
          >
            {getFileIcon(file.name)}
            <span className="truncate max-w-[120px]">
              {file.name}
            </span>
            <span className="text-clarity-blue-600 dark:text-clarity-blue-400 text-[10px]">
              {formatFileSize(file.size)}
            </span>
            {getStatusIndicator(file.status)}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-muted-foreground">
        Archivos adjuntos ({files.length})
      </div>
      <div className="space-y-2">
        {files.map((file) => (
          <div
            key={file.id}
            className="flex items-center justify-between p-3 bg-muted rounded-lg border border-border paper-noise hover:bg-secondary/50"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {getFileIcon(file.name)}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground truncate">
                  {file.name}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <span>{formatFileSize(file.size)}</span>
                  <span>•</span>
                  <span>{new Date(file.uploadDate).toLocaleDateString()}</span>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    {getStatusIndicator(file.status)}
                    <span>{getStatusText(file.status)}</span>
                  </div>
                </div>
              </div>
            </div>
            {file.status === 'processed' && (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    // TODO: Implementar vista previa
                    console.log('Ver archivo:', file.id)
                  }}
                >
                  <Eye className="w-3 h-3 mr-1" />
                  Ver
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    // TODO: Implementar descarga
                    console.log('Descargar archivo:', file.id)
                  }}
                >
                  <Download className="w-3 h-3 mr-1" />
                  Descargar
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}