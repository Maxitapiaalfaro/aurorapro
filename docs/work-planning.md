# Work Planning — Fix Silent Chat Messaging Failure

## Problem Summary

When a user sends a message, the POST to `/api/send-message` returns HTTP 200 (SSE stream opens), but the AI response never arrives. No error events are received. The failure is completely silent.

## Root Cause Summary

The primary cause is that the Vercel serverless function hosting `/api/send-message` lacks a `maxDuration` configuration, causing it to be killed by Vercel's default timeout before the Gemini API stream completes. Secondary issues include un-awaited async functions, unpinned SDK versions, and missing client-side timeout handling.

---

## Work Items

### ✅ COMPLETED

- [x] Explore repository structure and API routes architecture
- [x] Trace complete message lifecycle (client → SSE → server → Gemini → client)
- [x] Compare working vs non-working logs to identify failure point
- [x] Create architectural strategic analysis document
- [x] Create work planning document

### 🔧 TO IMPLEMENT

#### FIX 1: Add `maxDuration` to SSE API Route (CRITICAL)
**File**: `app/api/send-message/route.ts`
**Action**: Export `maxDuration = 60` (or higher) to allow Vercel's serverless function enough time for Gemini API streaming.
```typescript
export const maxDuration = 60; // Allow 60 seconds for AI streaming
```

#### FIX 2: Await `handleStreamingWithTools` (IMPORTANT)
**File**: `lib/clinical-agent-router.ts` (line ~1844)
**Action**: Add `await` to ensure proper Promise resolution and error propagation.
```typescript
// Before:
result = this.handleStreamingWithTools(streamResult, sessionId, interactionId)
// After:
result = await this.handleStreamingWithTools(streamResult, sessionId, interactionId)
```

#### FIX 3: Pin `@google/genai` SDK Version (IMPORTANT)
**File**: `package.json`
**Action**: Replace `"latest"` with the current working version `"^1.10.0"` to prevent breaking changes on deployment.

#### FIX 4: Add Client-Side Stream Timeout (RECOMMENDED)
**File**: `lib/sse-client.ts`
**Action**: Add a configurable timeout that fires if no SSE events are received within a threshold (e.g., 90 seconds), providing user feedback instead of silent hanging.

#### FIX 5: Add `maxDuration` to Sessions Route (SAFETY)
**File**: `app/api/sessions/route.ts`
**Action**: Export `maxDuration = 30` for session creation/retrieval.

---

## Implementation Order

1. FIX 1 — `maxDuration` on `/api/send-message` (most impactful)
2. FIX 2 — `await handleStreamingWithTools`
3. FIX 3 — Pin SDK version
4. FIX 4 — Client-side stream timeout
5. FIX 5 — `maxDuration` on `/api/sessions`

## Verification

- TypeScript compilation (`npx tsc --noEmit`)
- Build check (`npm run build`)
- No existing tests should break
