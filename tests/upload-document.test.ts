import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as uploadDocumentPOST } from '@/app/api/upload-document/route'
import { HopeAISystemSingleton } from '@/lib/hopeai-system'

// Helper to create NextRequest with FormData
function createFormDataRequest(url: string, formData: FormData) {
  const req = new Request(url, { method: 'POST', body: formData as any })
  return new NextRequest(req)
}

describe('/api/upload-document', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 400 when required fields are missing', async () => {
    const fd = new FormData()
    // Missing file/sessionId/userId
    const req = createFormDataRequest('http://localhost/api/upload-document', fd)
    const res = await uploadDocumentPOST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBeDefined()
  })

  it('returns 400 for invalid file type or size', async () => {
    const fd = new FormData()
    const badFile = new File([new Uint8Array([1,2,3])], 'malware.exe', { type: 'application/x-msdownload' })
    fd.append('file', badFile)
    fd.append('sessionId', 'sess-1')
    fd.append('userId', 'user-1')

    const req = createFormDataRequest('http://localhost/api/upload-document', fd)
    const res = await uploadDocumentPOST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.details?.allowedTypes).toBeTruthy()
  })

  it('returns 403 when permission is denied during upload', async () => {
    const fd = new FormData()
    const okFile = new File([new Uint8Array([5,6,7])], 'doc.pdf', { type: 'application/pdf' })
    fd.append('file', okFile)
    fd.append('sessionId', 'sess-2')
    fd.append('userId', 'user-2')

    vi.spyOn(HopeAISystemSingleton, 'uploadDocument').mockRejectedValueOnce(Object.assign(new Error('Permission denied while uploading file'), { code: 'PERMISSION_DENIED' }))

    const req = createFormDataRequest('http://localhost/api/upload-document', fd)
    const res = await uploadDocumentPOST(req)
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toMatch(/Permission/i)
  })

  it('returns 200 and payload on successful upload', async () => {
    const fd = new FormData()
    const okFile = new File([new Uint8Array([9,10,11])], 'doc.pdf', { type: 'application/pdf' })
    fd.append('file', okFile)
    fd.append('sessionId', 'sess-3')
    fd.append('userId', 'user-3')

    const uploadedFile = {
      id: 'file-123',
      originalName: 'doc.pdf',
      geminiFileId: 'files/abc123',
      geminiFileUri: 'files/abc123',
      status: 'processed'
    }
    vi.spyOn(HopeAISystemSingleton, 'uploadDocument').mockResolvedValueOnce(uploadedFile as any)

    const req = createFormDataRequest('http://localhost/api/upload-document', fd)
    const res = await uploadDocumentPOST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.uploadedFile?.geminiFileUri).toBe('files/abc123')
  })
})