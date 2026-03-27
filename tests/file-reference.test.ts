import { describe, it, expect } from 'vitest'
import { createPartFromUri } from '@/lib/clinical-file-manager'

describe('File referencing for conversations', () => {
  it('creates file parts from Gemini file URIs', () => {
    const fileUri = 'files/abc123'
    const mimeType = 'application/pdf'

    const part = createPartFromUri(fileUri, mimeType)
    // Expect the part to be structured for file data
    expect(part).toBeTruthy()
    // The SDK shapes may vary; ensure mimeType is preserved when present
    // Some SDK versions store mimeType under part.fileData.mimeType
    const mt = (part as any)?.fileData?.mimeType || (part as any)?.mimeType
    expect(mt).toBe(mimeType)
  })

  it('supports multiple file parts for a single prompt', () => {
    const files = [
      { uri: 'files/x1', mimeType: 'application/pdf' },
      { uri: 'files/x2', mimeType: 'text/markdown' }
    ]
    const parts = files.map(f => createPartFromUri(f.uri, f.mimeType))
    expect(parts.length).toBe(2)
    const mimes = parts.map(p => (p as any)?.fileData?.mimeType || (p as any)?.mimeType)
    expect(mimes).toEqual(['application/pdf', 'text/markdown'])
  })
})