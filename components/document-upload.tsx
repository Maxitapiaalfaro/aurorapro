"use client"

import type React from "react"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Upload, FileText, ImageIcon, X, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface DocumentUploadProps {
  onUpload: (files: FileList | null) => void
  onClose: () => void
}

export function DocumentUpload({ onUpload, onClose }: DocumentUploadProps) {
  const [dragActive, setDragActive] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const files = Array.from(e.dataTransfer.files)
      setSelectedFiles(files)
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files)
      setSelectedFiles(files)
    }
  }

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleUpload = () => {
    if (selectedFiles.length > 0) {
      const fileList = new DataTransfer()
      selectedFiles.forEach((file) => fileList.items.add(file))
      onUpload(fileList.files)
      setSelectedFiles([])
    }
  }

  const getFileIcon = (type: string) => {
    if (type.startsWith("image/")) return ImageIcon
    return FileText
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  return (
    <Card className="p-6 bg-muted border-2 border-dashed border-border paper-noise">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Subir Documentos Clínicos</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
          dragActive ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-gray-400",
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <div className="space-y-2">
          <p className="text-lg font-medium text-foreground">Arrastra archivos aquí o haz clic para seleccionar</p>
          <p className="text-sm text-gray-500">Soporta PDF, Word, imágenes (máx. 10MB por archivo)</p>
        </div>

        <input
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label="Seleccionar archivos clínicos"
        />
      </div>

      {selectedFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          <h4 className="font-medium text-foreground">Archivos seleccionados:</h4>
          {selectedFiles.map((file, index) => {
            const FileIcon = getFileIcon(file.type)
            const isLarge = file.size > 10 * 1024 * 1024 // 10MB

            return (
              <div
                key={index}
                className={cn(
                  "flex items-center gap-3 bg-card p-3 rounded-lg border paper-noise",
                  isLarge && "border-red-200 bg-red-50",
                )}
              >
                <FileIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{file.name}</div>
                  <div className="text-xs text-gray-500">{formatFileSize(file.size)}</div>
                </div>
                {isLarge && <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />}
                <Button variant="ghost" size="sm" onClick={() => removeFile(index)} className="flex-shrink-0">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )
          })}

          <div className="flex gap-2 pt-2">
            <Button onClick={handleUpload} className="flex-1">
              Subir {selectedFiles.length} archivo(s)
            </Button>
            <Button variant="outline" onClick={() => setSelectedFiles([])}>
              Limpiar
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-800">
            <p className="font-medium mb-1">Procesamiento Inteligente:</p>
            <p>
              Los documentos serán analizados automáticamente y el sistema activará el agente especialista más apropiado
              para tu consulta.
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}
