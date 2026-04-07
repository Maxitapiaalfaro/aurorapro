/**
 * Routing Types — Shared type definitions for the intent routing system
 * 
 * Extracted from intelligent-intent-router.ts during P4 decomposition.
 * These types are used across the routing, orchestration, and system layers.
 */

import type { FunctionDeclaration } from '@google/genai';
import type { ExtractedEntity, EntityExtractionResult } from '../entity-extraction-engine';
import type { ClinicalTool } from '../tool-registry';

/**
 * Internal content representation for conversation history
 */
export interface Content {
  role: string;
  parts: Array<{ text: string }>;
}

/**
 * Context for tool selection decisions
 */
export interface ToolSelectionContext {
  conversationHistory: Content[];
  currentIntent: string;
  extractedEntities: ExtractedEntity[];
  sessionMetadata: {
    previousAgent?: string;
    sessionLength: number;
    recentTopics: string[];
  };
}

/**
 * Result of an orchestration decision (agent + tools)
 */
export interface OrchestrationResult {
  selectedAgent: string;
  contextualTools: FunctionDeclaration[];
  toolMetadata: ClinicalTool[];
  confidence: number;
  reasoning: string;
}

/**
 * Enriched context for agent transitions
 */
export interface EnrichedContext {
  originalQuery: string;
  detectedIntent: string;
  extractedEntities: ExtractedEntity[];
  entityExtractionResult: EntityExtractionResult;
  sessionHistory: Content[];
  previousAgent?: string;
  transitionReason: string;
  confidence: number;
  isExplicitRequest?: boolean;
  isConfirmationRequest?: boolean;

  // PATIENT CONTEXT: Support for patient-scoped conversations
  patient_reference?: string;
  patient_summary?: string;
  sessionFiles?: any[];
  currentMessage?: string;
  conversationHistory?: any[];
  activeAgent?: string;
  clinicalMode?: string;
  sessionMetadata?: any;
}

/**
 * Result of intent classification via LLM function calling
 */
export interface IntentClassificationResult {
  functionName: string;
  parameters: Record<string, unknown>;
  confidence: number;
  requiresClarification: boolean;
}

/**
 * Configuration for the intent router
 */
export interface RouterConfig {
  confidenceThreshold: number;
  fallbackAgent: string;
  enableLogging: boolean;
  maxRetries: number;
}
