# File Resolution Diagnosis - Deep Dive

**Date**: 2026-04-01
**Status**: Diagnostic logging added, awaiting test results
**Branch**: `claude/fix-file-upload-sharing-issues`

---

## Problem Statement

Files upload successfully but agents respond as if they don't know about the files. Evidence from user-provided logs:

```
📁 [API /send-message] Files attached to this message: [ 'file_1775074247989_wv9qlgc87' ]
```

But then:

```
📝 [HopeAI] Mensaje del usuario agregado al historial: {
  fileReferences: [],  // EMPTY!
  fileCount: 0
}
```

And:

```
📁 [HopeAI] Files in enrichedAgentContext.sessionFiles: { count: 0, files: [] }
```

---

## Investigation Findings

### 1. API Endpoint ✅ CORRECT
**File**: `app/api/send-message/route.ts:140`

```typescript
const result = await orchestrationSystem.sendMessage(
  sessionId,
  message,
  useStreaming,
  suggestedAgent,
  sessionMeta,
  onBulletUpdate,
  onAgentSelected,
  fileReferences     // ← File IDs ARE being passed
)
```

**Status**: ✅ The API correctly passes `fileReferences` parameter to `sendMessage()`

---

### 2. File Upload Flow ✅ SAVES TO STORAGE
**File**: `lib/clinical-file-manager.ts:6-104`

The `clinicalFileManager.uploadFile()` method saves files to storage **FOUR times**:

1. **Line 18-21**: Initial save with `status: "uploading"`
2. **Line 26-29**: Update to `status: "processing"`
3. **Line 52-55**: Update with `geminiFileId` and `geminiFileUri`
4. **Line 67-70**: Final update with `status: "processed"`

**Storage Call**: Uses `getStorageAdapter()` which returns the global singleton `globalThis.__hopeai_storage_adapter__`

**Status**: ✅ Files ARE being saved to storage multiple times

---

### 3. Storage Singleton ✅ SHARED INSTANCE
**File**: `lib/server-storage-adapter.ts:201-228`

```typescript
export async function getStorageAdapter() {
  const isServer = isServerEnvironment()

  if (isServer) {
    // Usar singleton global verdadero para mantener el estado entre llamadas API
    if (!globalThis.__hopeai_storage_adapter__) {
      globalThis.__hopeai_storage_adapter__ = new ServerStorageAdapter()
      await globalThis.__hopeai_storage_adapter__.initialize()
    }
    return globalThis.__hopeai_storage_adapter__
  }
  // ...
}
```

**HopeAISystem**: Also uses `getStorageAdapter()` in line 73, meaning it uses the SAME singleton

**Status**: ✅ Both file manager and HopeAISystem use the same storage instance

---

### 4. File Resolution Chain - DIAGNOSTIC NEEDED
**File**: `lib/hopeai-system.ts:549-593`

The fallback chain attempts to resolve files in this order:

1. **Primary**: `getPendingFilesForSession(sessionId)` - Get files from server storage
2. **Fallback**: `getFilesByIds(clientFileReferences)` - Use client-provided IDs
3. **Final Fallback**: Last message with fileReferences in history

**Potential Issues**:

#### Issue A: Files Not Persisting in MemoryStorage (MOST LIKELY)
- Files saved during upload endpoint
- But storage is ephemeral (RAM-only in serverless)
- Different API invocation = different storage instance
- Files lost between `/upload-document` and `/send-message` calls

#### Issue B: Files Have Wrong Status
- Files saved but status is still "processing" or "uploading"
- `getFilesByIds()` filters for `status === 'processed'` (line 1547)
- `getPendingFilesForSession()` filters for `status === 'processed'` (line 1527)
- If status not updated after Gemini processing, files are skipped

#### Issue C: Session ID Mismatch
- Files saved with one sessionId
- Retrieved with different sessionId
- `getClinicalFiles(sessionId)` in MemoryStorage filters by sessionId (line 163)

---

## Diagnostic Logging Added

### Commit 1: Deep File Resolution Tracing
**File**: `lib/hopeai-system.ts`

Added logging at every step of the resolution chain:

```typescript
// 1. Fallback chain parameters (line 553-558)
console.log(`📁 [HopeAI] File resolution fallback chain:`, {
  sessionFiles: sessionFiles?.length || 0,
  clientFileReferences: clientFileReferences?.length || 0,
  clientFileReferencesIds: clientFileReferences || [],
  historyMessagesWithFiles: currentState?.history?.filter(...).length || 0
})

// 2. Client file resolution attempt (line 568-587)
console.log(`📁 [HopeAI] Attempting to resolve client file references...`, clientFileReferences)
console.log(`📁 [HopeAI] getFilesByIds returned:`, { count, files })

// 3. getFilesByIds per-file logging (line 1535-1555)
console.log(`📁 [HopeAI.getFilesByIds] Called with IDs:`, fileIds)
console.log(`📁 [HopeAI.getFilesByIds] File ${fileId}:`, {
  found: !!file,
  status: file?.status,
  name: file?.name,
  willInclude: !!(file && file.status === 'processed')
})
```

### Commit 2: Storage-Level Lookup Tracing
**File**: `lib/server-storage-memory.ts`

Added logging in `getClinicalFileById()` to show what's actually in storage:

```typescript
console.log(`📁 [MemoryStorage.getClinicalFileById] Lookup for ${fileId}:`, {
  found: !!file,
  status: file?.status,
  name: file?.name,
  totalFilesInStorage: this.clinicalFiles.size,
  allFileIds: Array.from(this.clinicalFiles.keys())
})
```

### Commit 3: All Files in Session Logging
**File**: `lib/hopeai-system.ts:1514-1522`

Added logging in `getPendingFilesForSession()` to show ALL files before filtering:

```typescript
console.log(`📋 [HopeAI.getPendingFilesForSession] All files from storage:`, {
  totalFiles: clinicalFiles.length,
  files: clinicalFiles.map((f: ClinicalFile) => ({
    id: f.id,
    name: f.name,
    status: f.status,
    sessionId: f.sessionId
  }))
})
```

---

## Testing Guide Updated

**File**: `docs/FILE_UPLOAD_TESTING.md`

Added 7 diagnostic questions (Q0-Q7) with specific log checkpoints:

- **Q0**: Is `clientFileReferences` being passed? → Check fallback chain log
- **Q1**: Are files stored in MemoryStorage? → Check storage lookup log
- **Q2**: Does file have correct status? → Check `willInclude` flag
- **Q3**: Are files resolved from clientFileReferences? → Check getFilesByIds count
- **Q4**: Are files in enrichedAgentContext? → Check sessionFiles count
- **Q5**: Are files detected for attachment? → Check hasFileAttachments
- **Q6**: Are files attached to message parts? → Check "First turn detected"
- **Q7**: Does agent acknowledge file? → Check agent response

---

## Expected Test Results

### Scenario A: Files Not Persisting (Most Likely)
```
📁 [MemoryStorage.getClinicalFileById] Lookup for file_1775074247989_wv9qlgc87: {
  found: false,
  totalFilesInStorage: 0,
  allFileIds: []
}
```

**Diagnosis**: Storage is empty - files lost between API calls
**Root Cause**: Serverless cold starts create new storage instance
**Solution**: Must implement Firestore persistence (already planned in STRATEGIC_PRIORITIES.md)

### Scenario B: Files Have Wrong Status
```
📁 [MemoryStorage.getClinicalFileById] Lookup for file_1775074247989_wv9qlgc87: {
  found: true,
  status: 'processing',  // NOT 'processed'
  name: 'document.pdf',
  totalFilesInStorage: 1
}

📁 [HopeAI.getFilesByIds] File file_1775074247989_wv9qlgc87: {
  found: true,
  status: 'processing',
  willInclude: false  // FILTERED OUT
}
```

**Diagnosis**: File exists but not marked as processed
**Root Cause**: `waitForFileToBeActive()` failing or timing out
**Solution**: Fix Gemini file processing verification

### Scenario C: Session ID Mismatch
```
📋 [HopeAI.getPendingFilesForSession] All files from storage: {
  totalFiles: 1,
  files: [{
    id: 'file_1775074247989_wv9qlgc87',
    sessionId: 'session_123',  // Different from requested
    status: 'processed'
  }]
}

📋 [OPTIMIZED] Found 0 truly pending files for session session_456
```

**Diagnosis**: File saved with different sessionId
**Root Cause**: sessionId not passed correctly in upload
**Solution**: Verify sessionId propagation in upload endpoint

---

## Next Steps

### 1. Run Test with New Logging
User should:
1. Start new conversation
2. Upload a file
3. Send message referencing file
4. Capture ALL console logs from browser + server
5. Report findings using Q0-Q7 checklist

### 2. Based on Test Results

**If Scenario A** (files not persisting):
- **Immediate Fix**: Store files in IndexedDB client-side, pass full file objects in API request
- **Long-term**: Implement Firestore persistence (Phase 2, Weeks 3-4 of STRATEGIC_PRIORITIES.md)

**If Scenario B** (wrong status):
- Fix `clinicalFileManager.uploadFile()` to wait properly for Gemini processing
- Increase timeout for `waitForFileToBeActive()` if needed
- Add retry logic for file processing

**If Scenario C** (sessionId mismatch):
- Fix sessionId propagation in upload endpoint
- Verify sessionId consistency across upload → storage → retrieval

---

## Architecture Insights

### MemoryServerStorage Limitations
**File**: `lib/server-storage-memory.ts`

```typescript
export class MemoryServerStorage {
  private clinicalFiles = new Map<string, ClinicalFile>()
  // ...
}
```

**Critical Issue**: In-memory Maps are **ephemeral**
- Each serverless invocation may create new instance
- No persistence between `/upload-document` and `/send-message` calls
- `globalThis.__hopeai_storage_adapter__` singleton helps but not guaranteed in all serverless environments

**Vercel Behavior**:
- Warm invocations: Same instance, storage persists
- Cold starts: New instance, storage LOST
- No guarantee of warm invocations for consecutive API calls

### Why This Wasn't Caught Earlier
1. **Local development**: Always warm, storage persists
2. **Short test sessions**: May hit warm invocations in Vercel
3. **Documentation**: FILE_HANDLING_FLOW.md clearly states MemoryStorage is ephemeral but implications not realized

---

## Recommended Immediate Fix

Since we can't rely on MemoryStorage persistence in serverless, and Firestore migration is planned but not yet started:

### Option 1: Client-Side Storage Only (Fastest)
1. Don't save files to server storage during upload
2. Keep files ONLY in IndexedDB (client)
3. Pass full file objects (or metadata) in `/send-message` request
4. Reconstruct file references server-side from request body

**Pros**: Works immediately, no server persistence needed
**Cons**: Larger request payloads, doesn't support multi-device

### Option 2: Firestore Quick Implementation (Best Long-Term)
1. Accelerate Firestore migration from Phase 2 to NOW
2. Implement basic Firestore file storage (just CRUD, no sync yet)
3. Update `ServerStorageAdapter` to use Firestore in Vercel
4. IndexedDB sync can come later

**Pros**: Proper persistence, supports future features
**Cons**: Takes longer to implement (1-2 days vs 1-2 hours)

---

## Related Documentation

- **Architecture**: `ARCHITECTURE.md` §6 (Storage Layer)
- **Testing Guide**: `FILE_UPLOAD_TESTING.md` (updated with new diagnostics)
- **File Flow**: `FILE_HANDLING_FLOW.md` §3 (Complete Flow)
- **Strategic Priorities**: `STRATEGIC_PRIORITIES.md` (Firestore migration plan)

---

*This document will be updated with test results and final solution.*
