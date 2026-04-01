# CLAUDE.md

**AuroraPro Operational Guide for AI Assistants**

*Last Updated: 2026-04-01*
*Verified Against: ARCHITECTURE.md (2026-03-31)*

---

## Project Overview

AuroraPro is a clinical AI assistant application for mental health professionals delivering evidence-based therapeutic support through three specialized agents (Clinical Supervisor, Documentation Specialist, Academic Researcher). The system provides multi-source academic research integration, encrypted patient record management via IndexedDB, voice transcription, and cognitive transparency with real-time visualization of AI reasoning. Built with Next.js 15/React 19, it combines Chilean clinical vocabulary support with HIPAA-compliant storage and serves as a contextually-aware clinical decision support tool.

---

## Architecture Reference

**@import [ARCHITECTURE.md](./ARCHITECTURE.md)**

**This is the sole source of truth for the system's design.** All architectural decisions, technical specifications, data layer structures, and module relationships are documented there. If you encounter contradictions between code and architecture documentation, flag them for architectural review.

---

## Commands

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
# Starts Next.js development server with OpenSSL legacy provider
# Dev server runs on http://localhost:3000
```

### Building
```bash
npm run build
# Standard production build

npm run build:production
# Production build with security verification pre-checks
```

### Production Server
```bash
npm start
# Starts production server with OpenSSL legacy provider
```

### Linting
```bash
npm run lint
# Runs ESLint with Next.js config
```

### Testing
```bash
npm test
# Runs Vitest test suite

npm run test:coverage
# Runs tests with coverage report via @vitest/coverage-v8
```

### Monitoring & Diagnostics
```bash
npm run monitor:orchestration
# Checks orchestration health (requires jq)

npm run metrics:orchestration
# Gets orchestration metrics (requires jq)

npm run reset:metrics
# Resets orchestration metrics

npm run verify:security
# Verifies security configuration
```

### Special Scripts
```bash
npm run setup:sentry-mcp
# Sets up Sentry MCP integration

npm run test:orchestration
# Tests orchestration migration
```

---

## Code Conventions

### Deviations from Framework Defaults

**File Naming:**
- React components: `PascalCase.tsx` (e.g., `ChatInterface.tsx`)
- Services/utilities: `kebab-case.ts` (e.g., `clinical-agent-router.ts`)
- API routes: `kebab-case/route.ts` (Next.js App Router convention)

**TypeScript Paths:**
- Use `@/` alias for imports: `@/lib/hopeai-system`, `@/components/ui/button`
- Never use relative paths crossing multiple directories

**State Management:**
- Prefer React Context over global state libraries (no Redux/Zustand)
- Singleton pattern for core services (HopeAISystem, ToolRegistry, PatientPersistence, ClinicalAgentRouter)
- Component state via `useState`/`useReducer` hooks only

**Error Handling:**
- API routes: Always return structured JSON: `{ error: string, message: string, timestamp: ISO8601 }`
- Client: Toast notifications via Sonner for user-facing errors
- Never expose internal errors in production (use error-sanitizer.ts)

**Storage Access:**
- IndexedDB on client: Use typed operations from `clinical-context-storage.ts`
- Server persistence: Always use `ServerStorageAdapter`, never direct storage access
- File references: Store IDs only, not full objects (prevents RESOURCE_EXHAUSTED)

**Spanish Clinical Terms:**
- Use `chilean-clinical-vocabulary.ts` for domain-specific terms
- Apply auto-corrections via `chilean-clinical-corrections.ts`
- Agent names remain in Spanish: "socratico", "clinico", "academico"

**Security Headers:**
- All security middleware applied via `middleware.ts`
- Admin endpoints must call `verifyAdminRequest()` before processing
- Rate limiting applied automatically per IP

---

## Architecture Decisions

### High-Stakes Patterns

**1. Agent Routing is Intent-Based, Not URL-Based**
- Three specialized agents route via `IntelligentIntentRouter` using GenAI classification
- Agent selection confidence threshold: 0.8 (fallback to "socratico")
- Never hardcode agent selection; always defer to intelligent-intent-router.ts
- Current agents: Supervisor Clínico (socratico), Especialista en Documentación (clinico), Investigador Académico (academico)

**2. Storage Must Be Environment-Aware**
- Local/VM: `HIPAACompliantStorage` (SQLite + AES-256-GCM encryption)
- Vercel/Serverless: `MemoryServerStorage` (ephemeral, no persistence)
- Selection via `ServerStorageAdapter` based on `VERCEL` env var
- Never instantiate storage backends directly; use `ServerStorageAdapter`

**3. File References Are IDs, Not Objects**
- Critical: ChatMessage.fileReferences must contain IDs only (strings)
- Never embed full ClinicalFile objects in messages (causes exponential token growth)
- Retrieve file details on-demand via `clinical-file-manager.ts`
- This prevents RESOURCE_EXHAUSTED errors in long conversations

**4. Academic Sources Require Multi-Tier Validation**
- Tier 1 (highest trust): PubMed, PsycNet, Cochrane, Nature, Science, Lancet, BMJ
- Tier 2: ScienceDirect, Springer, Wiley, Frontiers, PLOS, MDPI
- Tier 3: ResearchGate, Academia.edu, Semantic Scholar, arXiv
- All DOIs validated via Crossref API before presentation
- Use `AcademicMultiSourceSearch` for parallel search across sources

**5. Context Window Management is Token-Critical**
- System prompt: ~8K tokens (agents, tools, clinical vocabulary)
- Max context: 128K tokens (Gemini 2.5 Flash limit)
- Use `ContextWindowManager` for token optimization
- Prioritize recent messages + clinical context over full history

---

## Domain Glossary

**Clinical Modes:**
- `therapeutic_assistance`: Direct patient support conversations
- `clinical_supervision`: Professional supervision and case review
- `research_support`: Academic research and evidence gathering

**Agent Types:**
- `socratico`: Supervisor Clínico (Socratic questioning, risk assessment, clinical supervision)
- `clinico`: Especialista en Documentación (Ficha Clínica generation, clinical records)
- `academico`: Investigador Académico (PubMed/Crossref/Parallel AI research, DOI validation)
- `orquestador`: Legacy orchestrator type (being phased out, do not use)

**Clinical Entities:** (see `lib/entity-extraction-engine.ts:53-116`)
- Symptoms, diagnoses, medications, side effects, risk indicators
- Treatment plans, therapeutic interventions, coping strategies
- Patient demographics, family history, social factors

**Ficha Clínica:** (see `lib/clinical-task-orchestrator.ts`)
- Chilean clinical record format (similar to SOAP note)
- Generated via GenAI using `ClinicalTaskOrchestrator`
- Stored in IndexedDB `fichas_clinicas` object store
- Sections: Identificación, Motivo de Consulta, Antecedentes, Evaluación, Plan

**Pattern Analysis:** (see `lib/clinical-pattern-analyzer.ts`)
- Behavioral/emotional/cognitive patterns detected across sessions
- Stored per patient in IndexedDB `pattern_analyses` store
- Surfaced via PatternMirrorPanel component

**Gemini Files API:** (see `lib/clinical-file-manager.ts`)
- Google-managed temporary file storage for document processing
- Files expire after processing; metadata persists in IndexedDB
- Upload endpoint: `app/api/upload-document/route.ts`

**Security/HIPAA Terms:**
- **HIPAA Compliant**: §164.312(b) audit logging + AES-256-GCM encryption
- **Audit Log**: Server-side activity tracking (see `lib/security/audit-logger.ts`)
- **Encryption Key**: `AURORA_ENCRYPTION_KEY` env var (32-byte base64)

---

## What Not To Do

**Prefer These Current Standards Over Common Practices:**

1. **Prefer ServerStorageAdapter over direct storage instantiation**
   - Wrong: `new HIPAACompliantStorage()`
   - Right: `ServerStorageAdapter.getInstance()`

2. **Prefer file ID references over embedded file objects**
   - Wrong: `message.attachments = [fullFileObject]`
   - Right: `message.fileReferences = [fileId]`

3. **Prefer dynamic agent routing over hardcoded agent selection**
   - Wrong: `if (query.includes("research")) agent = "academico"`
   - Right: `await intelligentIntentRouter.routeIntent(query)`

4. **Prefer Chilean clinical vocabulary over generic terms**
   - Wrong: "patient", "therapy session"
   - Right: "paciente", "sesión clínica" (use `chilean-clinical-vocabulary.ts`)

5. **Prefer structured ExecutionTimeline over console.log debugging**
   - Wrong: `console.log("Running tool X")`
   - Right: Add ExecutionStep to message.executionTimeline

6. **Prefer Radix UI components over custom UI primitives**
   - Wrong: Build custom dropdown from scratch
   - Right: Use `@/components/ui/dropdown-menu` (Radix-based)

7. **Prefer streaming SSE responses over blocking JSON**
   - Wrong: `res.json({ fullResponse })` for AI messages
   - Right: Use SSE streaming via `app/api/send-message/route.ts`

8. **Prefer markdown sanitization over raw HTML rendering**
   - Wrong: `dangerouslySetInnerHTML={{ __html: userInput }}`
   - Right: Use `markdown-sanitize-schema.ts` + rehype-sanitize

---

## Legacy Code & Stale Documentation

### Migration Status
- **Dynamic Orchestration Migration**: 75% complete (see `orchestration-singleton.ts:16`)
- 75% of traffic uses new `DynamicOrchestrator`, 25% uses legacy Aurora system
- Do not extend legacy "Aurora" system; all new features use DynamicOrchestrator

### Potentially Stale Documentation
If you encounter documentation files other than `ARCHITECTURE.md`, treat them as potentially outdated:
- `docs/AI_Workflow_Architecture.md` - May contain pre-refactor information
- `docs/architectural-strategic-analysis.md` - May reflect earlier strategy
- `docs/Ideas.md` - Exploratory notes, not implemented features
- Any `.md` files in `/lib` - Implementation notes, not specifications

When architectural decisions in these files conflict with `ARCHITECTURE.md` or current code, **stop and request clarification on today's architectural standard**.

### Unused Dependencies
The following packages are installed but have no clear usage in production code:
- `@supabase/supabase-js` - May be planned feature or legacy
- `resend` - Email SDK, possibly for Pioneer Circle invitations
- `@modelcontextprotocol/sdk` - Example exists, no production usage found

Do not remove these without confirmation; they may be used in untracked areas or planned features.

### Learning-Phase Code Indicators
You may encounter:
- Build config issues (OpenSSL legacy provider workaround)
- `ignoreBuildErrors: true` and `ignoreDuringBuilds: true` in next.config.mjs
- Multiple markdown parsers (markdown-it, streamdown, incremental-markdown-parser)
- Commented-out TODO/FIXME (see ARCHITECTURE.md §13 for known issues)

These reflect the project's learning phase. When refactoring, prioritize established patterns (DynamicOrchestrator, ServerStorageAdapter, IntelligentIntentRouter) over experimental code.

---

## Production Readiness Checklist

### Required Environment Variables (Production)
```bash
NEXT_PUBLIC_GOOGLE_AI_API_KEY=AIza...  # Must start with "AIza"
ADMIN_API_TOKEN=<hex_string_32_chars_minimum>
NEXT_PUBLIC_FORCE_PRODUCTION_MODE=true
NEXT_PUBLIC_ENABLE_PRODUCTION_LOGS=false
SENTRY_DSN=https://...
AURORA_ENCRYPTION_KEY=<base64_32_bytes>  # For HIPAA storage
```

### Security Pre-Deployment
```bash
npm run verify:security        # Run before every deployment
npm run build:production       # Includes security checks
```

### Known Production Limitations
- **Vercel deployments**: No persistent storage (MemoryServerStorage mode)
- **SQLite not available on Vercel**: Use external DB or accept ephemeral sessions
- **Audit logs**: Not persistent in memory mode (lost on function restart)
- **Source maps**: Hidden from client bundle (harder to debug production issues)

---

## File Organization Patterns

**Components:**
- `/components/ui/*` - Radix UI-based primitives (Button, Dialog, etc.)
- `/components/*Interface*.tsx` - Main UI containers
- `/components/patient-library/*` - Patient management UI

**API Routes:**
- `/app/api/send-message/route.ts` - Main AI message endpoint (SSE streaming)
- `/app/api/patients/[id]/*` - Patient-scoped endpoints (Ficha, patterns)
- `/app/api/orchestration/*` - System monitoring endpoints
- `/app/api/security/audit/route.ts` - Admin-only audit logs

**Core Services:**
- `/lib/hopeai-system.ts` - Main orchestration singleton
- `/lib/clinical-agent-router.ts` - 3-agent routing system
- `/lib/intelligent-intent-router.ts` - GenAI intent classification
- `/lib/tool-registry.ts` - Clinical tool catalog (Function Calling)

**Storage:**
- `/lib/server-storage-adapter.ts` - Environment-aware storage abstraction
- `/lib/hipaa-compliant-storage.ts` - SQLite + encryption (local/VM)
- `/lib/server-storage-memory.ts` - Ephemeral (Vercel/serverless)
- `/lib/clinical-context-storage.ts` - IndexedDB client operations

**Types:**
- `/types/clinical-types.ts` - Core clinical types (ChatMessage, AgentType, ClinicalMode)
- `/types/operational-metadata.ts` - Operational types (risk, temporal, routing)

---

## Testing Strategy

### Current State
- Vitest 4.1.2 configured with jsdom environment
- Test timeout: 30 seconds
- Coverage: @vitest/coverage-v8
- **No test files found in standard locations** (as of 2026-03-31)

### Testing Gaps (See ARCHITECTURE.md §13)
- No E2E tests (Playwright/Cypress)
- No integration tests for API routes
- No component tests for React components
- Limited unit test coverage

### When Writing Tests
1. Place tests in `/tests` directory or colocated with source
2. Use `.test.ts` or `.spec.ts` suffix
3. Mock external APIs (Google GenAI, PubMed, Crossref)
4. Test IndexedDB with fake-indexeddb or similar
5. Run `npm run test:coverage` to verify coverage

---

## Common Workflows

### Adding a New Clinical Tool
1. Define tool schema in `lib/tool-registry.ts` (Function Calling format)
2. Add tool to `ToolRegistry.tools` Map with category, priority, keywords
3. Implement tool execution in agent router or orchestrator
4. Test with `npm run dev` → trigger tool via natural language query

### Creating a New Agent
1. Add AgentType to `types/clinical-types.ts` (e.g., "nuevo_agente")
2. Update `IntelligentIntentRouter` classification prompts
3. Add agent system prompt in `ClinicalAgentRouter.getSystemPrompt()`
4. Update agent indicator UI in `components/agent-indicator.tsx`

### Adding an API Endpoint
1. Create route handler: `app/api/new-endpoint/route.ts`
2. Export `GET`, `POST`, etc. functions (Next.js 15 App Router)
3. Apply error handling: try-catch + structured JSON response
4. If admin-only: Call `verifyAdminRequest()` in `middleware.ts`
5. If rate-limited: Automatic via middleware (20 req/min default)

### Debugging Orchestration Issues
```bash
# Check system health
npm run monitor:orchestration

# View metrics
npm run metrics:orchestration

# Review logs
# Development: Check browser console + terminal
# Production: Check Sentry dashboard (organization: hopeai-rh)
```

---

## Dependency Management

### Core Dependencies (Do Not Remove)
- `@google/genai` - Google Gemini SDK (AI model)
- `better-sqlite3` - HIPAA-compliant storage backend
- `next`, `react`, `react-dom` - Framework core
- `@radix-ui/*` - Accessible UI primitives
- `@sentry/nextjs` - Error tracking & monitoring

### Update Strategy
- **Next.js**: Stay on 15.x (App Router required)
- **React**: 19.x (hooks-based, no class components)
- **TypeScript**: 5.x (strict mode enabled)
- **Gemini SDK**: Update carefully (breaking API changes common)
- **Radix UI**: Update in batches (26+ packages, version sync required)

### Adding New Dependencies
1. Evaluate if feature can use existing dependencies
2. Check bundle size impact (`npm run build` output)
3. Verify license compatibility (most are MIT/Apache)
4. Document usage in relevant service file
5. Consider Vercel serverless bundle limits

---

## Security Guidelines

### Input Validation
- Always validate user input before GenAI API calls
- Use Zod schemas for form validation (already in use with React Hook Form)
- Sanitize markdown before rendering (use `markdown-sanitize-schema.ts`)
- Never trust client-provided file metadata (verify server-side)

### Authentication & Authorization
- Admin endpoints: Require `Authorization: Bearer <ADMIN_API_TOKEN>` header
- No user authentication system currently (single-user or clinic-scoped)
- Rate limiting: 20 requests/minute per IP (configurable in `rate-limiter.ts`)
- Protected endpoints: `/api/security/audit`, `/api/orchestration/reports`

### Encryption & Storage
- Encryption key: `AURORA_ENCRYPTION_KEY` (32-byte base64, AES-256-GCM)
- Client data: IndexedDB (unencrypted, local to user's browser)
- Server data: SQLite (encrypted at-rest) or ephemeral (memory mode)
- Never log encryption keys, API keys, or patient data

### Content Security Policy
- Applied in `middleware.ts` and `next.config.mjs`
- Allows microphone/camera for voice transcription
- Blocks inline scripts in production
- Sentry tunnel route: `/monitoring` (bypass ad-blockers)

---

## Performance Optimization

### Current Optimizations
- Server-side streaming (SSE) for AI responses
- Hot cache for sessions (50 max, 30-min TTL) in HIPAA storage
- PubMed result caching (24-hour TTL)
- Console.log stripping from client bundle (production)
- Dead code elimination via Terser

### Optimization Opportunities (Not Implemented)
- No CDN integration for static assets
- No lazy loading beyond Next.js defaults
- No service worker/offline support
- Large bundle size (multiple Radix UI components)

### Token Budget Management
- System prompt: ~8K tokens
- Context window: 128K tokens (Gemini 2.5 Flash)
- Use `ContextWindowManager` for optimization
- File references as IDs (not objects) to reduce token usage

---

## Troubleshooting

### Common Issues

**"OpenSSL legacy provider" errors:**
- Already handled in `npm run dev` and `npm start` scripts
- If error persists: Set `NODE_OPTIONS=--openssl-legacy-provider` manually

**"RESOURCE_EXHAUSTED" from Gemini API:**
- Check file references in messages (should be IDs, not objects)
- Verify context window usage via `ContextOptimizationManager`
- Reduce conversation history or optimize system prompt

**IndexedDB quota exceeded:**
- Client storage limit: ~50MB typical per origin
- Clean up old sessions via `clinical-context-storage.ts` cleanup methods
- Advise users to export/backup patient data

**Vercel deployment fails with SQLite error:**
- Expected: SQLite not available on Vercel
- Solution: Storage adapter automatically switches to MemoryServerStorage
- Confirm `VERCEL=1` env var is set (automatic on Vercel)

**Sentry not capturing errors:**
- Check `SENTRY_DSN` is set
- Verify error occurs in instrumented code (not early startup)
- Review Sentry sample rates in config files

**Agent routing selects wrong agent:**
- Check intent classification confidence (threshold: 0.8)
- Review `IntelligentIntentRouter` prompts for clarity
- Test with explicit agent keywords ("necesito investigar" → academico)

---

## How and When to Update This File

**Update CLAUDE.md when:**
1. Core architectural decisions change (e.g., new agent added, storage strategy revised)
2. Command scripts are added/modified in `package.json`
3. Critical conventions emerge that AI assistants must follow
4. Production deployment requirements change
5. Security/compliance requirements evolve
6. After merging significant refactoring that affects workflows

**Update Process:**
1. Review `ARCHITECTURE.md` for changes (source of truth)
2. Update relevant sections in `CLAUDE.md` to reflect new patterns
3. Add items to "What Not To Do" if legacy patterns must be avoided
4. Update Domain Glossary if new domain-specific terms are introduced
5. Increment "Last Updated" date at top of file
6. Commit with message: `docs: update CLAUDE.md for [specific change]`

**Do NOT update for:**
- Minor bug fixes that don't change patterns
- Dependency version bumps (unless breaking changes)
- UI/styling changes
- Individual component additions (unless establishing new pattern)

**Maintenance Cadence:**
- Review quarterly for accuracy
- After each major feature release
- Before onboarding new AI assistants or team members

---

## Additional Resources

**Official Documentation:**
- Next.js 15: https://nextjs.org/docs
- React 19: https://react.dev/
- TypeScript 5: https://www.typescriptlang.org/docs/
- Tailwind CSS: https://tailwindcss.com/docs
- Radix UI: https://www.radix-ui.com/

**Internal Documentation:**
- Architecture: `ARCHITECTURE.md` (source of truth)
- Deployment: `docs/deployment/vercel-google-credentials.md`
- Dev Metrics: `docs/DEV_METRICS_GUIDE.md`
- Voice Transcription: `docs/VOICE_TRANSCRIPTION_GEMINI.md`

**External APIs:**
- Google Gemini: https://ai.google.dev/docs
- PubMed E-utilities: https://www.ncbi.nlm.nih.gov/books/NBK25501/
- Crossref API: https://www.crossref.org/documentation/retrieve-metadata/rest-api/
- Sentry: https://docs.sentry.io/platforms/javascript/guides/nextjs/

---

*End of CLAUDE.md*
