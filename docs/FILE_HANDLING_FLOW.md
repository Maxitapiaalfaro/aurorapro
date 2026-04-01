# File Handling Flow Documentation

**Last Updated**: 2026-04-01
**Status**: Production-Ready
**Migration Target**: Firestore + IndexedDB Native Sync

---

## Overview

This document describes the complete file upload, processing, sharing, and display flow in AuroraPro. Files are uploaded to Gemini Files API, referenced by ID throughout the conversation, and displayed with transparency UX showing processing status.

---

## Architecture Principles

### 1. File References are IDs, Not Objects

**Critical Design Pattern**:
- Messages store **file IDs only** in `fileReferences: string[]`
- Never embed full `ClinicalFile` objects in messages
- Retrieve file details on-demand via `getFilesByIds()`
- This prevents RESOURCE_EXHAUSTED errors in long conversations

**Type Definition** (`types/clinical-types.ts:11-13`):
```typescript
export interface ChatMessage {
  // ...
  fileReferences?: string[]  // IDs only, not full objects
  // ...
}
```

### 2. Gemini Files API Integration

**Upload Target**: Google-managed temporary file storage
**Expiration**: Files expire after processing; metadata persists in storage
**URI Format**: `files/{fileId}` (e.g., `files/abc123xyz`)

**ClinicalFile Type** (`types/clinical-types.ts:146-161`):
```typescript
export interface ClinicalFile {
  id: string                    // Local ID for storage
  name: string
  type: string                  // MIME type
  size: number
  uploadDate: Date
  status: "uploading" | "processing" | "processed" | "error"
  geminiFileId?: string         // Gemini API file ID
  geminiFileUri?: string        // URI for createPartFromUri
  sessionId?: string
  processingStatus?: "processing" | "active" | "error" | "timeout"
  summary?: string              // Lightweight index
  outline?: string
  keywords?: string[]
}
```

---

## Complete Flow

### Phase 1: File Upload (Client → Server)

**Endpoint**: `/app/api/upload-document/route.ts`

1. **Client uploads file**:
   ```typescript
   const file = new File(["content"], "document.pdf", { type: "application/pdf" })
   const uploadedFile = await uploadDocument(file)
   ```

2. **Server processes upload**:
   - Creates `ClinicalFile` metadata object
   - Uploads to Gemini Files API via `clinicalFileManager.uploadToGemini()`
   - Waits for file to be `ACTIVE` (up to 30s timeout)
   - Saves to storage via `ServerStorageAdapter`
   - Returns `ClinicalFile` with `geminiFileUri`

3. **File stored in**:
   - **Server**: `MemoryServerStorage` (current) or `HIPAACompliantStorage` (local)
   - **Client**: IndexedDB `clinical_files` object store
   - **Future**: Firestore with IndexedDB sync

### Phase 2: File Reference in Message

**Location**: `lib/hopeai-system.ts:979-990`

When user sends message with files:
```typescript
const userMessage: ChatMessage = {
  id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  content: message,
  role: "user",
  timestamp: new Date(),
  fileReferences: resolvedSessionFiles?.map(file => file.id) || []  // IDs only!
}
```

### Phase 3: File Attachment to Gemini Context

**Location**: `lib/clinical-agent-router.ts:1500-1593`

When building Gemini chat history:

1. **Identify attachment carrier message** (most recent with `fileReferences`)
2. **Resolve file IDs to objects**:
   - Check session cache first
   - Fetch missing files via `getFilesByIds()`
   - Cache resolved files
3. **Verify file is ACTIVE**:
   ```typescript
   await clinicalFileManager.waitForFileToBeActive(fileIdForCheck, 30000)
   ```
4. **Create file parts**:
   ```typescript
   const filePart = createPartFromUri(fileUri, fileRef.type)
   parts.push(filePart)
   ```
5. **Add textual annotation**:
   ```xml
   <archivos_adjuntos>
   El terapeuta adjuntó los siguientes documentos...
   - document.pdf (application/pdf)
   </archivos_adjuntos>
   ```

### Phase 4: UX Transparency (SSE Events)

**Location**: `app/api/send-message/route.ts:85-160`

**Events emitted**:

1. **File Processing Start** (immediate):
   ```json
   {
     "type": "tool_execution",
     "tool": {
       "id": "uuid",
       "toolName": "process_clinical_files",
       "displayName": "Procesando archivos clínicos",
       "status": "started",
       "progressMessage": "Preparando 2 archivo(s) para análisis...",
       "timestamp": "2026-04-01T..."
     }
   }
   ```

2. **File Processing Complete** (after message sent):
   ```json
   {
     "type": "tool_execution",
     "tool": {
       "toolName": "process_clinical_files",
       "status": "completed",
       "result": {
         "sourcesFound": 2,
         "sourcesValidated": 2
       }
     }
   }
   ```

### Phase 5: File Display in UI

**Location**: `components/chat-interface.tsx:255-276, 1029-1037`

1. **Load files for messages**:
   ```typescript
   useEffect(() => {
     const loadMessageFiles = async () => {
       for (const message of currentSession?.history || []) {
         if (message.fileReferences && message.fileReferences.length > 0) {
           const files = await getFilesByIds(message.fileReferences)
           newMessageFiles[message.id] = files
         }
       }
       setMessageFiles(newMessageFiles)
     }
     loadMessageFiles()
   }, [currentSession?.history])
   ```

2. **Render file attachments**:
   ```tsx
   {messageFiles[message.id] && messageFiles[message.id].length > 0 && (
     <MessageFileAttachments
       files={messageFiles[message.id]}
       variant="compact"
       isUserMessage={message.role === 'user'}
     />
   )}
   ```

**Component**: `components/message-file-attachments.tsx`

Features:
- Compact vs detailed view
- File type icons (PDF, DOCX, images)
- Status indicators (uploading, processing, processed, error)
- Formatted file sizes
- Processing status badges with animation

---

## Storage Architecture

### Current (Beta)

**Client Storage**: IndexedDB
- Object store: `clinical_files`
- Keys: file IDs
- Stores full `ClinicalFile` objects

**Server Storage**: Environment-aware via `ServerStorageAdapter`
- **Vercel/Serverless**: `MemoryServerStorage` (ephemeral, RAM-only)
- **Local/VM**: `HIPAACompliantStorage` (SQLite + AES-256-GCM encryption)

**Selection Logic** (`lib/server-storage-adapter.ts:30-50`):
```typescript
const isVercel = !!process.env.VERCEL || typeof process.env.VERCEL_ENV !== 'undefined'
const forceMemory = process.env.HOPEAI_STORAGE_MODE === 'memory'

if (isVercel || forceMemory) {
  this.storage = new MemoryServerStorage()
} else {
  this.storage = new HIPAACompliantStorage()
}
```

### Future (Firestore Migration)

**Target Architecture**:
- **Client**: IndexedDB (primary, local-first)
- **Server**: Firebase Firestore (persistent, cloud-synced)
- **Sync**: Bidirectional between IndexedDB ↔ Firestore
- **Region**: Global (optimized for Gemini latency/cost)
- **Compliance**: HIPAA BAA required

**Firestore Schema** (proposed):
```
/clinical_files/{fileId}
  - id: string
  - name: string
  - type: string
  - size: number
  - uploadDate: timestamp
  - status: string
  - geminiFileId: string
  - geminiFileUri: string
  - sessionId: string
  - processingStatus: string
  - summary: string (optional)
  - outline: string (optional)
  - keywords: array (optional)
```

**Migration Steps**:
1. Add Firestore client to project
2. Implement `FirestoreServerStorage` class
3. Add sync logic to `ServerStorageAdapter`
4. Test bidirectional sync IndexedDB ↔ Firestore
5. Migrate existing data
6. Update `VERCEL` env detection to use Firestore

---

## Key Functions

### File Upload

**Function**: `HopeAISystem.uploadDocument()`
**Location**: `lib/hopeai-system.ts:1425-1500`

1. Validates file type/size
2. Creates `ClinicalFile` metadata
3. Uploads to Gemini via `clinicalFileManager.uploadToGemini()`
4. Waits for `ACTIVE` status (30s timeout)
5. Saves to storage
6. Associates with session
7. Returns `ClinicalFile`

### File Retrieval

**Function**: `getFilesByIds()`
**Location**: `lib/hopeai-system.ts:1505-1530, 1887-1890`

1. Iterates over file IDs
2. Fetches from storage via `storage.getClinicalFileById()`
3. Returns array of `ClinicalFile` objects
4. Handles missing files gracefully

### File Part Creation

**Function**: `createPartFromUri()`
**Location**: `lib/clinical-file-manager.ts:222-228`

```typescript
export function createPartFromUri(uri: string, mimeType: string) {
  return {
    fileData: {
      mimeType,
      fileUri: uri
    }
  }
}
```

### File Verification

**Function**: `clinicalFileManager.waitForFileToBeActive()`
**Location**: `lib/clinical-file-manager.ts`

- Polls Gemini Files API for file status
- Waits up to 30 seconds
- Throws error if timeout or not found
- Caches verification per session to avoid re-checking

---

## Common Issues & Solutions

### Issue 1: Files Not Showing in Conversation

**Symptoms**:
- User uploads files successfully
- Files don't appear in message bubbles
- No visual feedback of file processing

**Root Causes**:
1. `fileReferences` not persisted in message
2. `getFilesByIds()` returning empty array
3. `MessageFileAttachments` not rendering
4. Files uploaded but not associated with session

**Solutions**:
✅ Ensure `fileReferences` is set in `ChatMessage` (hopeai-system.ts:985)
✅ Verify files saved to storage (upload-document/route.ts)
✅ Check `messageFiles` state populated (chat-interface.tsx:255-276)
✅ Confirm `MessageFileAttachments` renders for all messages (message-file-attachments.tsx:15-20)

### Issue 2: Files Not Shared with Agents

**Symptoms**:
- Files upload successfully
- Agent doesn't reference file content in response
- No indication agent received files

**Root Causes**:
1. File parts not attached to Gemini context
2. `geminiFileUri` missing or incorrect
3. File not ACTIVE when sent to Gemini
4. File verification failing silently

**Solutions**:
✅ Verify file attachment in `sendMessage()` (clinical-agent-router.ts:1500-1593)
✅ Check `geminiFileUri` format (must be `files/{id}`)
✅ Ensure `waitForFileToBeActive()` succeeds
✅ Add SSE events for file processing transparency (send-message/route.ts:85-160)
✅ Include textual annotation in user message parts

### Issue 3: RESOURCE_EXHAUSTED Errors

**Symptoms**:
- Long conversations fail with `RESOURCE_EXHAUSTED`
- Token count grows exponentially
- Performance degrades over time

**Root Causes**:
1. Full `ClinicalFile` objects embedded in messages
2. Files duplicated across conversation history
3. Token budget exceeded

**Solutions**:
✅ Store only file IDs in `fileReferences` (types/clinical-types.ts:13)
✅ Retrieve files on-demand (hopeai-system.ts:1505-1530)
✅ Attach files only to most recent message (clinical-agent-router.ts:1504)
✅ Use `ContextWindowManager` for token optimization

---

## Testing Checklist

### Manual Testing

- [ ] Upload PDF file successfully
- [ ] File shows in message bubble with status indicator
- [ ] File processing event visible in ExecutionTimeline
- [ ] Agent references file content in response
- [ ] File persists after page reload
- [ ] Multiple files can be uploaded to same message
- [ ] Files display in conversation history
- [ ] File status updates (uploading → processing → processed)
- [ ] Error handling for unsupported file types
- [ ] Error handling for file upload failures

### Automated Testing

- [ ] Unit tests for `uploadDocument()`
- [ ] Unit tests for `getFilesByIds()`
- [ ] Integration tests for file upload → storage → retrieval
- [ ] Integration tests for file attachment to Gemini context
- [ ] E2E tests for complete file flow

---

## Future Enhancements

### Phase 1: Firestore Migration
- Replace `MemoryServerStorage` with `FirestoreServerStorage`
- Implement bidirectional sync IndexedDB ↔ Firestore
- Add conflict resolution for offline/online sync
- Test HIPAA compliance with Firebase BAA

### Phase 2: Advanced File Processing
- Extract text/OCR from images
- Build searchable file index
- Generate file summaries automatically
- Support file annotations/highlights

### Phase 3: File Collaboration
- Share files across conversations
- Version control for file updates
- File collections/libraries
- File tagging and categorization

---

## Related Documentation

- **Architecture**: `ARCHITECTURE.md` (source of truth)
- **Strategic Priorities**: `STRATEGIC_PRIORITIES.md` (beta blockers)
- **Type Definitions**: `types/clinical-types.ts:146-161`
- **File Manager**: `lib/clinical-file-manager.ts`
- **Storage Adapter**: `lib/server-storage-adapter.ts`
- **Upload Endpoint**: `app/api/upload-document/route.ts`

---

*This document will be updated as the file handling system evolves. Always check git history for latest changes.*
