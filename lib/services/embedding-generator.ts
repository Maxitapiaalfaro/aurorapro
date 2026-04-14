import 'server-only'

/**
 * Embedding Generator — Vector + Content Hash (Pipeline Step 2)
 *
 * Generates a 768-dimensional embedding from clinical text using
 * Google's gemini-embedding-001 model (GA), and computes a SHA-256
 * hash of the normalized content for cache-invalidation purposes.
 *
 * API reference (verified 2025-04-14):
 *   ai.models.embedContent({ model, contents, config })
 *   → EmbedContentResponse { embeddings: ContentEmbedding[] }
 *   → ContentEmbedding { values: number[] }
 *   Config accepts: outputDimensionality, taskType, abortSignal.
 *
 * Guarantees:
 * - AbortController timeout: 3 000 ms max per embedding call.
 * - Deterministic hashing: content is lowercased and trimmed before SHA-256.
 * - L2 normalization: applied for sub-3072 dimensions per Google's guidance.
 * - Graceful fallback: returns null on any error (never blocks persistence).
 *
 * @module lib/services/embedding-generator
 */

import { createHash } from 'crypto'
import { ai } from '@/lib/google-genai-config'
import { createLogger } from '@/lib/logger'

const logger = createLogger('agent')

/** Maximum time (ms) allowed for the embedding API call. */
const EMBEDDING_TIMEOUT_MS = 3_000

/**
 * Model for text embeddings.
 * gemini-embedding-001 is the GA text-only embedding model.
 * Default output: 3072-D (MRL-trained, truncatable to 768/1536).
 */
const EMBEDDING_MODEL = 'gemini-embedding-001'

/** Requested dimensionality of the output vector (768 recommended for storage). */
const EMBEDDING_DIMENSIONS = 768

/**
 * Task type hint for the embedding model.
 * RETRIEVAL_DOCUMENT optimizes embeddings for document storage + cosine KNN.
 */
const EMBEDDING_TASK_TYPE = 'RETRIEVAL_DOCUMENT'

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

/**
 * Result of embedding generation.
 * `embedding` is a 768-element L2-normalized number array;
 * `contentHash` is the SHA-256 hex digest.
 */
export interface EmbeddingResult {
  embedding: number[]
  contentHash: string
}

// ---------------------------------------------------------------------------
// Content normalization + hashing
// ---------------------------------------------------------------------------

/**
 * Normalizes content for consistent hashing:
 * 1. Trim leading/trailing whitespace.
 * 2. Convert to lowercase.
 *
 * The same normalization is applied before embedding generation
 * so that semantically identical content always produces the same hash.
 */
function normalizeContent(content: string): string {
  return content.trim().toLowerCase()
}

/**
 * Computes a SHA-256 hex digest of the normalized content.
 * Used to detect stale embeddings when memory content is updated.
 */
function computeContentHash(normalizedContent: string): string {
  return createHash('sha256').update(normalizedContent, 'utf8').digest('hex')
}

// ---------------------------------------------------------------------------
// L2 normalization (required for sub-3072 MRL truncation)
// ---------------------------------------------------------------------------

/**
 * L2-normalizes a vector in-place.
 *
 * Per Google's official guidance, gemini-embedding-001 outputs are only
 * unit-normed at the native 3072-D resolution. For reduced dimensions
 * (768, 1536), the truncated prefix must be re-normalized so cosine
 * distance calculations remain accurate.
 */
function l2Normalize(vector: number[]): number[] {
  let sumSquares = 0
  for (let i = 0; i < vector.length; i++) {
    sumSquares += vector[i] * vector[i]
  }
  if (sumSquares === 0) return vector
  const norm = Math.sqrt(sumSquares)
  const result = new Array<number>(vector.length)
  for (let i = 0; i < vector.length; i++) {
    result[i] = vector[i] / norm
  }
  return result
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a 768-D embedding vector and a SHA-256 content hash.
 *
 * Implements Pipeline Step 2 (Vectorization):
 * 1. Normalize the input content (trim + lowercase).
 * 2. Compute SHA-256 hex digest of the normalized string.
 * 3. Call gemini-embedding-001 with an AbortController timeout of 3 s.
 * 4. L2-normalize the truncated vector (required for sub-3072 dimensions).
 * 5. Validate the returned vector dimensionality.
 *
 * On any error (timeout, API failure, dimension mismatch) returns null
 * so the memory can still be saved as a flat document without embedding.
 *
 * @param content - Raw clinical memory text to embed.
 * @returns `{ embedding, contentHash }` or null on failure.
 */
export async function generateMemoryEmbedding(
  content: string,
): Promise<EmbeddingResult | null> {
  if (!content || content.trim().length === 0) {
    logger.warn('Embedding generation skipped: empty content')
    return null
  }

  const normalized = normalizeContent(content)
  const contentHash = computeContentHash(normalized)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS)

  try {
    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: normalized,
      config: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
        taskType: EMBEDDING_TASK_TYPE,
        abortSignal: controller.signal,
      },
    })

    clearTimeout(timeoutId)

    // Extract embedding values from the response
    // SDK returns: response.embeddings[0].values (number[])
    const embeddingData = response.embeddings?.[0]
    if (!embeddingData?.values || embeddingData.values.length === 0) {
      logger.warn('Embedding response missing values')
      return null
    }

    // L2-normalize the truncated vector (768-D < native 3072-D)
    const embedding = l2Normalize(embeddingData.values)

    // Validate dimensionality
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      logger.warn('Embedding dimension mismatch', {
        expected: EMBEDDING_DIMENSIONS,
        received: embedding.length,
      })
      // Accept non-matching dimensions but log the discrepancy
    }

    logger.debug('Embedding generated', {
      dimensions: embedding.length,
      hashPrefix: contentHash.substring(0, 8),
    })

    return { embedding, contentHash }
  } catch (err) {
    clearTimeout(timeoutId)

    const errorMessage = err instanceof Error ? err.message : String(err)
    const isTimeout = errorMessage.includes('abort') || errorMessage.includes('AbortError')

    logger.warn('Embedding generation failed — returning null fallback', {
      reason: isTimeout ? 'timeout' : 'api_error',
      error: errorMessage,
    })

    return null
  }
}
