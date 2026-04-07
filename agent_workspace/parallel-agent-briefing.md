# Parallel Agent Briefing — Aurora/HopeAI

**Date**: 2026-04-06 | **Updated**: 2026-04-07
**Purpose**: Enable a second agent to work in parallel with the primary agent session.

> **⚠ Update 2026-04-07**: P2 (Dead Code Purge), P3 (Decompose clinical-agent-router), P4 (Orchestration Simplification), **R1 (Single-Call Architecture)**, and **Gap P2.1 (Clinical Memory Wiring)** are all **COMPLETED**. Firebase CLI config files created (`firebase.json`, `.firebaserc`) — manual deploy pending. Consult `aurora-architecture.md` for the current codebase state.

---

## Project Overview

Aurora/HopeAI is a Next.js 15 clinical AI assistant for mental health professionals (Chilean market). Stack: React 19, TypeScript, Tailwind CSS, Google Gemini AI, Firebase/Firestore, Sentry.

**Structure**: Flat layout — `app/`, `lib/`, `components/`, `hooks/`, `config/`, `types/` at root (no `src/`).

---

## Current State (What's Been Done)

### P0 — Firebase Auth (DONE)
- `providers/auth-provider.tsx` — `useAuth()` → `{ user, psychologistId, isLoading }`
- `components/auth-gate.tsx` — Login/register UI
- `lib/security/firebase-auth-verify.ts` — Server-side token verification
- All API routes secured with `verifyFirebaseAuth()`

### P1 — Firestore Offline-First Migration (DONE)
- `lib/firestore-client-storage.ts` (545 lines) — Client-side Firestore service
- Messages stored as subcollection: `psychologists/{uid}/patients/{pid}/sessions/{sid}/messages/{mid}`
- 3 files deleted: `clinical-context-storage.ts`, `patient-persistence.ts`, `client-context-persistence.ts`
- `firestore.rules` created but NOT yet deployed to Firebase
- Server-side files kept: `server-storage-adapter.ts`, `hipaa-compliant-storage.ts`, `server-storage-memory.ts`

### Gap Analysis Recommendations (3 of 8 already implemented)
- P0.1 (Tool permissions): `lib/security/tool-permissions.ts` — DONE
- P1.1 (Reactive compaction): `lib/context-window-manager.ts` — DONE
- P1.2 (Concurrency limits): `lib/utils/tool-orchestrator.ts` — DONE
- P1.3 (Zod validation): Partially done in `lib/tool-input-schemas.ts`

---

## What the Primary Agent Did (P2: Dead Code Purge) — ✅ COMPLETED

The primary agent executed **P2: Dead Code Purge**. The following files were **deleted**:

### Deleted Files:
- `lib/dynamic-orchestrator.ts` — Reduced from ~1,091 to 388 lines (dead features purged)
- `lib/intelligent-intent-router.ts` — Reduced from ~1,786 to 200 lines (decomposed into `lib/routing/`)
- `lib/hopeai-orchestration-bridge.ts` — **DELETED** entirely (501 lines)
- `lib/user-preferences-manager.ts` — **DELETED** entirely (316 lines)
- `lib/search-query-middleware.ts` — **DELETED** (empty file)
- `lib/academic-search-enhancer.ts` — **DELETED** (empty file)
- `lib/index.ts` — **DELETED** (549 lines, barrel file)
- `lib/orchestrator-monitoring.ts` — **DELETED** (722 lines)
- `lib/orchestration-singleton.ts` — **DELETED** (169 lines)

---

## Remaining Tasks (safe for parallel work)

Pick from these tasks in order of priority.

### Task A: PII Filtering in Logs (Gap Analysis P0.2) — PENDING

**Goal**: Ensure clinical PII (patient names, diagnoses, RUTs, session content) is never written to console logs or Sentry breadcrumbs.

**Context**:
- `lib/logger.ts` already exists — it sanitizes proprietary keywords and file paths, but NOT clinical PII
- `lib/security/tool-permissions.ts` has `PHI_PATTERNS` regex patterns that can be reused
- `lib/security/console-blocker.ts` exists — blocks console in production
- ~30+ `console.log` calls in `lib/` still write unsanitized clinical content

**Deliverables**:
1. Extend `lib/logger.ts` (or create `lib/safe-logger.ts`) with PHI/PII redaction using patterns from `lib/security/tool-permissions.ts`
2. Configure Sentry to exclude breadcrumbs containing clinical content
3. Progressively replace raw `console.log` calls in `lib/` files with the safe logger

**Files you CAN touch**: `lib/logger.ts`, `lib/security/console-blocker.ts`, Sentry config, any `lib/` file for `console.log` replacement.

---

### Task B: Deploy Firestore Security Rules — PARTIALLY COMPLETE

**Goal**: Deploy the existing `firestore.rules` file to the Firebase project.

**Context**:
- `firestore.rules` exists at project root with uid-scoped rules
- `firebase.json` and `.firebaserc` now exist — Firebase CLI can connect
- Firebase Auth is already integrated — all client-side calls go through authenticated contexts

**Completed**:
1. ✅ Created `firebase.json` — points to `firestore.rules`
2. ✅ Created `.firebaserc` — maps to project `project-f72e4c83-5347-45b1-bb2`

**Remaining (manual)**:
1. Install Firebase CLI: `npm install -g firebase-tools`
2. Login: `firebase login`
3. Deploy: `firebase deploy --only firestore:rules`
4. Verify rules work by testing authenticated read/write

**Files created**: `firebase.json`, `.firebaserc`.

---

### Task C: Server-Side Messages Subcollection (Phase 4a) — PENDING

**Goal**: Update the server-side Firestore adapter to use messages subcollection (matching client-side pattern).

**Context**:
- Client-side `lib/firestore-client-storage.ts` writes messages to `sessions/{sid}/messages/{mid}` subcollection
- Server-side `lib/firestore-storage-adapter.ts` still writes messages INLINE in the session document
- This mismatch means server-written messages won't appear in client-side `subscribeToMessages()` listeners

**Deliverables**:
1. Add `addMessage()` method to `lib/firestore-storage-adapter.ts`
2. Modify `saveChatSession()` to strip `history[]` from session doc and write individual messages to subcollection
3. Modify `loadChatSession()` to read messages from subcollection + fallback to inline history
4. Add pass-through methods to `lib/server-storage-adapter.ts`

**Files you CAN touch**: `lib/firestore-storage-adapter.ts`, `lib/server-storage-adapter.ts`.

---

### Task D: Clinical Inter-Session Memory System (Gap Analysis P2.1) — ✅ FULLY COMPLETED

**Goal**: Build the foundation for a persistent clinical memory system that remembers observations across patient sessions.

**Context**:
- Firestore already stores session data at `psychologists/{uid}/patients/{pid}/sessions/{sid}/messages/{mid}`
- The system extracts clinical observations from model responses and injects relevant ones into agent context

**Completed**:
1. ✅ `types/memory-types.ts` — ClinicalMemory, ClinicalMemoryCategory, ClinicalMemoryQueryOptions
2. ✅ `lib/clinical-memory-system.ts` — CRUD + keyword relevance search (291 lines)
3. ✅ `lib/agents/message-context-builder.ts` — Added `buildClinicalMemoriesSection()` + section 4.5 in `buildEnhancedMessage()`
4. ✅ `lib/hopeai-system.ts` — Memory injection (retrieves 5 relevant memories) + `extractAndSaveMemoriesAsync()` fire-and-forget extraction

**Memory extraction**:
- Runs every 3rd user message for patient sessions
- Regex-based extraction of observations, patterns, therapeutic preferences from model responses
- Categories: `observation` | `pattern` | `therapeutic-preference`
- Firestore path: `psychologists/{uid}/patients/{pid}/memories/{memoryId}`

**Files modified**: `types/memory-types.ts`, `lib/clinical-memory-system.ts`, `lib/agents/message-context-builder.ts`, `lib/hopeai-system.ts`.

---

## Key Files to Understand

| File | Role |
|---|---|
| `lib/firebase-config.ts` | Firebase client SDK init, `db` export |
| `lib/firebase-admin-config.ts` | Server-side Firebase Admin SDK |
| `lib/firestore-client-storage.ts` | Client-side Firestore CRUD (pure functions) |
| `lib/firestore-storage-adapter.ts` | Server-side Firestore adapter (class-based) |
| `providers/auth-provider.tsx` | React auth context, `useAuth()` hook |
| `types/clinical-types.ts` | Core types: ChatState, ChatMessage, PatientRecord, etc. |
| `firestore.rules` | Security rules (created, not deployed) |
| `docs/architecture/gap-analysis-aurora-vs-claude.md` | Gap analysis with status annotations |

## Coordination

- P2 off-limits restrictions are **LIFTED** — all files are now available for editing.
- Write progress to `tasks/todo.md` when starting/completing tasks.
- If you discover issues, document them in `tasks/lessons.md`.
