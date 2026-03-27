"use client"

import type { PatientRecord, PatientSummaryCache, PatientSessionMeta } from "@/types/clinical-types"

/**
 * PatientSummaryBuilder - Generates compact, token-limited summaries from PatientRecord
 * Follows the executive plan specification for 800-1200 token summaries
 */
export class PatientSummaryBuilder {
  private static readonly MAX_TOKENS = 1200
  private static readonly MIN_TOKENS = 800
  private static readonly CHARS_PER_TOKEN = 4 // Rough estimation
  private static readonly MAX_CHARS = PatientSummaryBuilder.MAX_TOKENS * PatientSummaryBuilder.CHARS_PER_TOKEN

  /**
   * Builds a compact patient context summary for orchestrator consumption
   */
  static buildSummary(patient: PatientRecord): string {
    const sections: string[] = []

    // Core identification
    sections.push(`Patient: ${patient.displayName}`)

    // Demographics (if available)
    if (patient.demographics) {
      const demo = patient.demographics
      const demoDetails = [
        demo.ageRange && `Age: ${demo.ageRange}`,
        demo.gender && `Gender: ${demo.gender}`,
        demo.occupation && `Occupation: ${demo.occupation}`
      ].filter(Boolean).join(", ")
      
      if (demoDetails) {
        sections.push(`Demographics: ${demoDetails}`)
      }
    }

    // Clinical tags/conditions
    if (patient.tags && patient.tags.length > 0) {
      sections.push(`Focus Areas: ${patient.tags.join(", ")}`)
    }

    // Clinical notes (truncated if needed)
    if (patient.notes) {
      const truncatedNotes = this.truncateText(patient.notes, 400)
      sections.push(`Clinical Notes: ${truncatedNotes}`)
    }

    // Attachments summary
    if (patient.attachments && patient.attachments.length > 0) {
      const attachmentSummary = patient.attachments
        .map(att => att.name)
        .slice(0, 5) // Limit to first 5 attachments
        .join(", ")
      sections.push(`Attachments: ${attachmentSummary}${patient.attachments.length > 5 ? ` (+${patient.attachments.length - 5} more)` : ""}`)
    }

    // Join sections and ensure token limits
    const summary = sections.join("\n")
    return this.ensureTokenLimits(summary)
  }

  /**
   * Builds and caches a summary, updating the patient record's summaryCache
   */
  static buildAndCache(patient: PatientRecord): PatientSummaryCache {
    const summaryText = this.buildSummary(patient)
    const tokenCount = this.estimateTokenCount(summaryText)
    
    return {
      text: summaryText,
      version: 1,
      updatedAt: new Date().toISOString(),
      tokenCount
    }
  }

  /**
   * Checks if cached summary is still valid
   */
  static isCacheValid(patient: PatientRecord): boolean {
    if (!patient.summaryCache) return false
    // Check if patient was updated after cache
    const cacheDate = new Date(patient.summaryCache.updatedAt)
    return patient.updatedAt <= cacheDate
  }

  /**
   * Gets summary text, using cache if valid or rebuilding if needed
   */
  static getSummary(patient: PatientRecord): string {
    if (this.isCacheValid(patient) && patient.summaryCache) {
      return patient.summaryCache.text
    }
    
    return this.buildSummary(patient)
  }

  /**
   * Gets the most comprehensive summary available:
   * 1. Most recent completed ficha clínica (if exists)
   * 2. Cached summary (if valid)
   * 3. Freshly built summary
   * 
   * @param patient - The patient record
   * @param latestFicha - Optional latest completed ficha clínica
   * @returns The most comprehensive summary text
   */
  static getSummaryWithFicha(
    patient: PatientRecord,
    latestFicha?: { contenido: string; version: number } | null
  ): string {
    // Prioridad 1: Si existe ficha clínica completada, usarla
    if (latestFicha && latestFicha.contenido && latestFicha.contenido.trim().length > 0) {
      console.log(`📋 Using ficha clínica as patient summary (version ${latestFicha.version})`);
      
      // Agregar encabezado para contexto
      const fichaWithHeader = `[Ficha Clínica Actualizada - Versión ${latestFicha.version}]\n\n${latestFicha.contenido}`;
      
      // Asegurar límites de tokens
      return this.ensureTokenLimits(fichaWithHeader);
    }
    
    // Prioridad 2 y 3: Usar el método estándar (cache o build)
    return this.getSummary(patient);
  }

  /**
   * Generates a hash for change detection
   */
  static generateSummaryHash(patient: PatientRecord): string {
    const hashInput = [
      patient.displayName,
      JSON.stringify(patient.demographics || {}),
      JSON.stringify(patient.tags || []),
      patient.notes || "",
      patient.attachments?.length || 0,
      patient.updatedAt.toISOString()
    ].join("|")
    
    // Simple hash function for change detection
    let hash = 0
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(36)
  }

  /**
   * Ensures summary stays within token limits
   */
  private static ensureTokenLimits(text: string): string {
    if (text.length <= this.MAX_CHARS) {
      return text
    }

    // Truncate to max chars and try to end at a sentence boundary
    let truncated = text.substring(0, this.MAX_CHARS)
    const lastSentence = truncated.lastIndexOf(". ")
    
    if (lastSentence > this.MAX_CHARS * 0.8) {
      truncated = truncated.substring(0, lastSentence + 1)
    }
    
    return truncated + "..."
  }

  /**
   * Truncates text to specified character limit
   */
  private static truncateText(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text
    
    const truncated = text.substring(0, maxChars)
    const lastSpace = truncated.lastIndexOf(" ")
    
    if (lastSpace > maxChars * 0.8) {
      return truncated.substring(0, lastSpace) + "..."
    }
    
    return truncated + "..."
  }

  /**
   * Estimates token count for a given text
   */
  private static estimateTokenCount(text: string): number {
    return Math.ceil(text.length / this.CHARS_PER_TOKEN)
  }
}

/**
 * Utility class for patient context composition and session management
 * Handles first-message composition with Parts structure as specified in executive plan
 */
export class PatientContextComposer {
  /**
   * Composes the first message parts as specified in the executive plan
   * Returns structured parts for patient context and user instruction
   */
  composeFirstMessageParts(
    patientSummary: string,
    userInstruction: string
  ): { systemPart: string; userPart: string } {
    // Part A: Patient Context Summary (system-level context)
    const systemPart = `[Patient Context Summary]\n${patientSummary}`
    
    // Part B: User Instruction (actual user message)
    const userPart = `[User Instruction]\n${userInstruction}`
    
    return {
      systemPart,
      userPart
    }
  }

  /**
   * Creates session metadata for orchestrator injection
   * Provides patient reference for context optimization and intent routing
   */
  createSessionMetadata(
    patient: PatientRecord,
    sessionConfig: {
      sessionId: string
      userId: string
      clinicalMode: string
      activeAgent: string
    },
    patientSummaryText?: string
  ): PatientSessionMeta {
    return {
      sessionId: sessionConfig.sessionId,
      userId: sessionConfig.userId,
      patient: {
        reference: patient.id,
        summaryHash: PatientSummaryBuilder.generateSummaryHash(patient),
        version: patient.summaryCache?.version || 1,
        confidentialityLevel: patient.confidentiality?.accessLevel || 'medium',
        summaryText: patientSummaryText
      },
      clinicalMode: sessionConfig.clinicalMode,
      activeAgent: sessionConfig.activeAgent,
      createdAt: new Date().toISOString()
    }
  }

  /**
   * Static helper for backward compatibility
   */
  static composeFirstMessageParts(patient: PatientRecord, userInstruction: string): string[] {
    const patientSummary = PatientSummaryBuilder.getSummary(patient)
    
    return [
      `[Patient Context Summary]\n${patientSummary}`,
      `[User Instruction]\n${userInstruction}`
    ]
  }

  /**
   * Static helper for backward compatibility
   */
  static createSessionMeta(patient: PatientRecord): {
    id: string
    summaryHash: string
    version: number
  } {
    return {
      id: patient.id,
      summaryHash: PatientSummaryBuilder.generateSummaryHash(patient),
      version: patient.summaryCache?.version || 1
    }
  }
}