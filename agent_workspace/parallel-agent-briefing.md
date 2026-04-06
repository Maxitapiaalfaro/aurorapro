# Parallel Agent Briefing — Aurora/HopeAI

**Date**: 2026-04-06
**Purpose**: Enable a second agent to work in parallel with the primary agent session.

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

## What the Primary Agent Is Doing (DO NOT TOUCH THESE FILES)

The primary agent is executing **P2: Dead Code Purge**. These files are being actively modified:

### OFF-LIMITS (will cause merge conflicts):
- `lib/dynamic-orchestrator.ts` — Removing ~630 lines (bullets + recommendations)
- `lib/intelligent-intent-router.ts` — Removing ~230 lines (edge-case routing)
- `lib/hopeai-orchestration-bridge.ts` — DELETING entire file (501 lines)
- `lib/user-preferences-manager.ts` — DELETING entire file (316 lines)
- `lib/search-query-middleware.ts` — DELETING (empty file)
- `lib/academic-search-enhancer.ts` — DELETING (empty file)
- `lib/index.ts` — Cascade cleanup of bridge imports
- `lib/orchestrator-monitoring.ts` — Cascade cleanup
- `lib/orchestration-singleton.ts` — Cascade cleanup
- `lib/hopeai-system.ts` — Import cleanup (removing dead orchestration references)

---

## Your Assigned Tasks (safe for parallel work)

Pick from these tasks in order of priority. All are confirmed to have ZERO file overlap with P2.

### Task A: PII Filtering in Logs (Gap Analysis P0.2)

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

**Files you CAN touch**: `lib/logger.ts`, `lib/security/console-blocker.ts`, Sentry config, any `lib/` file for `console.log` replacement EXCEPT the off-limits files listed above.

---

### Task B: Deploy Firestore Security Rules

**Goal**: Deploy the existing `firestore.rules` file to the Firebase project.

**Context**:
- `firestore.rules` exists at project root with uid-scoped rules
- No `firebase.json` or `.firebaserc` exists yet — Firebase CLI hasn't been initialized
- Firebase Auth is already integrated — all client-side calls go through authenticated contexts

**Deliverables**:
1. Run `firebase init` to create `firebase.json` and `.firebaserc` (select only Firestore rules)
2. Deploy rules with `firebase deploy --only firestore:rules`
3. Verify rules work by testing authenticated read/write

**Files you CAN touch**: `firebase.json` (new), `.firebaserc` (new), `firestore.rules` (existing).

---

### Task C: Server-Side Messages Subcollection (Phase 4a)

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
**DO NOT touch**: `lib/hopeai-system.ts` (primary agent is modifying it for P2).

---

### Task D: Clinical Inter-Session Memory System (Gap Analysis P2.1)

**Goal**: Build the foundation for a persistent clinical memory system that remembers observations across patient sessions.

**Context**:
- Firestore already stores session data at `psychologists/{uid}/patients/{pid}/sessions/{sid}/messages/{mid}`
- No semantic memory extraction exists yet
- The system should extract clinical observations at session end and inject relevant ones at session start
- Reference pattern: Claude Code's `memdir/` system (see `docs/architecture/claude/claude-code-main/`)

**Deliverables**:
1. Create `types/memory-types.ts` — memory document types (categories: observations, patterns, therapeutic-preferences)
2. Create `lib/clinical-memory-system.ts` — extraction, storage (Firestore), retrieval functions
3. Define Firestore path: `psychologists/{uid}/patients/{pid}/memories/{memoryId}`
4. DO NOT wire into `hopeai-system.ts` yet — that integration happens after P2

**Files you CAN touch**: `types/memory-types.ts` (new), `lib/clinical-memory-system.ts` (new).

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

- **DO NOT modify any file in the off-limits list** without explicit coordination
- Write progress to `tasks/todo.md` when starting/completing tasks
- If you discover issues that affect P2, document them in `tasks/lessons.md`
- If you need to touch `lib/hopeai-system.ts`, STOP and coordinate — the primary agent owns that file during P2
