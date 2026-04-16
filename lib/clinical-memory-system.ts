import 'server-only'

/**
 * Sistema de Memoria Clínica — Aurora/HopeAI
 *
 * Módulo server-side para persistir y consultar memorias clínicas de pacientes.
 * Las memorias son observaciones, patrones y preferencias terapéuticas extraídas
 * de sesiones, almacenadas en Firestore bajo:
 *
 *   psychologists/{psychologistId}/patients/{patientId}/memories/{memoryId}
 *
 * Todas las operaciones usan firebase-admin (server-side) y requieren
 * psychologistId + patientId para respetar la jerarquía de seguridad.
 *
 * @module lib/clinical-memory-system
 */

import { getAdminFirestore } from '@/lib/firebase-admin-config'
import { createLogger } from '@/lib/logger'
import type {
  ClinicalMemory,
  ClinicalMemoryCategory,
  ClinicalMemoryQueryOptions,
} from '@/types/memory-types'
import { FieldValue } from 'firebase-admin/firestore'

const logger = createLogger('patient')

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/**
 * Devuelve la referencia a la colección de memorias de un paciente.
 */
function memoriesCollection(psychologistId: string, patientId: string) {
  const db = getAdminFirestore()
  return db
    .collection('psychologists')
    .doc(psychologistId)
    .collection('patients')
    .doc(patientId)
    .collection('memories')
}

/**
 * Convierte un snapshot de Firestore a un objeto ClinicalMemory,
 * transformando Timestamps de Firestore a objetos Date de JS.
 */
function snapshotToMemory(
  data: FirebaseFirestore.DocumentData,
): ClinicalMemory {
  return {
    memoryId: data.memoryId,
    patientId: data.patientId,
    psychologistId: data.psychologistId,
    category: data.category as ClinicalMemoryCategory,
    content: data.content,
    sourceSessionIds: data.sourceSessionIds ?? [],
    confidence: data.confidence ?? 0,
    createdAt: data.createdAt?.toDate?.() ?? new Date(data.createdAt),
    updatedAt: data.updatedAt?.toDate?.() ?? new Date(data.updatedAt),
    isActive: data.isActive ?? true,
    tags: data.tags ?? [],
    relevanceScore: data.relevanceScore ?? 0,
  }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Guarda una memoria clínica en Firestore.
 *
 * Si ya existe un documento con el mismo memoryId, se sobrescribe.
 *
 * @param memory - Documento de memoria clínica completo
 */
export async function saveMemory(memory: ClinicalMemory): Promise<void> {
  try {
    const ref = memoriesCollection(memory.psychologistId, memory.patientId).doc(
      memory.memoryId,
    )

    // Convertir Dates a Timestamps de Firestore para consistencia
    await ref.set({
      ...memory,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
    })

    logger.info('Memoria clínica guardada', {
      memoryId: memory.memoryId,
      category: memory.category,
    })
  } catch (err) {
    logger.error('Error al guardar memoria clínica', err, {
      memoryId: memory.memoryId,
      category: memory.category,
    })
    throw err
  }
}

/**
 * Obtiene las memorias clínicas de un paciente con filtros opcionales.
 *
 * @param psychologistId - UID del psicólogo
 * @param patientId      - ID del paciente
 * @param options        - Filtros opcionales (categoría, estado activo, límite)
 * @returns Lista de memorias clínicas que cumplen los filtros
 */
export async function getPatientMemories(
  psychologistId: string,
  patientId: string,
  options?: ClinicalMemoryQueryOptions,
): Promise<ClinicalMemory[]> {
  try {
    const col = memoriesCollection(psychologistId, patientId)

    // Construir la query con filtros opcionales
    let q: FirebaseFirestore.Query = col

    if (options?.category) {
      q = q.where('category', '==', options.category)
    }

    // isActive filtra por defecto a true, salvo que se pase explícitamente
    const activeFilter = options?.isActive ?? true
    q = q.where('isActive', '==', activeFilter)

    q = q.orderBy('updatedAt', 'desc')

    if (options?.limit && options.limit > 0) {
      q = q.limit(options.limit)
    }

    const snap = await q.get()
    const memories = snap.docs.map((doc) => snapshotToMemory(doc.data()))

    logger.debug('Memorias clínicas consultadas', {
      count: memories.length,
      category: options?.category ?? 'all',
    })

    return memories
  } catch (err) {
    logger.error('Error al consultar memorias clínicas', err, {
      patientId,
    })
    throw err
  }
}

/**
 * Actualiza parcialmente una memoria clínica existente.
 *
 * Actualiza automáticamente el campo `updatedAt`.
 *
 * @param psychologistId - UID del psicólogo
 * @param patientId      - ID del paciente
 * @param memoryId       - ID de la memoria a actualizar
 * @param updates        - Campos a modificar
 */
export async function updateMemory(
  psychologistId: string,
  patientId: string,
  memoryId: string,
  updates: Partial<ClinicalMemory>,
): Promise<void> {
  try {
    const ref = memoriesCollection(psychologistId, patientId).doc(memoryId)

    // Prevenir cambios en campos inmutables
    const { memoryId: _id, psychologistId: _psy, patientId: _pat, createdAt: _ca, ...safeUpdates } = updates

    await ref.update({
      ...safeUpdates,
      updatedAt: FieldValue.serverTimestamp(),
    })

    logger.info('Memoria clínica actualizada', { memoryId })
  } catch (err) {
    logger.error('Error al actualizar memoria clínica', err, { memoryId })
    throw err
  }
}

/**
 * Desactiva (soft-delete) una memoria clínica.
 *
 * Marca `isActive = false` y actualiza `updatedAt`.
 *
 * @param psychologistId - UID del psicólogo
 * @param patientId      - ID del paciente
 * @param memoryId       - ID de la memoria a desactivar
 */
export async function deactivateMemory(
  psychologistId: string,
  patientId: string,
  memoryId: string,
): Promise<void> {
  try {
    const ref = memoriesCollection(psychologistId, patientId).doc(memoryId)

    await ref.update({
      isActive: false,
      updatedAt: FieldValue.serverTimestamp(),
    })

    logger.info('Memoria clínica desactivada', { memoryId })
  } catch (err) {
    logger.error('Error al desactivar memoria clínica', err, { memoryId })
    throw err
  }
}

/**
 * Obtiene las memorias más relevantes para un contexto dado.
 *
 * Implementación actual: coincidencia simple por palabras clave entre el
 * contexto proporcionado y el contenido + tags de cada memoria.
 * Diseñado para ser reemplazado por búsqueda semántica (embeddings) en el futuro.
 *
 * @param psychologistId - UID del psicólogo
 * @param patientId      - ID del paciente
 * @param context        - Texto de contexto actual (ej. mensaje del usuario)
 * @param limit          - Máximo de memorias a devolver (default: 10)
 * @returns Memorias ordenadas por relevancia descendente
 */
export async function getRelevantMemories(
  psychologistId: string,
  patientId: string,
  context: string,
  limit: number = 10,
): Promise<ClinicalMemory[]> {
  try {
    // Obtener todas las memorias activas del paciente
    const allMemories = await getPatientMemories(psychologistId, patientId, {
      isActive: true,
    })

    if (allMemories.length === 0) {
      return []
    }

    // Tokenizar el contexto en palabras clave (normalizar a minúsculas, sin acentos)
    const contextTokens = tokenize(context)

    if (contextTokens.length === 0) {
      // Sin palabras clave útiles: devolver por relevanceScore existente
      return allMemories
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, limit)
    }

    // Puntuar cada memoria según coincidencia de palabras clave
    const scored = allMemories.map((memory) => {
      const memoryTokens = tokenize(
        `${memory.content} ${memory.tags.join(' ')}`,
      )
      const matchCount = contextTokens.filter((token) =>
        memoryTokens.includes(token),
      ).length

      // Combinar: 60% coincidencia keyword, 20% relevanceScore guardado, 20% confidence
      const keywordScore =
        contextTokens.length > 0 ? matchCount / contextTokens.length : 0
      const combinedScore =
        keywordScore * 0.6 +
        memory.relevanceScore * 0.2 +
        memory.confidence * 0.2

      return { memory, score: combinedScore }
    })

    // Ordenar por puntaje combinado descendente y devolver las top N
    const results = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.memory)

    logger.debug('Memorias relevantes recuperadas', {
      totalEvaluated: allMemories.length,
      returned: results.length,
      contextTokenCount: contextTokens.length,
    })

    return results
  } catch (err) {
    logger.error('Error al buscar memorias relevantes', err, {
      patientId,
    })
    throw err
  }
}

/**
 * Obtiene las memorias más relevantes usando selección semántica vía LLM.
 *
 * Inspirado en Claude Code's `findRelevantMemories.ts`: usa un modelo LLM
 * rápido (Gemini Flash) para seleccionar las memorias más pertinentes al
 * contexto actual, en vez de depender solo de coincidencia por keywords.
 *
 * Fallback automático a `getRelevantMemories()` (keyword-based) si la
 * llamada LLM falla por cualquier razón.
 *
 * @param psychologistId - UID del psicólogo
 * @param patientId      - ID del paciente
 * @param context        - Texto de contexto actual (ej. mensaje del usuario)
 * @param limit          - Máximo de memorias a devolver (default: 5)
 * @returns Memorias seleccionadas por relevancia semántica
 */
export async function getRelevantMemoriesSemantic(
  psychologistId: string,
  patientId: string,
  context: string,
  limit: number = 5,
): Promise<ClinicalMemory[]> {
  try {
    // Fetch all active memories (same as keyword-based approach)
    const allMemories = await getPatientMemories(psychologistId, patientId, {
      isActive: true,
    })

    if (allMemories.length === 0) return []

    // If fewer memories than limit, no need for LLM selection
    if (allMemories.length <= limit) return allMemories

    // Build a numbered list of memories for the LLM to select from
    const memoryList = allMemories
      .map((m, i) => `[${i}] [${m.category}] ${m.content}${m.tags.length > 0 ? ` (tags: ${m.tags.join(', ')})` : ''}`)
      .join('\n')

    const selectionPrompt = [
      `Contexto de la conversación actual:\n${context}\n`,
      `Memorias clínicas disponibles del paciente:\n${memoryList}\n`,
      `Selecciona las ${limit} memorias MÁS RELEVANTES para este contexto.`,
      `Responde SOLO con los números de las memorias seleccionadas, separados por comas.`,
      `Ejemplo: 0,3,7,2,5`,
      `Si ninguna es relevante, responde: NONE`,
    ].join('\n')

    // Dynamic import to avoid circular dependency with google-genai-config
    const { ai } = await import('@/lib/google-genai-config')

    const result = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: [{ role: 'user', parts: [{ text: selectionPrompt }] }],
      config: {
        systemInstruction: 'Eres un asistente de selección de memorias clínicas. Tu tarea es identificar las memorias más relevantes al contexto dado. Responde SOLO con números separados por comas.',
        temperature: 1.0,
        maxOutputTokens: 100,
      },
    })

    const responseText = result.text?.trim() || ''

    if (responseText === 'NONE' || !responseText) {
      logger.debug('Selección semántica: ninguna memoria relevante')
      return []
    }

    // Parse selected indices
    const selectedIndices = responseText
      .split(/[,\s]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 0 && n < allMemories.length)

    // Deduplicate indices while preserving LLM's priority order
    const uniqueIndices = [...new Set(selectedIndices)].slice(0, limit)

    const selected = uniqueIndices.map((i) => allMemories[i])

    logger.debug('Selección semántica completada', {
      totalEvaluated: allMemories.length,
      returned: selected.length,
      indices: uniqueIndices,
    })

    return selected
  } catch (err) {
    // Fallback to keyword-based on ANY error (network, parse, LLM rate limit, etc.)
    logger.warn('Selección semántica falló, fallback a keywords', {
      error: err instanceof Error ? err.message : String(err),
      patientId,
    })
    return getRelevantMemories(psychologistId, patientId, context, limit)
  }
}

// ---------------------------------------------------------------------------
// Utilidades de tokenización
// ---------------------------------------------------------------------------

/** Palabras vacías en español que no aportan significado para la búsqueda */
const STOP_WORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'de', 'del', 'al', 'en', 'con', 'por', 'para', 'sin',
  'que', 'es', 'se', 'su', 'sus', 'como', 'pero', 'mas',
  'ya', 'no', 'si', 'ha', 'han', 'fue', 'ser', 'muy',
  'y', 'o', 'a', 'e', 'u', 'lo', 'le', 'les', 'me', 'te',
  'nos', 'esto', 'esta', 'ese', 'esa', 'esos', 'esas',
  'este', 'estos', 'estas', 'aquel', 'aquella',
  'tiene', 'puede', 'hace', 'sobre', 'entre', 'desde',
  'hasta', 'cada', 'todo', 'toda', 'todos', 'todas',
  'otro', 'otra', 'otros', 'otras', 'mismo', 'misma',
])

/**
 * Tokeniza un texto: normaliza a minúsculas, elimina acentos y
 * filtra palabras vacías y tokens menores a 3 caracteres.
 */
function tokenize(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // eliminar diacríticos
    .replace(/[^a-z0-9\s]/g, ' ')   // solo alfanuméricos y espacios

  return normalized
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
}
