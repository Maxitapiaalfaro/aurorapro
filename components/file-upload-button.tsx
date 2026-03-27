"use client"

import React, { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, Upload, X, FileText, ImageIcon, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ClinicalFile } from '@/types/clinical-types'

interface FileUploadButtonProps {
  onFilesSelected: (files: ClinicalFile[]) => void
  uploadDocument: (file: File) => Promise<ClinicalFile>
  disabled?: boolean
  pendingFiles?: ClinicalFile[]
  onRemoveFile?: (fileId: string) => void
  buttonClassName?: string
}

export function FileUploadButton({ 
  onFilesSelected, 
  uploadDocument, 
  disabled = false,
  pendingFiles = [],
  onRemoveFile,
  buttonClassName
}: FileUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    setIsUploading(true)
    setUploadError(null)
    
    try {
      const uploadedFiles: ClinicalFile[] = []
      
      for (const file of Array.from(files)) {
        try {
          const uploadedFile = await uploadDocument(file)
          uploadedFiles.push(uploadedFile)
        } catch (error) {
          console.error('Error uploading file:', file.name, error)
          setUploadError(`Error subiendo ${file.name}: ${error instanceof Error ? error.message : 'Error desconocido'}`)
        }
      }
      
      if (uploadedFiles.length > 0) {
        onFilesSelected(uploadedFiles)
      }
    } finally {
      setIsUploading(false)
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleButtonClick = () => {
    fileInputRef.current?.click()
  }

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return ImageIcon
    return FileText
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || isUploading}
        aria-label="Seleccionar archivos para subir"
      />
      
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleButtonClick}
        disabled={disabled || isUploading}
        className={cn(
          "h-8 w-8 p-0",
          pendingFiles.length > 0 && "text-blue-600",
          buttonClassName
        )}
      >
        {isUploading ? (
          <Upload className="h-4 w-4 animate-pulse" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
      </Button>
      
      {/* Pending Files Indicator */}
      {pendingFiles.length > 0 && !disabled && (
        <div className="absolute -top-2 -right-2 bg-blue-600 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
          {pendingFiles.length}
        </div>
      )}
      
      {/* Upload Error */}
      {uploadError && (
        <div className="absolute bottom-full right-0 mb-2 w-64 bg-red-50 border border-red-200 rounded-lg p-2 z-10">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-red-700">{uploadError}</div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setUploadError(null)}
              className="h-4 w-4 p-0 ml-auto"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}