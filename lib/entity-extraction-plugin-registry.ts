import type { FunctionDeclaration } from '@google/genai'
import type { ExtractedEntity } from './entity-extraction-engine'

export interface EntityExtractionPluginContext {
  confidenceThreshold: number
}

export interface EntityExtractionPlugin {
  readonly id: string
  getFunctionDeclarations(): FunctionDeclaration[]
  processFunctionCall(
    call: { name?: string; args?: Record<string, any> },
    context: EntityExtractionPluginContext
  ): Promise<ExtractedEntity[] | null> | ExtractedEntity[] | null
}

class EntityExtractionPluginRegistry {
  private plugins: Map<string, EntityExtractionPlugin> = new Map()

  register(plugin: EntityExtractionPlugin): void {
    this.plugins.set(plugin.id, plugin)
  }

  unregister(pluginId: string): void {
    this.plugins.delete(pluginId)
  }

  clear(): void {
    this.plugins.clear()
  }

  getPlugins(): EntityExtractionPlugin[] {
    return Array.from(this.plugins.values())
  }
}

export const entityExtractionPluginRegistry = new EntityExtractionPluginRegistry()
