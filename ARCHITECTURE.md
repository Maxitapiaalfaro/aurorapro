# ARCHITECTURE.md

**AuroraPro - Clinical AI Assistant Architecture**

*Documentation generated: 2026-03-31*
*Last verified commit: 3b90218*
*Strategic update: 2026-04-01*

This document describes the **actual current state** of the AuroraPro codebase as it exists today. All information is based on direct code inspection.

**Note**: For beta launch strategy, priorities, and critical bug tracking, see [STRATEGIC_PRIORITIES.md](./STRATEGIC_PRIORITIES.md).

---

## 1. Project Overview

### What This Project Does

AuroraPro (internally named "my-v0-project" in package.json) is a **clinical AI assistant application** designed for mental health professionals and therapeutic contexts. The system provides:

- **Multi-Agent Clinical Intelligence**: Three specialized AI agents (Supervisor Clínico, Especialista en Documentación, Investigador Académico) that dynamically route conversations based on intent and context
- **Patient Management**: IndexedDB-based patient library with clinical records (Fichas Clínicas) and pattern analysis
- **Academic Research Integration**: Multi-source academic search across PubMed, Crossref, and Parallel AI with DOI validation
- **Voice Transcription**: Gemini-powered audio transcription for hands-free clinical documentation
- **Document Processing**: Upload and analyze clinical documents via Google Gemini Files API
- **Cognitive Transparency**: Real-time visualization of AI reasoning, tool execution, and agent selection
- **HIPAA-Compliant Storage**: Encrypted at-rest clinical data storage with audit logging

### Core Problem It Solves

AuroraPro addresses the need for **evidence-based, contextually-aware clinical support** by:
1. Routing conversations to specialized agents based on clinical intent
2. Grounding responses in academic research from trusted sources
3. Maintaining persistent, encrypted patient records with pattern detection
4. Providing transparency into AI decision-making for clinical supervision
5. Supporting Chilean clinical vocabulary and terminology corrections

### Beta Launch Context (2026-04-01)

**Target Market**: Independent psychologists in Chile, Argentina, and Brasil
**User Model**: Single-user scoped experience (no multi-user collaboration)
**Storage Strategy**: IndexedDB (client) + Firebase Firestore (server) with bidirectional sync
**HIPAA Compliance**: Firestore + Google Cloud Platform with Business Associate Agreement

**Pricing Model (Freemium)**:
1. **Free Tier**: 50,000 tokens/day, no MCP access, basic features
2. **Pro Tier ($20/month)**: 3M tokens/month, MCP access, Gemini Pro 3.X (branded as "Aurora Pro")
3. **Ultra Tier ($50/month)**: 15M tokens/month (virtually unlimited), advanced models (branded as "Aurora Ultra")

**Beta Targets**:
- Maximum 50 users (10 paying, 40 freemium)
- Target 10 paying users for GA graduation
- 95% uptime, <1% error rate required for GA

**Firestore Budget**:
- Spark Plan (free): 50K reads/day, 20K writes/day, 20K deletes/day, 1 GiB storage
- Blaze Plan (overage): $0.06/100K reads, $0.18/100K writes, $0.02/100K deletes
- Free tier consumed first, then pay-as-you-go billing

**Data Region**: Global (optimized for Gemini latency/cost, no Brasil in-country requirement)

For detailed beta priorities, roadmap, and critical bug tracking, see [STRATEGIC_PRIORITIES.md](./STRATEGIC_PRIORITIES.md).

---

## 2. Tech Stack

### Frameworks and Versions

- **Framework**: Next.js 15.5.14 (App Router with TypeScript)
- **React**: 19 (with React 19 DOM)
- **Build Tool**: Next.js built-in compiler (Turbopack/Webpack)
- **Package Manager**: npm (package-lock.json present)

### Language and Compilation

- **Language**: TypeScript 5.x
- **Target**: ES2022
- **Module System**: ESNext with bundler resolution
- **JSX**: React JSX with 'preserve' mode

### CSS and Styling

- **Framework**: Tailwind CSS 3.4.17
- **Configuration**: PostCSS 8.5+
- **Animation Plugin**: tailwindcss-animate 1.0.7
- **Utility Library**: clsx 2.1.1, tailwind-merge 2.5.5
- **Component Variants**: class-variance-authority 0.7.1
- **Custom Aurora Palette**: Serene Teal (memory/docs), Clarity Blue (analysis), Academic Plum (research)

### Testing Framework

- **Test Runner**: Vitest 4.1.2
- **Coverage**: @vitest/coverage-v8 4.1.2
- **Environment**: jsdom 27.1.0 for DOM testing

### UI Component Libraries

- **Base Components**: Radix UI (headless, accessible components)
  - 26+ Radix UI packages for dialogs, dropdowns, accordions, tooltips, etc.
- **Icons**:
  - Lucide React 0.454.0
  - Phosphor Icons 2.1.10
- **Command Palette**: cmdk 1.0.4
- **Charts**: Recharts 2.15.0
- **Animations**: Framer Motion 12.23.12
- **Carousel**: Embla Carousel React 8.5.1
- **Virtualization**: React Virtuoso 4.13.0
- **Panels**: React Resizable Panels 2.1.7
- **Drawer**: Vaul 1.1.2
- **Toasts**: Sonner 1.7.1

### Form Handling

- **Forms**: React Hook Form 7.54.1
- **Validation**: Zod 3.24.1 with @hookform/resolvers 3.9.1

### Major Dependencies

- **AI/ML**:
  - @google/genai 1.47.0 (Google Gemini SDK)
  - google-auth-library 10.3.0
  - gtoken 7.0.0
- **Database**: better-sqlite3 12.4.1 (for HIPAA-compliant local storage)
- **Backend Services**: @supabase/supabase-js 2.76.1
- **Monitoring**: @sentry/nextjs 9.42.0
- **Email**: Resend 4.7.0
- **MCP Protocol**: @modelcontextprotocol/sdk (latest)
- **Speech**: react-speech-recognition 4.0.1
- **Markdown**:
  - markdown-it 14.1.1
  - remark-gfm 4.0.1
  - rehype-sanitize 6.0.0
  - streamdown 1.4.0
  - unified 11.0.5
- **Utilities**:
  - date-fns 3.6.0
  - parallel-web 0.1.2

---

## 3. Project Structure

```
/home/runner/work/aurorapro/aurorapro/
│
├── app/                          # Next.js 15 App Router (main application)
│   ├── layout.tsx               # Root layout with providers, fonts, security imports
│   ├── page.tsx                 # Home page rendering MainInterfaceOptimized
│   ├── global-error.tsx         # Global error boundary
│   ├── globals.css              # Global CSS with Tailwind directives
│   ├── sentry-example-page/     # Sentry demonstration page
│   └── api/                     # API route handlers (20 endpoints)
│       ├── send-message/        # Main SSE streaming endpoint for AI messages
│       ├── agents/              # List available agents
│       ├── sessions/            # Session CRUD operations
│       ├── documents/           # Document retrieval
│       ├── upload-document/     # Gemini Files API upload
│       ├── transcribe-audio/    # Gemini audio transcription
│       ├── academic-search/     # Parallel AI academic search
│       ├── patients/[id]/       # Patient-specific endpoints
│       │   ├── ficha/          # Generate/retrieve Fichas Clínicas
│       │   └── pattern-analysis/ # Pattern analysis for patients
│       ├── orchestration/       # Orchestration monitoring endpoints
│       │   ├── health/         # Health checks
│       │   ├── metrics/        # Performance metrics
│       │   ├── alerts/         # System alerts
│       │   └── reports/        # System reports
│       ├── security/audit/      # Audit log access (admin-protected)
│       ├── system-status/       # Overall system status
│       ├── switch-agent/        # Agent switching
│       ├── pioneer-circle/      # Pioneer circle invitation system
│       ├── health/              # System health
│       └── sentry-example-api/  # Sentry testing endpoint
│
├── components/                   # React components
│   ├── main-interface-optimized.tsx  # Main container orchestrating UI
│   ├── chat-interface.tsx       # Message input/output and streaming
│   ├── sidebar.tsx              # Left sidebar navigation
│   ├── header.tsx               # Top header bar
│   ├── mobile-nav.tsx           # Mobile navigation
│   ├── conversation-history-list.tsx  # Session history list
│   ├── patient-conversation-history.tsx  # Patient-specific sessions
│   ├── reasoning-bullets.tsx    # Progressive reasoning display
│   ├── execution-timeline.tsx   # Tool execution visualization
│   ├── pattern-mirror-panel.tsx # Pattern analysis display
│   ├── agent-indicator.tsx      # Current agent badge
│   ├── message-bubble.tsx       # Individual message rendering
│   ├── message-file-attachments.tsx  # File attachment display
│   ├── markdown-renderer.tsx    # Markdown parsing and rendering
│   ├── document-upload.tsx      # Document upload component
│   ├── file-upload-button.tsx   # Upload button UI
│   ├── gemini-voice-button.tsx  # Voice input activation
│   ├── voice-input-button.tsx   # Voice button control
│   ├── voice-transcription-overlay.tsx  # Transcription UI
│   ├── voice-settings.tsx       # Voice configuration
│   ├── voice-status-indicator.tsx  # Voice status display
│   ├── theme-provider.tsx       # Dark/light theme provider
│   ├── display-settings-popover.tsx  # UI preferences
│   ├── debug-toggle.tsx         # Debug mode toggle
│   ├── dev-metrics-indicator.tsx  # Development metrics
│   ├── debug-pioneer-invitation.tsx  # Pioneer debug UI
│   ├── pioneer-circle-invitation.tsx  # Pioneer invitation
│   ├── domain-evidence-dialog.tsx  # Academic source dialog
│   ├── patient-library/         # Patient library components
│   │   └── FichaClinicaPanel.tsx  # Clinical record panel
│   └── ui/                      # Shadcn-style UI primitives (Radix-based)
│       ├── accordion.tsx
│       ├── alert-dialog.tsx
│       ├── avatar.tsx
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── checkbox.tsx
│       ├── dialog.tsx
│       ├── dropdown-menu.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── popover.tsx
│       ├── scroll-area.tsx
│       ├── select.tsx
│       ├── separator.tsx
│       ├── slider.tsx
│       ├── switch.tsx
│       ├── tabs.tsx
│       ├── textarea.tsx
│       ├── toast.tsx
│       ├── toaster.tsx
│       ├── tooltip.tsx
│       └── use-toast.ts
│
├── lib/                         # Core business logic and utilities
│   ├── hopeai-system.ts         # Main orchestration system (HopeAISystem singleton)
│   ├── hopeai-orchestration-bridge.ts  # Legacy integration bridge
│   ├── orchestration-singleton.ts  # Global orchestration instance
│   ├── dynamic-orchestrator.ts  # AI-based agent/tool selection
│   ├── intelligent-intent-router.ts  # Intent classification using GenAI
│   ├── clinical-agent-router.ts  # 3-agent routing system
│   ├── clinical-task-orchestrator.ts  # Ficha Clínica generation
│   ├── clinical-file-manager.ts  # File upload and Gemini Files API
│   ├── clinical-pattern-analyzer.ts  # Pattern detection for patients
│   ├── clinical-context-storage.ts  # IndexedDB storage layer
│   ├── patient-persistence.ts   # Patient record persistence
│   ├── patient-summary-builder.ts  # Context synthesis
│   ├── pattern-analysis-storage.ts  # Pattern analysis persistence
│   ├── academic-multi-source-search.ts  # Multi-source search orchestration
│   ├── academic-search-enhancer.ts  # Query optimization
│   ├── academic-source-validator.ts  # Source validation
│   ├── academic-reference-validator.ts  # Reference validation
│   ├── pubmed-research-tool.ts  # PubMed API integration
│   ├── parallel-ai-search.ts    # Parallel AI with domain filtering
│   ├── crossref-doi-resolver.ts  # DOI resolution
│   ├── chilean-clinical-vocabulary.ts  # Spanish clinical terms
│   ├── chilean-clinical-corrections.ts  # Auto-corrections
│   ├── tool-registry.ts         # Clinical tool catalog (Function Calling)
│   ├── entity-extraction-engine.ts  # NER and entity extraction
│   ├── entity-extraction-plugin-registry.ts  # Pluggable extractors
│   ├── context-window-manager.ts  # Token optimization
│   ├── context-optimization-manager.ts  # Token counting
│   ├── google-genai-config.ts   # GenAI/Vertex AI initialization
│   ├── hipaa-compliant-storage.ts  # SQLite encrypted storage
│   ├── server-storage-adapter.ts  # Storage abstraction layer
│   ├── server-storage-memory.ts  # In-memory storage for Vercel
│   ├── client-context-persistence.ts  # Client persistence helper
│   ├── ui-preferences-storage.ts  # UI preferences
│   ├── user-preferences-manager.ts  # User preference management
│   ├── encryption-utils.ts      # AES-256-GCM encryption
│   ├── session-metrics-comprehensive-tracker.ts  # Session metrics
│   ├── sentry-metrics-tracker.ts  # Sentry event tracking
│   ├── enhanced-sentry-metrics-tracker.ts  # Advanced metrics
│   ├── enhanced-metrics-types.ts  # Metrics type definitions
│   ├── orchestrator-monitoring.ts  # Orchestration monitoring
│   ├── markdown-parser.ts       # Standard markdown parser
│   ├── markdown-parser-streamdown.ts  # Streaming parser
│   ├── incremental-markdown-parser.ts  # Incremental parsing
│   ├── markdown-sanitize-schema.ts  # XSS sanitization schema
│   ├── rehype-aurora-classes.ts  # Custom Rehype plugin for Aurora styling
│   ├── response-watermark.ts    # Response tracking
│   ├── vertex-link-converter.ts  # Vertex AI link conversion
│   ├── search-query-middleware.ts  # Query preprocessing
│   ├── sse-client.ts            # Server-sent events client
│   ├── server-prewarm.ts        # Server pre-warming
│   ├── logger.ts                # Centralized logging
│   ├── env-validator.ts         # Environment validation
│   ├── singleton-monitor.ts     # Singleton instance monitoring
│   ├── dynamic-status.ts        # Dynamic status management
│   ├── utils.ts                 # General utilities
│   ├── index.ts                 # Barrel export
│   └── security/                # Security modules
│       ├── admin-auth.ts        # Admin authentication
│       ├── audit-logger.ts      # Audit logging
│       ├── rate-limiter.ts      # Rate limiting per IP
│       ├── console-blocker.ts   # Production console blocking
│       └── error-sanitizer.ts   # Error message sanitization
│
├── pages/api/                   # Legacy Pages Router API
│   └── check-file-status.ts    # Check Gemini file processing status
│
├── providers/                   # React Context providers
│   └── display-preferences-provider.tsx  # Display preferences state
│
├── types/                       # TypeScript type definitions
│   ├── clinical-types.ts        # Core clinical types (messages, agents, files, etc.)
│   └── operational-metadata.ts  # Operational types (risk, temporal, routing)
│
├── hooks/                       # Custom React hooks
│   └── [various hooks]
│
├── config/                      # Configuration files
│   └── optimization-config.ts   # Performance optimization config
│
├── styles/                      # Global styles
│   └── globals.css              # Tailwind directives and custom CSS
│
├── public/                      # Static assets
│   └── [images, icons, etc.]
│
├── docs/                        # Documentation
│   ├── DEV_METRICS_GUIDE.md
│   ├── VOICE_TRANSCRIPTION_GEMINI.md
│   ├── AI_Workflow_Architecture.md
│   ├── architectural-strategic-analysis.md
│   ├── deployment/
│   │   └── vercel-google-credentials.md
│   └── [other docs]
│
├── scripts/                     # Utility scripts
│   ├── verify-production-security.js
│   ├── verify-security.js
│   └── setup-sentry-mcp.js
│
├── tests/                       # Test files
│   └── [test files]
│
├── examples/                    # Example code
│   └── sentry-mcp-usage-example.md
│
├── .cursor/                     # Cursor IDE configuration
├── .trae/                       # Trae configuration
├── .vscode/                     # VS Code settings
│
├── middleware.ts                # Next.js middleware (security, rate limiting)
├── instrumentation.ts           # Next.js instrumentation hook
├── instrumentation-client.ts    # Client instrumentation
├── next.config.mjs              # Next.js configuration with Sentry
├── tailwind.config.ts           # Tailwind configuration
├── tsconfig.json                # TypeScript configuration
├── postcss.config.mjs           # PostCSS configuration
├── components.json              # Shadcn components config
├── vitest.config.mts            # Vitest test configuration
├── sentry.server.config.ts      # Server-side Sentry config
├── sentry.edge.config.ts        # Edge runtime Sentry config
├── sentry.properties            # Sentry project properties
├── package.json                 # Dependencies and scripts
├── package-lock.json            # Lockfile
└── .eslintrc.json               # ESLint configuration
```

### Entry Points

1. **Application Entry**: `/app/layout.tsx` → `/app/page.tsx` → `MainInterfaceOptimized` component
2. **API Entry**: `/app/api/send-message/route.ts` (main AI message endpoint with SSE streaming)
3. **Client Instrumentation**: `/instrumentation-client.ts` (runs on client startup)
4. **Server Instrumentation**: `/instrumentation.ts` (runs on server startup)
5. **Middleware**: `/middleware.ts` (runs on every request for security)

---

## 4. Data Layer

### Client-Side Storage (IndexedDB)

#### Database 1: `hopeai_clinical_db` (version 5)

**Implementation**: `/lib/clinical-context-storage.ts`

**Object Stores**:

1. **`chat_sessions`**
   - **KeyPath**: `sessionId` (string)
   - **Indexes**:
     - `userId` (string)
     - `lastUpdated` (number, timestamp)
     - `mode` (string: "therapeutic_assistance" | "clinical_supervision" | "research_support")
   - **Fields**:
     - `sessionId`: string
     - `userId`: string
     - `mode`: ClinicalMode
     - `conversationHistory`: ChatMessage[]
     - `metadata`: object
     - `riskState`: SessionRiskState
     - `clinicalContext`: object
     - `currentAgent`: AgentType
     - `lastUpdated`: number
     - `createdAt`: number
   - **Read/Write**: CRUD operations in `clinical-context-storage.ts`

2. **`clinical_files`**
   - **KeyPath**: `id` (string)
   - **Indexes**:
     - `sessionId` (string)
     - `status` (string: "uploading" | "processing" | "active" | "deleted" | "error")
   - **Fields**:
     - `id`: string
     - `sessionId`: string
     - `fileName`: string
     - `mimeType`: string
     - `uploadedAt`: number
     - `status`: string
     - `geminiFileUri`: string | null
     - `sizeBytes`: number
     - `metadata`: object
   - **Read/Write**: File management in `clinical-file-manager.ts`, storage in `clinical-context-storage.ts`

3. **`user_preferences`**
   - **KeyPath**: `userId` (string)
   - **Indexes**: None
   - **Fields**:
     - `userId`: string
     - `displayMode`: string
     - `theme`: string
     - `voiceSettings`: object
     - `uiPreferences`: object
     - `lastUpdated`: number
   - **Read/Write**: Managed by `user-preferences-manager.ts` and `ui-preferences-storage.ts`

4. **`fichas_clinicas`**
   - **KeyPath**: `fichaId` (string)
   - **Indexes**:
     - `pacienteId` (string)
     - `estado` (string: "draft" | "active" | "archived")
     - `ultimaActualizacion` (number, timestamp)
   - **Fields**:
     - `fichaId`: string
     - `pacienteId`: string
     - `estado`: string
     - `contenido`: string (markdown)
     - `seccionesCompletadas`: string[]
     - `metadata`: object
     - `createdAt`: number
     - `ultimaActualizacion`: number
   - **Read/Write**: Generated by `clinical-task-orchestrator.ts`, stored via `clinical-context-storage.ts`

5. **`pattern_analyses`**
   - **KeyPath**: `analysisId` (string)
   - **Indexes**:
     - `patientId` (string)
     - `status` (string: "active" | "archived")
     - `createdAt` (number)
     - `viewedAt` (number)
   - **Fields**:
     - `analysisId`: string
     - `patientId`: string
     - `status`: string
     - `patterns`: object[]
     - `insights`: string[]
     - `recommendations`: string[]
     - `createdAt`: number
     - `viewedAt`: number | null
     - `metadata`: object
   - **Read/Write**: Analyzed by `clinical-pattern-analyzer.ts`, stored in `pattern-analysis-storage.ts`

#### Database 2: `HopeAI_PatientLibrary` (version 1)

**Implementation**: `/lib/patient-persistence.ts` (PatientPersistence singleton)

**Object Stores**:

1. **`patients`**
   - **KeyPath**: `id` (string, UUID v4)
   - **Indexes**:
     - `displayName` (string)
     - `tags` (string[], multi-entry)
     - `createdAt` (number)
     - `updatedAt` (number)
   - **Fields**:
     - `id`: string (UUID)
     - `displayName`: string
     - `tags`: string[]
     - `lastSessionId`: string | null
     - `sessionCount`: number
     - `metadata`: object
     - `createdAt`: number
     - `updatedAt`: number
   - **Read/Write**: Full CRUD via PatientPersistence singleton

2. **`patients_index`**
   - **KeyPath**: `key` (string)
   - **Indexes**: None
   - **Fields**:
     - `key`: "metadata"
     - `totalPatients`: number
     - `lastUpdated`: number
   - **Read/Write**: Metadata tracking in PatientPersistence

### Server-Side Storage

#### Storage Adapter Layer

**Implementation**: `/lib/server-storage-adapter.ts`

The server uses a **dynamic storage adapter** that automatically selects between:

1. **HIPAACompliantStorage** (local/VM environments)
2. **MemoryServerStorage** (Vercel/serverless environments)

**Selection Logic**: Checks `VERCEL` environment variable or `HOPEAI_STORAGE_MODE` config.

#### Option 1: HIPAA-Compliant Storage (SQLite)

**Implementation**: `/lib/hipaa-compliant-storage.ts`

- **Technology**: better-sqlite3 12.4.1
- **Database File**: `./data/aurora-hipaa.db`
- **Encryption**: AES-256-GCM at-rest encryption (via `/lib/encryption-utils.ts`)
- **Encryption Key**: `AURORA_ENCRYPTION_KEY` environment variable (base64-encoded 32-byte key)

**Configuration**:
- Max hot cache sessions: 50
- Cache TTL: 30 minutes (1800000ms)
- Session timeout: 90 days
- Cleanup interval: 5 minutes
- SQLite mode: WAL (Write-Ahead Logging)

**Tables** (inferred from code, not explicit DDL):
- Session storage (encrypted JSON blobs)
- Audit logs (HIPAA §164.312(b) compliant)
- Chat history (encrypted)
- Clinical data (encrypted)

**Read/Write Patterns**:
- Write: Encrypt data → Store in SQLite → Update hot cache
- Read: Check hot cache → If miss, query SQLite → Decrypt → Store in cache
- Cleanup: Periodic background job removes expired sessions and old audit logs

**Access Locations**:
- Initialized in `server-storage-adapter.ts`
- Used by `hopeai-system.ts` for session management
- Audit logging in `lib/security/audit-logger.ts`

#### Option 2: Memory Storage (Serverless)

**Implementation**: `/lib/server-storage-memory.ts`

- **Technology**: In-memory JavaScript Maps
- **Persistence**: None (runtime-only, resets on function cold start)

**Data Structures**:
- `chatSessions`: Map<sessionId, session>
- `userSessions`: Map<userId, sessionId[]>
- `clinicalFiles`: Map<fileId, file>
- `fichas`: Map<fichaId, ficha>
- `patientRecords`: Map<patientId, patient>

**Read/Write Patterns**:
- All operations are synchronous in-memory
- No encryption (ephemeral)
- No persistence across deployments

**Use Case**: Vercel deployments where SQLite is not available.

### External Data Sources

#### Google Gemini Files API

**Implementation**: `/lib/clinical-file-manager.ts`

- **Purpose**: Upload and process clinical documents (PDFs, images, text)
- **API**: Google Generative AI SDK (`@google/genai`)
- **File Storage**: Google-managed, temporary (expires after processing)
- **Max File Size**: Not explicitly limited in code (respects Gemini API limits)

**Read/Write Patterns**:
- Write: Upload file via `uploadFile()` → Receive `geminiFileUri`
- Read: Pass `geminiFileUri` to GenerativeModel context
- Metadata: Stored in IndexedDB `clinical_files` store

#### Supabase (Configured but Usage Unclear)

**Implementation**: `@supabase/supabase-js` in dependencies

- **Status**: Package installed, but no explicit schema or usage found in main codebase
- **Possible Use**: May be used in future or legacy code
- **Configuration**: Not found in current codebase

---

## 5. State Management

### Global State Management

**Primary System**: React Context API

#### 1. Display Preferences Context

**Implementation**: `/providers/display-preferences-provider.tsx`

**Provider**: `DisplayPreferencesProvider`

**State Managed**:
- UI display settings
- Layout preferences
- Panel visibility states

**Access**: Via `useDisplayPreferences()` hook

**Scope**: Entire application (wraps root layout)

#### 2. Theme Provider

**Implementation**: `/components/theme-provider.tsx`

**Library**: `next-themes` 0.4.4

**State Managed**:
- Light/dark theme toggle
- System preference detection
- Theme persistence

**Access**: Via `useTheme()` hook from next-themes

**Scope**: Entire application (wraps root layout)

### Singleton State Systems

#### 1. HopeAI System (Main Orchestration)

**Implementation**: `/lib/hopeai-system.ts`

**Pattern**: Singleton class with lazy initialization via Proxy

**State Managed**:
- Storage adapter reference
- Intent router instance
- Dynamic orchestrator instance
- Active sessions map

**Key Methods**:
- `initialize()`: Parallel initialization of storage, router, orchestrator
- `createClinicalSession()`: Creates new session with mode
- `sendMessage()`: Orchestrates message processing with agent routing
- `getSession()`: Retrieves session state
- `updateSession()`: Updates session state

**Connection to Data Layer**:
- Uses `ServerStorageAdapter` for persistence
- IndexedDB for client-side state
- Manages session lifecycle

**Access**: Imported directly, singleton ensures single instance

#### 2. Global Orchestration System

**Implementation**: `/lib/orchestration-singleton.ts`

**Function**: `getGlobalOrchestrationSystem()`

**State Managed**:
- Single shared DynamicOrchestrator instance
- Orchestration configuration
- Performance metrics

**Configuration**:
- Migration percentage: 75% (gradual rollout)
- Dynamic orchestration: Enabled
- Monitoring: Enabled

**Scope**: All API routes share the same instance

#### 3. Clinical Agent Router

**Implementation**: `/lib/clinical-agent-router.ts`

**Pattern**: Singleton class

**State Managed**:
- Session-scoped file cache (Map<sessionId, ClinicalFile[]>)
- Last cleanup timestamp
- Inactive session timeout: 30 minutes

**Three Agents**:
1. **Supervisor Clínico (socratico)**: Clinical supervision, risk assessment
2. **Especialista en Documentación (clinico)**: Documentation, Ficha Clínica generation
3. **Investigador Académico (academico)**: Research validation, evidence gathering

**Agent Selection**:
- Based on intent classification from `IntelligentIntentRouter`
- Falls back to `socratico` for ambiguous intents
- Confidence threshold: 0.8

**Connection to Data Layer**:
- Caches clinical files to avoid re-fetching
- Automatic cleanup of stale session caches

#### 4. Tool Registry

**Implementation**: `/lib/tool-registry.ts`

**Pattern**: Singleton class

**State Managed**:
- Map of clinical tools (Function Calling declarations)
- Tool metadata (categories, priorities, keywords, domains)

**Current Tools** (Beta Rationalization in Progress):
1. `formulate_clarifying_question` (priority 9) - **REMOVE per 80/20 rule**
2. `identify_core_emotion` (priority 8) - **REMOVE per 80/20 rule**
3. `detect_pattern` (priority 8) - **REMOVE per 80/20 rule**
4. `generate_validating_statement` (priority 7) - **REMOVE per 80/20 rule**
5. `reframe_perspective` (priority 7) - **REMOVE per 80/20 rule**
6. `propose_behavioral_experiment` (priority 6) - **KEEP if produces structured output**
7. `google_search` (academic web search, priority 5) - **KEEP (universal, all agents)**

**Beta Tool Strategy (from Leadership Decision 2026-04-01)**:
- **80/20 Rule**: Remove 80% of semantic/template tools, keep 20% with concrete value
- **Agent Limit**: Maximum 10 tools per agent
- **Web Search**: Universal for all agents (academico uses Parallel AI variant)

**New Tools to Implement (Document Generation)**:
1. `create_treatment_plan` - Clinical document
2. `generate_progress_note` - Structured session note
3. `create_safety_plan` - Safety protocol document
4. `generate_referral_letter` - Inter-professional communication
5. `create_psychoeducation_material` - Patient handouts

**MCP Tools to Add** (Weeks 5-6):
1. `send_email` - Email via Gmail/Outlook
2. `create_calendar_event` - Schedule appointments
3. `search_memory` - Query persistent agent memory
4. `store_memory` - Save context for future sessions

**Tool Selection**:
- Keyword matching against user input
- Domain filtering (anxiety, depression, trauma, etc.)
- Priority sorting
- Conflict detection

#### 5. Patient Persistence

**Implementation**: `/lib/patient-persistence.ts`

**Pattern**: Singleton class

**State Managed**:
- IndexedDB connection to `HopeAI_PatientLibrary`
- Patient CRUD operations
- Patient search and filtering

**Scope**: Patient library components

### Component-Level State

**Pattern**: React `useState`, `useReducer`, `useEffect` hooks

**Examples**:
- `chat-interface.tsx`: Message input, streaming state, file attachments
- `conversation-history-list.tsx`: Session list, loading states
- `reasoning-bullets.tsx`: Progressive bullet rendering
- `execution-timeline.tsx`: Tool execution log

**No Global State Libraries**: No Redux, MobX, Zustand, Jotai, or similar found.

---

## 6. Core Services and Modules

### Orchestration Layer

| File | Purpose | Key Exports | Dependencies |
|------|---------|-------------|--------------|
| `lib/hopeai-system.ts` | Main system orchestrator | `HopeAISystem` class | `server-storage-adapter`, `intelligent-intent-router`, `dynamic-orchestrator` |
| `lib/orchestration-singleton.ts` | Global orchestration instance | `getGlobalOrchestrationSystem()` | `dynamic-orchestrator`, `hopeai-orchestration-bridge` |
| `lib/hopeai-orchestration-bridge.ts` | Legacy system integration | `HopeAIOrchestrationBridge` class | `dynamic-orchestrator` |
| `lib/dynamic-orchestrator.ts` | AI-based agent/tool selection | `DynamicOrchestrator` class | `google-genai-config`, `tool-registry` |
| `lib/intelligent-intent-router.ts` | Intent classification | `IntelligentIntentRouter` class | `google-genai-config`, `entity-extraction-engine` |
| `lib/clinical-agent-router.ts` | 3-agent routing system | `ClinicalAgentRouter` class | `clinical-context-storage` |

### Clinical Processing

| File | Purpose | Key Exports | Dependencies |
|------|---------|-------------|--------------|
| `lib/clinical-task-orchestrator.ts` | Ficha Clínica generation | `ClinicalTaskOrchestrator` class | `google-genai-config`, `clinical-file-manager` |
| `lib/clinical-file-manager.ts` | File upload & Gemini API | `ClinicalFileManager` class | `google-genai-config` |
| `lib/clinical-pattern-analyzer.ts` | Pattern detection | `ClinicalPatternAnalyzer` class | `clinical-context-storage` |
| `lib/patient-summary-builder.ts` | Context synthesis | `buildPatientContext()` | `clinical-context-storage` |
| `lib/chilean-clinical-vocabulary.ts` | Spanish clinical terms | `CHILEAN_CLINICAL_VOCAB` | None |
| `lib/chilean-clinical-corrections.ts` | Auto-corrections | `CHILEAN_CLINICAL_CORRECTIONS` | None |

### Academic & Research

| File | Purpose | Key Exports | Dependencies |
|------|---------|-------------|--------------|
| `lib/academic-multi-source-search.ts` | Multi-source search orchestration | `AcademicMultiSourceSearch` class | `parallel-ai-search`, `pubmed-research-tool`, `crossref-doi-resolver` |
| `lib/parallel-ai-search.ts` | Parallel AI search | `ParallelAISearch` class | `parallel-web` |
| `lib/pubmed-research-tool.ts` | PubMed API integration | `PubMedResearchTool` class | `crossref-doi-resolver` |
| `lib/crossref-doi-resolver.ts` | DOI resolution | `CrossrefDOIResolver` class | None (external API) |
| `lib/academic-search-enhancer.ts` | Query optimization | `AcademicSearchEnhancer` class | None |
| `lib/academic-source-validator.ts` | Source validation | `AcademicSourceValidator` class | None |
| `lib/academic-reference-validator.ts` | Reference validation | `AcademicReferenceValidator` class | None |

### Storage & Persistence

| File | Purpose | Key Exports | Dependencies |
|------|---------|-------------|--------------|
| `lib/server-storage-adapter.ts` | Storage abstraction | `ServerStorageAdapter` class | `hipaa-compliant-storage`, `server-storage-memory` |
| `lib/hipaa-compliant-storage.ts` | SQLite encrypted storage | `HIPAACompliantStorage` class | `better-sqlite3`, `encryption-utils` |
| `lib/server-storage-memory.ts` | In-memory storage | `MemoryServerStorage` class | None |
| `lib/clinical-context-storage.ts` | IndexedDB management | `initDatabase()`, session/file CRUD | IndexedDB API |
| `lib/patient-persistence.ts` | Patient records | `PatientPersistence` singleton | IndexedDB API |
| `lib/pattern-analysis-storage.ts` | Pattern storage | Pattern CRUD | IndexedDB API |
| `lib/client-context-persistence.ts` | Client persistence helper | Persistence utilities | IndexedDB API |
| `lib/ui-preferences-storage.ts` | UI preferences | Preference CRUD | IndexedDB API |
| `lib/user-preferences-manager.ts` | User preferences | `UserPreferencesManager` class | `ui-preferences-storage` |

### Tools & Entity Extraction

| File | Purpose | Key Exports | Dependencies |
|------|---------|-------------|--------------|
| `lib/tool-registry.ts` | Clinical tool catalog | `ToolRegistry` singleton, 7 tools | `@google/genai` |
| `lib/entity-extraction-engine.ts` | NER and entity extraction | `EntityExtractionEngine` class | `google-genai-config` |
| `lib/entity-extraction-plugin-registry.ts` | Pluggable extractors | `EntityExtractionPluginRegistry` | None |

### Markdown Processing

| File | Purpose | Key Exports | Dependencies |
|------|---------|-------------|--------------|
| `lib/markdown-parser.ts` | Standard parsing | `parseMarkdown()` | `markdown-it` |
| `lib/markdown-parser-streamdown.ts` | Streaming parsing | `parseStreamingMarkdown()` | `streamdown` |
| `lib/incremental-markdown-parser.ts` | Incremental parsing | `IncrementalMarkdownParser` class | `unified`, `remark-parse`, `remark-rehype`, `rehype-sanitize` |
| `lib/markdown-sanitize-schema.ts` | XSS sanitization schema | `auroraMarkdownSchema` | `rehype-sanitize` |
| `lib/rehype-aurora-classes.ts` | Custom Rehype plugin | `rehypeAuroraClasses()` | `unified` |

### Context & Token Management

| File | Purpose | Key Exports | Dependencies |
|------|---------|-------------|--------------|
| `lib/context-window-manager.ts` | Token optimization | `ContextWindowManager` class | None |
| `lib/context-optimization-manager.ts` | Token counting | `ContextOptimizationManager` class | None |

### Configuration & Utilities

| File | Purpose | Key Exports | Dependencies |
|------|---------|-------------|--------------|
| `lib/google-genai-config.ts` | GenAI/Vertex AI init | `getGenAIClient()`, `createGenerativeModel()` | `@google/genai`, `google-auth-library` |
| `lib/env-validator.ts` | Environment validation | `validateEnv()` | None |
| `lib/logger.ts` | Centralized logging | `logger` object | `lib/security/console-blocker` |
| `lib/encryption-utils.ts` | AES-256-GCM encryption | `encrypt()`, `decrypt()` | Node.js `crypto` |
| `lib/response-watermark.ts` | Response tracking | `addWatermark()` | None |
| `lib/vertex-link-converter.ts` | Vertex AI links | `convertVertexLinks()` | None |
| `lib/search-query-middleware.ts` | Query preprocessing | `preprocessQuery()` | None |
| `lib/sse-client.ts` | SSE client | `SSEClient` class | None |
| `lib/server-prewarm.ts` | Server pre-warming | `prewarmServer()` | None |
| `lib/singleton-monitor.ts` | Singleton monitoring | `SingletonMonitor` class | None |
| `lib/dynamic-status.ts` | Status management | `DynamicStatus` class | None |
| `lib/utils.ts` | General utilities | `cn()`, misc utils | `clsx`, `tailwind-merge` |

### Security

| File | Purpose | Key Exports | Dependencies |
|------|---------|-------------|--------------|
| `lib/security/admin-auth.ts` | Admin authentication | `verifyAdminRequest()`, `isProtectedEndpoint()` | None |
| `lib/security/audit-logger.ts` | Audit logging | `auditLog` object | None |
| `lib/security/rate-limiter.ts` | Rate limiting | `checkRateLimit()`, `getRequestIdentifier()` | None |
| `lib/security/console-blocker.ts` | Console blocking | Side-effect: blocks console in prod | None |
| `lib/security/error-sanitizer.ts` | Error sanitization | `sanitizeError()` | None |

### Metrics & Monitoring

| File | Purpose | Key Exports | Dependencies |
|------|---------|-------------|--------------|
| `lib/session-metrics-comprehensive-tracker.ts` | Session metrics | `SessionMetricsTracker` class | None |
| `lib/sentry-metrics-tracker.ts` | Sentry tracking | `SentryMetricsTracker` class | `@sentry/nextjs` |
| `lib/enhanced-sentry-metrics-tracker.ts` | Advanced metrics | `EnhancedSentryMetricsTracker` class | `@sentry/nextjs` |
| `lib/enhanced-metrics-types.ts` | Metrics types | Type definitions | None |
| `lib/orchestrator-monitoring.ts` | Orchestration monitoring | `OrchestratorMonitor` class | None |

---

## 7. Routing and Navigation

### Application Structure

**Routing Solution**: Next.js 15 App Router with TypeScript

### Routes and Pages

| Route | Component/Handler | Purpose |
|-------|-------------------|---------|
| `/` | `app/page.tsx` → `MainInterfaceOptimized` | Main chat interface |
| `/sentry-example-page` | `app/sentry-example-page/page.tsx` | Sentry error testing page |

**Note**: This is a single-page application (SPA) with dynamic client-side routing. Navigation is handled via React state and component rendering, not URL-based routing.

### API Routes

All API routes are defined in `/app/api/` using Next.js 15 App Router conventions.

| Route | Method | Handler | Purpose |
|-------|--------|---------|---------|
| `/api/send-message` | POST | `app/api/send-message/route.ts` | Main AI message processing (SSE streaming) |
| `/api/agents` | GET | `app/api/agents/route.ts` | List available clinical agents |
| `/api/sessions` | GET, POST | `app/api/sessions/route.ts` | Session CRUD operations |
| `/api/documents` | GET | `app/api/documents/route.ts` | Retrieve clinical documents |
| `/api/upload-document` | POST | `app/api/upload-document/route.ts` | Upload file to Gemini Files API |
| `/api/transcribe-audio` | POST | `app/api/transcribe-audio/route.ts` | Gemini audio transcription |
| `/api/academic-search` | POST | `app/api/academic-search/route.ts` | Multi-source academic search |
| `/api/patients/[id]/ficha` | GET, POST | `app/api/patients/[id]/ficha/route.ts` | Generate/retrieve Ficha Clínica |
| `/api/patients/[id]/pattern-analysis` | GET, POST | `app/api/patients/[id]/pattern-analysis/route.ts` | Pattern analysis for patient |
| `/api/orchestration/health` | GET, POST | `app/api/orchestration/health/route.ts` | Orchestration health check |
| `/api/orchestration/metrics` | GET, POST | `app/api/orchestration/metrics/route.ts` | Orchestration metrics |
| `/api/orchestration/alerts` | GET, POST | `app/api/orchestration/alerts/route.ts` | Orchestration alerts |
| `/api/orchestration/reports` | GET, POST | `app/api/orchestration/reports/route.ts` | Orchestration reports |
| `/api/security/audit` | GET | `app/api/security/audit/route.ts` | Audit logs (admin-protected) |
| `/api/system-status` | GET | `app/api/system-status/route.ts` | Overall system status |
| `/api/switch-agent` | POST | `app/api/switch-agent/route.ts` | Switch active agent |
| `/api/pioneer-circle` | GET, POST | `app/api/pioneer-circle/route.ts` | Pioneer circle invitation |
| `/api/health` | GET | `app/api/health/route.ts` | System health check |
| `/api/sentry-example-api` | GET | `app/api/sentry-example-api/route.ts` | Sentry testing endpoint |
| `/api/check-file-status` | GET | `pages/api/check-file-status.ts` | Check Gemini file status (legacy Pages Router) |

### Navigation Pattern

**Client-Side Navigation**:
- No traditional page routing
- State-based view switching in `MainInterfaceOptimized`
- Sidebar navigation between conversations
- Patient library navigation
- Modal/dialog-based interactions

---

## 8. Authentication and Authorization

### Authentication Mechanism

**Type**: Token-based admin authentication (not user authentication)

**Implementation**: `/lib/security/admin-auth.ts`

**Protected Endpoints**:
- `/api/security/audit` (audit logs)
- `/api/orchestration/reports` (system reports)

**Authentication Flow**:
1. Client includes `Authorization: Bearer <token>` header
2. Middleware (`middleware.ts`) checks if endpoint is protected
3. Calls `verifyAdminRequest()` from `admin-auth.ts`
4. Validates token against `ADMIN_API_TOKEN` environment variable
5. Returns 401 if invalid, allows request if valid

**Admin Token Requirements**:
- Must be a hex string
- Minimum 32 characters
- Set via `ADMIN_API_TOKEN` environment variable
- Required in production (`NODE_ENV=production`)

**Rate Limiting**:
- Implemented per-IP in `/lib/security/rate-limiter.ts`
- Applied via middleware to all routes
- Limits: 20 requests per minute (default)
- Blocked IPs: Temporary ban after excessive requests

**User Authentication**: Not implemented. No login system for end users.

### Security Headers

**Implementation**: `middleware.ts` and `next.config.mjs`

**Headers Applied**:
- `X-Frame-Options: DENY` (prevent clickjacking)
- `X-Content-Type-Options: nosniff` (prevent MIME sniffing)
- `X-XSS-Protection: 1; mode=block` (legacy XSS protection)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: microphone=*, camera=*` (allow voice input)
- `Content-Security-Policy` (production only)
- `Strict-Transport-Security` (HSTS, production only)

---

## 9. API and External Integrations

### Google AI (Gemini)

**SDK**: `@google/genai` v1.47.0

**Configuration**: `/lib/google-genai-config.ts`

**Features Used**:
- **Text Generation**: Gemini 2.5 Flash model
- **Function Calling**: Tool selection and intent classification
- **Files API**: Document upload and processing
- **Audio Transcription**: Gemini audio-to-text
- **Streaming**: Real-time response streaming

**Model Configuration**:
- Default model: `gemini-2.5-flash`
- Temperature: 0.3 (conservative for clinical)
- Max output tokens: 35000
- topK: 40
- topP: 0.95

**Safety Settings**:
- `HARM_CATEGORY_HARASSMENT`: BLOCK_MEDIUM_AND_ABOVE
- `HARM_CATEGORY_HATE_SPEECH`: BLOCK_MEDIUM_AND_ABOVE
- `HARM_CATEGORY_SEXUALLY_EXPLICIT`: BLOCK_MEDIUM_AND_ABOVE
- `HARM_CATEGORY_DANGEROUS_CONTENT`: BLOCK_MEDIUM_AND_ABOVE

**Authentication**:
- Primary: `NEXT_PUBLIC_GOOGLE_AI_API_KEY` (must start with "AIza")
- Fallbacks: `GEMINI_API_KEY`, `GOOGLE_AI_API_KEY`, `GENAI_API_KEY`, `GOOGLE_API_KEY`

**Vertex AI Support**:
- Location-based endpoints (e.g., `us-central1`)
- Service account authentication via `google-auth-library`
- Environment variables:
  - `GOOGLE_CLOUD_PROJECT`
  - `GOOGLE_CLOUD_LOCATION`
  - `GOOGLE_APPLICATION_CREDENTIALS` or `GOOGLE_APPLICATION_CREDENTIALS_JSON`
  - `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

**Where Configured**: `lib/google-genai-config.ts`

**Where Called**:
- `app/api/send-message/route.ts` (main message processing)
- `app/api/upload-document/route.ts` (file uploads)
- `app/api/transcribe-audio/route.ts` (audio transcription)
- `lib/intelligent-intent-router.ts` (intent classification)
- `lib/dynamic-orchestrator.ts` (agent selection)
- `lib/clinical-task-orchestrator.ts` (Ficha Clínica generation)
- `lib/entity-extraction-engine.ts` (entity extraction)

### Parallel AI (Web Search)

**Library**: `parallel-web` v0.1.2

**Configuration**: `/lib/parallel-ai-search.ts`

**Purpose**: Academic web search with domain filtering

**Trusted Academic Domains** (3 tiers):
- **Tier 1**: pubmed.ncbi.nlm.nih.gov, psycnet.apa.org, cochranelibrary.com, nature.com, science.org, thelancet.com, bmj.com
- **Tier 2**: sciencedirect.com, link.springer.com, onlinelibrary.wiley.com, frontiersin.org, plos.org, mdpi.com
- **Tier 3**: researchgate.net, academia.edu, semanticscholar.org, arxiv.org

**Features**:
- Domain whitelisting
- Result ranking by trust tier
- Language filtering (Spanish/English)
- Metadata extraction

**Where Configured**: `lib/parallel-ai-search.ts`

**Where Called**: `app/api/academic-search/route.ts`, `lib/academic-multi-source-search.ts`

### PubMed (NIH E-utilities API)

**Implementation**: `/lib/pubmed-research-tool.ts`

**API Endpoints**:
- `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi` (search)
- `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi` (details)

**Features**:
- PMID search
- Article metadata fetching
- Language filtering
- Result caching (24-hour TTL)
- DOI validation via Crossref

**Where Configured**: `lib/pubmed-research-tool.ts`

**Where Called**: `lib/academic-multi-source-search.ts`

### Crossref API

**Implementation**: `/lib/crossref-doi-resolver.ts`

**API Endpoint**: `https://api.crossref.org/works/{doi}`

**Purpose**: DOI resolution and metadata extraction

**Features**:
- DOI validation
- Metadata retrieval (title, authors, journal, year)
- Citation format generation

**Where Configured**: `lib/crossref-doi-resolver.ts`

**Where Called**: `lib/pubmed-research-tool.ts`, `lib/academic-multi-source-search.ts`

### Sentry (Error Tracking)

**SDK**: `@sentry/nextjs` v9.42.0

**Configuration Files**:
- `sentry.server.config.ts` (server-side)
- `sentry.edge.config.ts` (edge runtime)
- `sentry.properties` (project properties)
- `next.config.mjs` (build integration)

**DSN**: `https://da82e6d85538fbb3f2f5337705c12919@o4509744324673536.ingest.us.sentry.io/4509744325853184`

**Organization**: `hopeai-rh`

**Project**: `sentry-indigo-umbrella`

**Configuration**:
- Traces sample rate: 1.0 (dev), 0.1 (prod)
- Replays sample rate: 0.1
- Error sample rate: 1.0
- Console logging: Disabled in production
- Source maps: Hidden from client
- Tunnel route: `/monitoring` (bypass ad-blockers)

**Features**:
- Error tracking
- Performance monitoring
- Session replay
- Breadcrumb tracking
- Custom metrics via `lib/sentry-metrics-tracker.ts`

**Where Configured**: Root config files

**Where Called**:
- Automatically in all routes (via Next.js integration)
- Manual tracking in `lib/sentry-metrics-tracker.ts`, `lib/enhanced-sentry-metrics-tracker.ts`

### Supabase

**SDK**: `@supabase/supabase-js` v2.76.1

**Status**: **Package installed but no explicit usage found in main codebase**

**Possible Use**: Legacy or future feature

### Resend (Email)

**SDK**: `resend` v4.7.0

**Status**: **Package installed but no explicit usage found in main codebase**

**Possible Use**: Pioneer Circle invitations or future notifications

### Model Context Protocol (MCP)

**SDK**: `@modelcontextprotocol/sdk` (latest)

**Status**: **Package installed, example exists, BETA REQUIREMENT**

**Purpose**: Multi-provider integrations + persistent agent memory

**Setup Script**: `scripts/setup-sentry-mcp.js`

**Beta Requirements (from Leadership Decision 2026-04-01)**:

1. **Email Integration**:
   - Gmail/Google Calendar (primary)
   - Outlook, Apple Calendar (if MCP servers available)
   - Send clinical summaries, appointment confirmations

2. **Persistent Agent Memory** (CRITICAL):
   - Cross-conversation context retention
   - User-specific memory per agent
   - Agents can search, create, and personalize memories
   - Memory persists across sessions

3. **MCP Access Tiers**:
   - **Free Tier**: No MCP access
   - **Pro/Ultra Tiers**: Full MCP integration (Gmail, Calendar, memory)

**Implementation Priority**: High - Phase 3 (Weeks 5-6)

---

## 10. Configuration and Environment

### Environment Variables

#### Required (All Environments)

- `NEXT_PUBLIC_GOOGLE_AI_API_KEY` - Google Gemini API key (must start with "AIza")

#### Production-Only Required

- `ADMIN_API_TOKEN` - Admin authentication token (hex string, 32+ chars)
- `NEXT_PUBLIC_FORCE_PRODUCTION_MODE` - Must be "true"
- `NEXT_PUBLIC_ENABLE_PRODUCTION_LOGS` - Must be "false"
- `SENTRY_DSN` - Sentry error tracking DSN

#### Recommended

- `SENTRY_ORG` - Sentry organization name
- `SENTRY_PROJECT` - Sentry project name

#### Optional (Google/Vertex AI)

- `GOOGLE_CLOUD_PROJECT` - Vertex AI project ID
- `GOOGLE_CLOUD_LOCATION` - Vertex AI location (e.g., "us-central1")
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to service account key file
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` - Service account JSON string
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` - Service account email
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` - Service account private key
- `GENAI_SERVICE_ACCOUNT_JSON` - GenAI-specific service account JSON
- `GENAI_API_VERSION` - GenAI API version

#### Optional (Other)

- `AURORA_ENCRYPTION_KEY` - AES-256 encryption key (base64-encoded, 32 bytes)
- `HOPEAI_STORAGE_MODE` - Force storage mode ("memory" for in-memory)
- `NODE_ENV` - Environment ("development" or "production")
- `VERCEL` - Automatically set by Vercel
- `VERCEL_ENV` - Vercel environment ("production", "preview", "development")
- `CI` - CI environment flag

### Configuration Files

| File | Purpose |
|------|---------|
| `next.config.mjs` | Next.js configuration with Sentry integration, security headers, webpack customization |
| `tsconfig.json` | TypeScript compiler options (ES2022, strict mode) |
| `tailwind.config.ts` | Tailwind CSS configuration with Aurora palette |
| `postcss.config.mjs` | PostCSS configuration (Tailwind processing) |
| `vitest.config.mts` | Vitest test runner configuration |
| `.eslintrc.json` | ESLint linting rules |
| `components.json` | Shadcn component configuration |
| `sentry.server.config.ts` | Server-side Sentry configuration |
| `sentry.edge.config.ts` | Edge runtime Sentry configuration |
| `sentry.properties` | Sentry project properties |
| `middleware.ts` | Request middleware (security, rate limiting) |
| `instrumentation.ts` | Server instrumentation hook |
| `instrumentation-client.ts` | Client instrumentation hook |

### Feature Flags

**No explicit feature flag system found.**

**Configuration-Based Toggles**:
- Migration percentage in `orchestration-singleton.ts`: 75% (gradual rollout of dynamic orchestration)
- Dynamic orchestration enabled/disabled: Currently enabled
- Adaptive learning: Disabled (for performance)
- Async recommendations: Disabled (for performance)
- Monitoring: Enabled

---

## 11. Build, Deploy, and Scripts

### Available Scripts

**From `package.json`:**

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `set "NODE_OPTIONS=--openssl-legacy-provider" && next dev` | Start development server |
| `build` | `next build` | Build for production |
| `build:production` | `node scripts/verify-production-security.js && next build` | Verify security then build |
| `start` | `set "NODE_OPTIONS=--openssl-legacy-provider" && next start` | Start production server |
| `lint` | `next lint` | Run ESLint |
| `test` | `vitest` | Run tests with Vitest |
| `test:coverage` | `vitest run --coverage` | Run tests with coverage |
| `test:orchestration` | `node test-orchestration-migration.js` | Test orchestration migration |
| `monitor:orchestration` | `curl -s http://localhost:3000/api/orchestration/health \| jq` | Monitor orchestration health |
| `metrics:orchestration` | `curl -s http://localhost:3000/api/orchestration/metrics \| jq` | Get orchestration metrics |
| `reset:metrics` | `curl -X POST ... /api/orchestration/metrics` | Reset orchestration metrics |
| `setup:sentry-mcp` | `node scripts/setup-sentry-mcp.js` | Setup Sentry MCP integration |
| `verify:security` | `node scripts/verify-security.js` | Verify security configuration |
| `verify:security:old` | `node scripts/verify-production-security.js` | Legacy security verification |

### CI/CD Setup

**Status**: No `.github/workflows/` directory found. **No CI/CD currently configured.**

**Sentry Integration**: CI detection via `process.env.CI` in `next.config.mjs` (shows logs in CI, silent otherwise)

### Deployment Target

**Primary Target**: **Vercel** (inferred from codebase)

**Evidence**:
- `VERCEL` and `VERCEL_ENV` environment variable checks
- Memory storage fallback for serverless environments
- Next.js 15 (Vercel's framework)
- Vercel-specific optimizations in `next.config.mjs`

**Storage Strategy**:
- **Local/VM**: SQLite with HIPAA-compliant encryption
- **Vercel**: In-memory storage (no persistence)

**Alternative Targets**: Any Node.js hosting platform that supports Next.js 15

### Build Process

**Build Tool**: Next.js built-in compiler (Webpack with Terser)

**Build Optimizations**:
- Console.log stripping from client bundle (production)
- Dead code elimination
- Source map hiding
- Image optimization disabled (`unoptimized: true`)
- ESLint and TypeScript errors ignored during build (for CI/CD flexibility)

**Production Security Verification**:
- `scripts/verify-production-security.js`: Checks required env vars
- `scripts/verify-security.js`: General security checks

---

## 12. Conventions and Patterns

### Code Style and Organization

#### File Naming
- **React Components**: PascalCase with `.tsx` extension (e.g., `ChatInterface.tsx`, `MainInterfaceOptimized.tsx`)
- **Utilities/Services**: kebab-case with `.ts` extension (e.g., `clinical-agent-router.ts`, `google-genai-config.ts`)
- **API Routes**: kebab-case with `route.ts` (e.g., `send-message/route.ts`)
- **Types**: kebab-case with `.ts` extension (e.g., `clinical-types.ts`)

#### Directory Organization
- **Feature-based**: Components and logic grouped by feature (e.g., patient library, voice transcription)
- **Layered architecture**: Clear separation of concerns (API → Services → Storage)
- **Colocation**: Related components in same directory (e.g., `components/patient-library/`)

#### Component Structure
- **Functional components** with hooks (no class components found)
- **Composition over inheritance**: Components composed from smaller components
- **Custom hooks**: Extracted reusable logic (e.g., `useHopeAISystem`, `useDisplayPreferences`)
- **Props interfaces**: Explicit TypeScript interfaces for component props

#### Naming Conventions
- **Variables**: camelCase (e.g., `sessionId`, `currentAgent`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `CHILEAN_CLINICAL_VOCAB`, `SECURITY_CONFIG`)
- **Types/Interfaces**: PascalCase (e.g., `ChatMessage`, `ClinicalFile`)
- **Enums**: PascalCase with SCREAMING_SNAKE_CASE values (e.g., `ToolCategory.EMOTIONAL_EXPLORATION`)
- **Functions**: camelCase (e.g., `sendMessage`, `parseMarkdown`)
- **Classes**: PascalCase (e.g., `HopeAISystem`, `ClinicalAgentRouter`)

### Error Handling Patterns

#### API Routes
- **Try-catch blocks** wrapping all async operations
- **Structured error responses**: `{ error: string, message: string, timestamp: ISO8601 }`
- **HTTP status codes**: 400 (bad request), 401 (unauthorized), 403 (forbidden), 429 (rate limit), 500 (internal error)
- **Error sanitization**: Production errors sanitized via `lib/security/error-sanitizer.ts`

#### Client-Side
- **Error boundaries**: `app/global-error.tsx` for unhandled React errors
- **Toast notifications**: User-facing errors via Sonner toasts
- **Graceful degradation**: Fallback to default agent on routing errors

#### Sentry Integration
- **Automatic error tracking**: All uncaught errors sent to Sentry
- **Custom error context**: Breadcrumbs and tags added for debugging
- **Error sampling**: 100% in dev, configurable in prod

### Custom Hooks and Abstractions

#### Custom Hooks (Inferred from Usage)
- `useHopeAISystem()` - Access to main orchestration system
- `useDisplayPreferences()` - UI preference management
- `useTheme()` - Theme management (from next-themes)
- `useToast()` - Toast notification system (in `components/ui/use-toast.ts`)

#### Reusable Abstractions

**Singleton Pattern**:
- `HopeAISystem` (main orchestrator)
- `ToolRegistry` (clinical tools)
- `PatientPersistence` (patient records)
- `ClinicalAgentRouter` (agent routing)
- Global orchestration system

**Proxy Pattern**:
- Lazy initialization of GenAI client in `google-genai-config.ts`

**Adapter Pattern**:
- `ServerStorageAdapter` (abstracts storage backend)

**Builder Pattern**:
- `buildPatientContext()` in `patient-summary-builder.ts`

**Registry Pattern**:
- `ToolRegistry` for Function Calling tools
- `EntityExtractionPluginRegistry` for entity extractors

### TypeScript Usage

- **Strict mode enabled**: `strict: true` in tsconfig.json
- **Explicit types**: Most functions have explicit return types
- **Type inference**: Variables use inference where types are obvious
- **Enums**: Used for categorical values (agent types, tool categories, domains)
- **Union types**: Extensive use for state machines (e.g., `status: "uploading" | "processing" | "active"`)
- **Generic types**: Used in utility functions and storage adapters
- **Type guards**: Runtime type checking where needed

### CSS and Styling Patterns

- **Utility-first**: Tailwind CSS with utility classes
- **Component variants**: `class-variance-authority` for complex component states
- **Conditional classes**: `clsx` and `tailwind-merge` for dynamic styling
- **CSS variables**: Theme colors defined as CSS custom properties
- **Dark mode**: Class-based dark mode via `next-themes`
- **Responsive design**: Mobile-first with Tailwind breakpoints
- **Custom palette**: Aurora-themed colors (Serene Teal, Clarity Blue, Academic Plum)

---

## 13. Current Limitations and Technical Debt

### Critical Bugs Blocking Beta Launch (2026-04-01)

**PRIORITY 1 - File Processing Failure**
- **Status**: NOT WORKING
- **Impact**: Files fail to upload or process correctly via Gemini Files API
- **Affected**: PDF, Word, PNG, JPG file uploads
- **Investigation**: Check `lib/clinical-file-manager.ts` and file state persistence
- **See**: STRATEGIC_PRIORITIES.md Section 2.1

**PRIORITY 2 - Patient Context Loss**
- **Status**: NOT WORKING AFTER FIRST TURN
- **Impact**: Patient context retrieved on first message but lost on subsequent turns
- **Cascade**: Causes Ficha Clínica update failures
- **Investigation**: Check `buildPatientContext()` and session state persistence
- **See**: STRATEGIC_PRIORITIES.md Section 2.2

**PRIORITY 3 - Ficha Clínica Update Failures**
- **Status**: FAILING
- **Impact**: Cannot update Fichas when previous state is lost
- **Dependency**: Blocked by patient context loss fix
- **Investigation**: Check `ClinicalTaskOrchestrator.generateFichaClinica()`
- **See**: STRATEGIC_PRIORITIES.md Section 2.3

**PRIORITY 4 - MCP Integration Missing**
- **Status**: NOT IMPLEMENTED
- **Impact**: No Gmail, Calendar, or persistent agent memory
- **Requirements**: MCP framework with easy-to-add integrations
- **Investigation**: `@modelcontextprotocol/sdk` installed but unused
- **See**: STRATEGIC_PRIORITIES.md Section 2.4

**PRIORITY 5 - Manual Message Controls Missing**
- **Status**: NOT IMPLEMENTED
- **Impact**: Users cannot edit/retry messages or stop generation
- **Requirements**: Edit user messages, retry agent responses, stop streaming
- **Investigation**: UI components in `message-bubble.tsx` and `chat-interface.tsx`
- **See**: STRATEGIC_PRIORITIES.md Section 2.5

**PRIORITY 6 - No Internationalization**
- **Status**: HARDCODED STRINGS
- **Impact**: Cannot serve Argentina/Brasil markets
- **Requirements**: Spanish (Chile/Argentina) and Portuguese (Brasil) support
- **Framework**: next-intl or next-i18next for Next.js 15
- **See**: STRATEGIC_PRIORITIES.md Section 1.3

### TODO/FIXME/HACK Comments Found

| File | Line | Comment |
|------|------|---------|
| `components/conversation-history-list.tsx` | 157 | `// TODO: Implementar loadSession cuando esté disponible en useHopeAISystem` |
| `components/message-file-attachments.tsx` | 141 | `// TODO: Implementar vista previa` (file preview) |
| `components/message-file-attachments.tsx` | 153 | `// TODO: Implementar descarga` (file download) |
| `lib/academic-multi-source-search.ts` | 90 | `// TODO: Revertir a prioridad 3 después de pruebas` (PubMed priority temporary boost) |
| `lib/hopeai-system.ts` | 1451 | `🔧 FIX: Obtener TODOS los archivos procesados de una sesión` |

### Obvious Gaps

#### Testing
- **Limited test coverage**: Vitest configured but no test files found in standard locations
- **No E2E tests**: No Playwright/Cypress configuration
- **No integration tests**: API routes not tested
- **No component tests**: React components not tested

#### Documentation
- **Inline documentation**: Moderate JSDoc coverage, but inconsistent
- **API documentation**: No OpenAPI/Swagger spec
- **Component documentation**: No Storybook or component library docs
- **Deployment docs**: Minimal (only Vercel Google credentials guide)

#### Error Handling
- **Inconsistent error messages**: Some areas lack user-friendly error messages
- **No retry logic**: Failed API calls don't retry automatically
- **No circuit breakers**: External API failures can cascade

#### Security
- **No user authentication**: Only admin token authentication
- **No session management**: Client-side sessions not securely managed
- **No CSRF protection**: Not implemented (may be needed for future forms)
- **Audit logs not persistent**: In-memory audit logs lost on restart (memory storage mode)

#### Performance
- **No caching layer**: API responses not cached (except PubMed 24h TTL)
- **No CDN integration**: Static assets served directly
- **No lazy loading**: Components not code-split beyond Next.js defaults
- **Large bundle size**: Not optimized (many Radix UI components)

#### Data Persistence
- **Vercel storage is ephemeral**: No persistence in serverless mode
- **No backup strategy**: No automated backups of SQLite database
- **No data migration strategy**: Schema changes require manual migration

#### Accessibility
- **No ARIA labels**: Many interactive elements lack accessibility labels
- **No keyboard navigation**: Complex UI interactions may not be keyboard-accessible
- **No screen reader testing**: Not verified for screen readers

#### Internationalization
- **Hardcoded Spanish/English**: No i18n framework (strings mixed in code)
- **Chilean-specific**: Clinical vocabulary is Chile-focused
- **No locale management**: No date/time locale handling

#### Monitoring
- **No uptime monitoring**: No external health checks
- **No alerting**: Sentry alerts not configured
- **No performance budgets**: No metrics thresholds

### Unused Dependencies

**Potentially Unused** (no explicit usage found in main codebase):
- `@supabase/supabase-js` v2.76.1 - Package installed but no clear usage
- `resend` v4.7.0 - Email SDK installed but no clear usage
- `@modelcontextprotocol/sdk` - MCP installed but only example found, not production usage
- `hast` v1.0.0 - AST type definitions, may be transitive dependency
- `@types/markdown-it` - Type definitions, may not be directly used

**Note**: These may be used in files not inspected or planned for future features. Recommend reviewing with dependency analyzer tool.

### Build Configuration Issues

- **TypeScript errors ignored**: `ignoreBuildErrors: true` in `next.config.mjs` (allows broken code to deploy)
- **ESLint errors ignored**: `ignoreDuringBuilds: true` (allows linting issues in production)
- **OpenSSL legacy provider**: Required for dev/start scripts (indicates outdated dependencies)

### Known Technical Debt

1. **Migration in progress**: 75% dynamic orchestration, 25% legacy Aurora system (incomplete migration)
2. **Temporary priority boost**: PubMed search priority temporarily increased (line 90 of `academic-multi-source-search.ts`)
3. **File session retrieval incomplete**: `loadSession` not yet available in `useHopeAISystem` hook
4. **File preview/download not implemented**: UI placeholders exist but functionality missing
5. **Console output stripped**: Production client bundle has console.log removed (makes debugging harder)
6. **Source maps hidden**: Production source maps not accessible (makes debugging harder)
7. **No production logs**: `NEXT_PUBLIC_ENABLE_PRODUCTION_LOGS` must be "false" (limits production debugging)

### Security Considerations

- **API key in client bundle**: `NEXT_PUBLIC_GOOGLE_AI_API_KEY` exposed to client (mitigated by "AIza" prefix validation)
- **No input validation library**: No Zod/Yup validation on API routes (only in forms)
- **No SQL injection protection**: SQLite queries may be vulnerable if not parameterized (review needed)
- **No XSS protection in legacy code**: Markdown sanitization only in new code paths
- **Rate limiting per IP**: Can be bypassed with IP rotation
- **Admin token in plain text**: `ADMIN_API_TOKEN` stored as environment variable (no secrets manager)

---

## End of Architecture Documentation

**Last Updated**: 2026-03-31
**Verified Against Commit**: 3b90218
**Documentation Standard**: Actual current state only, no assumptions or aspirations

For questions or clarifications, refer to the actual source code in the repository.
