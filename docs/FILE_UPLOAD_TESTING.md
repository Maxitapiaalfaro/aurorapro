# File Upload Testing Guide

**Purpose**: Diagnose why agents respond as if they don't know about uploaded files

**Last Updated**: 2026-04-01

---

## Quick Test

### Step 1: Upload a File
1. Start a new conversation
2. Click the file upload button (📎)
3. Select a PDF or image file
4. Wait for upload to complete (status should show "Procesado")

### Step 2: Send a Message Referencing the File
Send a message like:
- "¿Qué información contiene el archivo que te adjunté?"
- "Resume el contenido del documento"
- "Analiza el archivo adjunto"

### Step 3: Check Console Logs

Open browser developer console (F12) and look for these log entries:

#### Expected Log Sequence:

```
1. File Upload Complete:
   ✅ [MemoryStorage] Saved clinical file: <file-id>
   📁 [API /send-message] Files attached to this message: [<file-id>]

2. File Resolution in HopeAI System:
   📎 [HopeAI] Resolved files from client fileReferences: <file-name>
   📁 [HopeAI] Files in enrichedAgentContext.sessionFiles: {
     count: 1,
     files: [{
       id: "...",
       name: "document.pdf",
       geminiFileUri: "files/abc123",
       status: "processed"
     }]
   }

3. File Attachment in Clinical Router:
   📁 [ClinicalRouter] Checking for file attachments: {
     hasFileAttachments: true,
     sessionFilesLength: 1,
     files: ["document.pdf"]
   }

   📁 [ClinicalRouter] Processing sessionFiles for attachment: {
     totalFiles: 1,
     fileNames: ["document.pdf"]
   }

   📁 [ClinicalRouter] File attachment decision: {
     hasUnsentFiles: true,
     filesToProcess: 1,
     currentFiles: [{
       id: "...",
       name: "document.pdf",
       geminiFileUri: "files/abc123",
       alreadySent: false
     }]
   }

   🔵 [ClinicalRouter] First turn detected: Attaching FULL files (1) via URI

4. File Processing Event:
   📁 [API /send-message] Emitting file processing start event
   📁 [API /send-message] Emitting file processing completion event
```

---

## Diagnostic Questions

Based on the logs, answer these questions:

### Q1: Are files being resolved?
**Look for**: `📁 [HopeAI] Files in enrichedAgentContext.sessionFiles`

- [ ] **YES** - Log shows `count: N` with N > 0
- [ ] **NO** - Log shows `count: 0` or files array is empty

**If NO**: Files are not being resolved from storage. Check:
- File upload succeeded (check earlier logs)
- `fileReferences` array populated in user message
- Storage adapter returning files correctly

### Q2: Are files being detected for attachment?
**Look for**: `📁 [ClinicalRouter] Checking for file attachments`

- [ ] **YES** - Log shows `hasFileAttachments: true`
- [ ] **NO** - Log shows `hasFileAttachments: false`

**If NO**: Files are not reaching the agent router. Check:
- `enrichedAgentContext.sessionFiles` is populated
- `sessionFiles` is an array
- `sessionFiles.length > 0`

### Q3: Are files being attached to message parts?
**Look for**: `🔵 [ClinicalRouter] First turn detected: Attaching FULL files`

- [ ] **YES** - Log appears with file count
- [ ] **NO** - Log doesn't appear

**If NO**: Files detected but not being attached. Check:
- `hasUnsentFiles` should be true on first message
- Files have valid `geminiFileUri` or `geminiFileId`
- File status is "processed" or "active"

### Q4: Does agent acknowledge the file?
**Agent response should mention**:
- [ ] File content
- [ ] File name
- [ ] Information from the file

**If NO but all logs above show YES**:
- Issue is with Gemini API file interpretation
- Check if `geminiFileUri` format is correct
- Verify file is ACTIVE in Gemini Files API
- Check if textual annotation is being sent

---

## Common Issues & Solutions

### Issue 1: `count: 0` in enrichedAgentContext
**Symptom**: Files uploaded but not in context

**Root Cause**: Files not being resolved from storage

**Solution**:
1. Check file upload endpoint logs
2. Verify `fileReferences` in user message
3. Test `getFilesByIds()` function directly
4. Check storage adapter is initialized

### Issue 2: `hasFileAttachments: false`
**Symptom**: Files in context but not detected

**Root Cause**: `sessionFiles` not passed correctly

**Solution**:
1. Verify `enrichedAgentContext` construction in hopeai-system.ts:1044-1053
2. Check `resolvedSessionFiles` is populated
3. Ensure `sessionFiles` key exists in enrichedContext

### Issue 3: Files detected but not attached
**Symptom**: `hasFileAttachments: true` but no `🔵 First turn detected` log

**Root Cause**: All files marked as "already sent"

**Solution**:
1. Clear `filesFullySentMap` for testing
2. Check file IDs are consistent
3. Verify `hasUnsentFiles` logic in clinical-agent-router.ts:1696

### Issue 4: Agent doesn't acknowledge file
**Symptom**: All logs show success but agent response ignores file

**Root Causes**:
1. **File not ACTIVE in Gemini**: Check `waitForFileToBeActive()` succeeded
2. **Wrong URI format**: Should be `files/{id}`, not full path
3. **Missing textual annotation**: Agent should see `<archivos_adjuntos>` tag
4. **File content empty**: File may have uploaded but no extractable content

**Solutions**:
1. Add logging for `createPartFromUri()` calls
2. Verify file ACTIVE status before attachment
3. Check `messageParts[0].text` contains file annotation
4. Test with different file types (PDF vs image)

---

## Manual Verification Steps

### Verify File Upload
```javascript
// In browser console after upload
localStorage.getItem('clinical_files')
// Should show file metadata
```

### Verify File in Storage
Check Network tab for:
- `POST /api/upload-document` → 200 OK
- Response includes `geminiFileUri`

### Verify File Reference in Message
After sending message, check:
```javascript
// In browser console
// Look at currentSession.history
// Last user message should have fileReferences array
```

---

## Expected Behavior

### Successful Flow:
1. User uploads file → Status: "Procesado"
2. User sends message with file reference
3. SSE event shows "Procesando archivos clínicos"
4. Agent response mentions file content
5. File appears in conversation with icon/name

### Current Behavior (Bug):
1. User uploads file → Status: "Procesado" ✅
2. User sends message with file reference ✅
3. SSE event shows file processing ✅
4. Agent response **ignores file content** ❌
5. File appears in conversation ✅

---

## Next Steps After Testing

### If logs show files NOT reaching enrichedContext:
→ Fix file resolution in `hopeai-system.ts` (getPendingFilesForSession, getFilesByIds)

### If logs show files IN enrichedContext but NOT detected:
→ Fix detection logic in `clinical-agent-router.ts` (hasFileAttachments check)

### If logs show files detected but NOT attached:
→ Fix attachment logic in `clinical-agent-router.ts` (hasUnsentFiles, file parts)

### If logs show files attached but agent DOESN'T acknowledge:
→ Fix Gemini API integration (file URI format, ACTIVE status, textual annotation)

---

## Report Template

When reporting test results, include:

```
**Test Date**: YYYY-MM-DD
**File Type**: PDF/Image/Other
**File Size**: X KB
**Browser**: Chrome/Firefox/Safari

**Logs Collected**:
- [ ] File upload logs
- [ ] enrichedAgentContext logs
- [ ] hasFileAttachments logs
- [ ] File attachment decision logs
- [ ] First turn detected log

**Results**:
1. Files in enrichedContext: YES/NO
2. hasFileAttachments: TRUE/FALSE
3. hasUnsentFiles: TRUE/FALSE
4. First turn detected: YES/NO
5. Agent acknowledged file: YES/NO

**Agent Response**:
[Paste agent response here]

**Full Console Output**:
[Paste relevant console logs here]
```

---

*This guide will be updated based on test results and findings.*
