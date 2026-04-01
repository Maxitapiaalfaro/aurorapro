# STRATEGIC_PRIORITIES.md

**AuroraPro Beta Launch Strategy & Technical Priorities**

*Last Updated: 2026-04-01*
*Status: Pre-Beta Planning*
*Target Market: Independent Psychologists (Chile, Argentina, Brasil)*

---

## Executive Summary

AuroraPro is preparing for beta launch targeting **independent psychologists** working solo without supervision. The strategy prioritizes rapid iteration, local-first experience with cloud synchronization, and HIPAA-compliant infrastructure on Vercel/Firebase/GCloud. This document outlines critical priorities, architectural decisions, and implementation roadmap for beta readiness.

---

## 1. Strategic Decisions

### 1.1 Target Market & User Model

**Beta Target:**
- **Primary**: Independent psychologists (solo practitioners)
- **Geography**: Chile, Argentina, Brasil
- **Out of Scope for Beta**: Clinics, supervisors, enterprise clients

**User Authentication Model:**
- Demo users + admin tokens (enables rapid iteration)
- Single-user scoped experience (no multi-user collaboration)
- Clinic/enterprise features deferred post-beta

**Rationale**: Focusing on solo practitioners reduces complexity, accelerates feedback loops, and validates core clinical workflow before scaling to institutional clients.

---

### 1.2 Storage & Persistence Architecture

**Local-First Strategy:**
- **Client**: IndexedDB for optimistic UI and offline capability
- **Server**: Firebase Firestore for persistence with parallel synchronization
- **Deployment**: Vercel (production) + Google Cloud (HIPAA compliance)

**HIPAA Compliance Path:**
- Firestore + Google Cloud Platform provide HIPAA-compliant infrastructure
- Business Associate Agreement (BAA) required with Google Cloud
- Replace current SQLite/MemoryStorage with Firestore integration

**Migration Plan:**
1. Keep IndexedDB for client-side optimistic updates
2. Replace `ServerStorageAdapter` backends with Firestore client
3. Implement bidirectional sync (IndexedDB ↔ Firestore)
4. Enable offline-first with conflict resolution

**Status**: Current SQLite/MemoryStorage is **not production-ready** for beta. Firestore integration is **critical path** item.

---

### 1.3 Internationalization (i18n)

**Beta Requirement:**
- **Languages**: Spanish (Chile), Spanish (Argentina), Portuguese (Brasil)
- **Framework**: next-i18next or next-intl (recommended for Next.js 15 App Router)
- **Priority**: Must be implemented for beta launch

**Implementation Scope:**
1. UI strings and labels
2. Clinical vocabulary (extend `chilean-clinical-vocabulary.ts` to regional variants)
3. Date/time formatting per locale
4. Error messages and toast notifications

**Current State**: Hardcoded Spanish/English strings throughout codebase. **Critical refactor needed**.

---

### 1.4 Testing & CI/CD Strategy

**Current State:**
- Minimal test coverage
- No CI/CD pipelines
- Manual testing only

**Beta Requirements:**
- **Critical Process Coverage**: Agent routing, file processing, patient context retrieval, Ficha generation
- **CI/CD Goals**: Catch errors before staging/production, improve feature launch velocity
- **Testing Pyramid**:
  - E2E tests for critical user flows (Playwright/Cypress)
  - Integration tests for API routes (Vitest)
  - Unit tests for core services (agent router, storage adapter, intent classifier)

**Recommended CI/CD Pipeline** (GitHub Actions):
1. **Pre-merge checks**: Lint, type-check, unit tests
2. **Staging deployment**: E2E tests on preview URLs
3. **Production deployment**: Manual approval gate after staging validation

**Priority**: Set up CI/CD **before** fixing critical bugs to prevent regressions.

---

## 2. Critical Bugs & Missing Features (Beta Blockers)

### 2.1 File Processing (CRITICAL - NOT WORKING)

**Problem**: File uploads via Gemini Files API are failing or not processed correctly.

**Requirements**:
- Support PDF, Word (DOCX), PNG, JPG, TXT
- Gemini 3.x (Flash/Pro) must handle all formats
- Files must persist across conversation turns

**Investigation Needed**:
1. Check Gemini Files API integration in `lib/clinical-file-manager.ts`
2. Verify file state persistence in IndexedDB `clinical_files` store
3. Test file reference passing to GenerativeModel context
4. Confirm Gemini API quota and file size limits

**Likely Root Cause**: File references may be lost in context window management or not properly attached to chat history.

**Fix Strategy**:
- Add comprehensive logging to file upload/retrieval pipeline
- Test with all supported formats
- Implement retry logic for failed uploads
- Add file processing status UI feedback

---

### 2.2 Patient Context Loss (CRITICAL - NOT WORKING)

**Problem**: Patient context retrieves correctly on first turn but is lost after subsequent messages. Patient conversation state is also lost.

**Symptoms**:
- First message includes patient context
- Second message onward loses patient metadata
- Ficha Clínica updates fail due to missing prior state

**Investigation Needed**:
1. Trace `buildPatientContext()` in `patient-summary-builder.ts`
2. Verify session retrieval in `hopeai-system.ts`
3. Check conversation history persistence in `clinical-context-storage.ts`
4. Confirm agent router maintains patient ID across turns

**Likely Root Cause**: Session state not persisting to storage after each turn, or context builder only runs on session initialization.

**Fix Strategy**:
- Ensure `updateSession()` is called after every message
- Add patient ID to all chat messages (not just first)
- Implement session state recovery on page reload
- Add comprehensive state debugging logs

---

### 2.3 Ficha Clínica Update Failures (CRITICAL)

**Problem**: Ficha updates fail when previous state is lost (cascading from 2.2).

**Dependencies**: Requires fix for patient context loss.

**Investigation Needed**:
1. Review `ClinicalTaskOrchestrator.generateFichaClinica()`
2. Check IndexedDB `fichas_clinicas` store operations
3. Verify Ficha retrieval before updates

**Fix Strategy**:
- Implement optimistic Ficha updates with rollback
- Add Ficha versioning to prevent data loss
- Store Ficha snapshots before each update
- Add conflict resolution for concurrent edits

---

### 2.4 MCP Integration (CRITICAL - NOT IMPLEMENTED)

**Requirements**:
1. **Gmail Integration**: Email clinical summaries, appointment confirmations
2. **Calendar Integration**: Schedule/manage appointments
3. **Persistent Memory**: Agent-specific memory layer for patient preferences, clinical notes

**MCP Architecture Goals**:
- Easy to add new integrations (plugin architecture)
- Minimal maintenance overhead
- Secure credential management

**Implementation Plan**:

#### Phase 1: MCP Server Framework
```
/lib/mcp/
  ├── mcp-registry.ts          # Central registry for MCP servers
  ├── mcp-client.ts            # Client for connecting to MCP servers
  ├── servers/
  │   ├── gmail-server.ts      # Gmail MCP server
  │   ├── calendar-server.ts   # Google Calendar MCP server
  │   └── memory-server.ts     # Persistent memory MCP server
  └── types.ts                 # MCP type definitions
```

#### Phase 2: Memory Persistence Layer
- **Storage**: Firestore collection `agent_memories`
- **Schema**: `{ agentType, patientId, memoryType, content, timestamp, metadata }`
- **Retrieval**: Vector embeddings for semantic search (optional, can use keyword initially)
- **Update Frequency**: After each significant clinical interaction

#### Phase 3: Gmail/Calendar Integration
- OAuth2 flow for Google Workspace
- Server-side credential storage (encrypted)
- MCP tools exposed to agents:
  - `send_email(to, subject, body, attachments?)`
  - `create_calendar_event(title, start, end, attendees?)`
  - `list_upcoming_appointments(days)`

**Security Considerations**:
- Store OAuth tokens encrypted in Firestore
- Rate limiting for MCP tool calls
- Audit logging for all external integrations

**Status**: `@modelcontextprotocol/sdk` installed but unused. **Full implementation required**.

---

### 2.5 Manual Message Editing & Retry (CRITICAL - NOT IMPLEMENTED)

**User Requirements**:
- **Edit user messages**: Click message bubble → edit text → resend
- **Retry user messages**: Resend last user message with same content
- **Stop generation**: Cancel agent response mid-stream
- **Retry agent response**: Regenerate last agent response

**UI Components Needed**:
1. Message bubble action menu (edit, retry, delete)
2. Stop generation button during streaming
3. Retry button on agent messages
4. Edit mode for user messages (inline or modal)

**Implementation Complexity**: Medium (requires state management for message editing/deletion)

**Location**: `components/message-bubble.tsx`, `components/chat-interface.tsx`

**Status**: **Not implemented**. Add to beta roadmap.

---

## 3. Architectural Evaluations

### 3.1 Agent Routing with Semantic/Entity Extraction

**Current Approach**:
- `IntelligentIntentRouter` classifies intent using GenAI
- `EntityExtractionEngine` extracts clinical entities
- Confidence threshold: 0.8 for agent selection

**Evaluation Questions**:
1. Is semantic/entity extraction adding value or unnecessary complexity?
2. Can modern LLMs (Gemini 3.x) route themselves without pre-classification?
3. Is entity extraction used effectively downstream?

**Analysis**:

**Pros of Current Approach**:
- Explainable routing decisions (confidence scores)
- Entity extraction feeds into pattern analysis
- Separation of concerns (routing vs. response generation)

**Cons of Current Approach**:
- Additional GenAI call adds latency (~200-500ms)
- Token cost for classification
- Complexity in maintaining intent classification prompts
- May be redundant if agent system prompts are well-designed

**Recommendation**:
- **Keep intent routing** for agent selection (low complexity, high value)
- **Evaluate entity extraction**: Measure if extracted entities are used in pattern analysis or Ficha generation
- **If not used effectively**: Remove entity extraction to reduce latency/cost
- **Alternative**: Let primary agent decide if it needs to delegate (meta-agent pattern)

**Action**: Run A/B test comparing:
- Current: Pre-classification + agent
- Alternative: Direct to Gemini with multi-agent system prompt

**Decision Deadline**: Before beta launch (affects response latency SLA)

---

### 3.2 Socratic Tools Design

**Current Approach**:
- Predefined Function Calling tools in `tool-registry.ts`:
  - `formulate_clarifying_question`
  - `identify_core_emotion`
  - `detect_pattern`
  - `generate_validating_statement`
  - `reframe_perspective`
  - `propose_behavioral_experiment`

**Evaluation Questions**:
1. Are these tools too rigid for diverse clinical scenarios?
2. Do they constrain the agent's therapeutic flexibility?
3. Are there better frameworks for therapeutic questioning?

**Analysis**:

**Current Tool Limitations**:
- Tools are **response templates**, not true therapeutic frameworks
- Don't adapt to conversation context or patient personality
- May force agent into predefined patterns
- Limited coverage of therapeutic modalities (CBT-focused)

**Alternative Approaches**:

**Option A: Therapeutic Framework Tools**
- Implement tools for **creating clinical documents** (treatment plans, progress notes, safety plans)
- Tools for **evidence-based interventions** (CBT worksheets, mindfulness exercises, DBT skills)
- More actionable outputs for psychologists

**Option B: Meta-Cognitive Tools**
- `assess_therapeutic_alliance` (monitor rapport)
- `evaluate_intervention_effectiveness` (track progress)
- `identify_transference_patterns` (psychodynamic insights)

**Option C: Remove Tools, Use Rich System Prompts**
- Modern LLMs may not need Function Calling for therapeutic conversations
- System prompts with therapeutic guidelines + examples may suffice
- Reserve tools for **actions** (save to Ficha, schedule appointment, email summary)

**Recommendation**:
1. **Short-term (Beta)**: Keep existing tools, add document generation tools:
   - `create_treatment_plan(goals, interventions, timeline)`
   - `generate_progress_note(session_summary, clinical_observations)`
   - `create_safety_plan(warning_signs, coping_strategies, contacts)`

2. **Medium-term (Post-Beta)**: Evaluate tool usage via Sentry metrics:
   - Track which tools are called frequently vs. ignored
   - Survey beta users on tool utility
   - Refine or remove underused tools

3. **Long-term**: Consider framework-agnostic approach where psychologist configures preferred therapeutic modality

**Action**: Add document generation tools to `tool-registry.ts` before beta.

---

### 3.3 Same Evaluation for Other Agents

**Especialista en Documentación (clinico)**:
- Current tools focused on Ficha Clínica generation
- **Recommendation**: Expand to full clinical documentation suite:
  - Treatment plans, safety plans, discharge summaries
  - Billing/insurance documentation (ICD-10 codes)
  - Inter-professional referral letters

**Investigador Académico (academico)**:
- Current tools: Academic search, DOI validation
- **Recommendation**: Add evidence synthesis tools:
  - `summarize_research_findings(query, sources)`
  - `compare_treatment_approaches(intervention_a, intervention_b)`
  - `generate_literature_review(topic, date_range)`

**General Principle**: Tools should enable **tangible outputs** (documents, plans, referrals) not just **conversational moves**.

---

## 4. Beta Launch Roadmap

### Phase 1: Critical Bug Fixes (Weeks 1-2)

**Priority 1: Patient Context Persistence**
- [ ] Fix session state persistence after each message
- [ ] Ensure patient ID propagates through entire conversation
- [ ] Implement session recovery on page reload
- [ ] Add comprehensive state debugging

**Priority 2: File Processing**
- [ ] Debug Gemini Files API integration
- [ ] Test all file formats (PDF, DOCX, PNG, JPG, TXT)
- [ ] Implement retry logic and error handling
- [ ] Add file processing status UI

**Priority 3: Ficha Clínica Updates**
- [ ] Fix state loss in Ficha updates
- [ ] Implement optimistic updates with rollback
- [ ] Add Ficha versioning

**Acceptance Criteria**:
- Patient context available on all conversation turns
- Files upload and process successfully 95%+ of attempts
- Ficha updates succeed without data loss

---

### Phase 2: Infrastructure & i18n (Weeks 3-4)

**Priority 1: Firestore Migration**
- [ ] Set up Firebase project with HIPAA BAA
- [ ] Replace `ServerStorageAdapter` with Firestore client
- [ ] Implement IndexedDB ↔ Firestore sync
- [ ] Test offline-first + conflict resolution
- [ ] Migrate existing test data

**Priority 2: Internationalization**
- [ ] Install and configure next-intl
- [ ] Extract all hardcoded strings to translation files
- [ ] Create Spanish (Chile/Argentina) and Portuguese (Brasil) locales
- [ ] Localize clinical vocabulary
- [ ] Test locale switching

**Priority 3: CI/CD Pipeline**
- [ ] Set up GitHub Actions workflows
- [ ] Configure automated testing (lint, type-check, unit tests)
- [ ] Set up Vercel preview deployments
- [ ] Implement staging environment with E2E tests

**Acceptance Criteria**:
- Firestore persistence working in production
- UI fully localized in 3 languages
- CI/CD catching bugs before production

---

### Phase 3: MCP & Manual Controls (Weeks 5-6)

**Priority 1: MCP Framework**
- [ ] Implement MCP client and registry
- [ ] Build persistent memory server
- [ ] Integrate Gmail server (email summaries)
- [ ] Integrate Calendar server (appointments)
- [ ] Test OAuth2 flow and credential encryption

**Priority 2: Message Editing & Retry**
- [ ] Add edit functionality to user messages
- [ ] Implement retry for user/agent messages
- [ ] Add stop generation button
- [ ] Test state management for edits/deletions

**Priority 3: Document Generation Tools**
- [ ] Add treatment plan generation tool
- [ ] Add progress note generation tool
- [ ] Add safety plan generation tool
- [ ] Integrate with Ficha Clínica workflow

**Acceptance Criteria**:
- Gmail/Calendar integrations functional
- Users can edit/retry messages smoothly
- Clinical documents generated from conversations

---

### Phase 4: Evaluation & Optimization (Week 7)

**Agent Routing Evaluation**:
- [ ] Run A/B test: intent routing vs. direct agent
- [ ] Measure latency, cost, routing accuracy
- [ ] Decide to keep or simplify

**Tool Usage Analysis**:
- [ ] Track Function Calling metrics in Sentry
- [ ] Survey beta users on tool utility
- [ ] Refine or remove underused tools

**Performance Optimization**:
- [ ] Optimize context window management
- [ ] Reduce API call latency
- [ ] Improve streaming response speed

**Acceptance Criteria**:
- Data-driven decision on agent routing
- Tool set refined based on usage
- Response latency < 2s (p95)

---

### Phase 5: Beta Launch Prep (Week 8)

**Testing & Validation**:
- [ ] End-to-end testing of critical flows
- [ ] Load testing (10 concurrent users)
- [ ] Security audit (OWASP Top 10)
- [ ] HIPAA compliance checklist

**Documentation**:
- [ ] User guide for beta testers
- [ ] Known issues and limitations
- [ ] Feedback collection process

**Deployment**:
- [ ] Production deployment to Vercel
- [ ] Monitoring and alerting setup
- [ ] Rollback plan

**Launch**:
- [ ] Invite beta users (Chile, Argentina, Brasil)
- [ ] Monitor usage and errors
- [ ] Rapid iteration on feedback

---

## 5. Testing Strategy (Detailed)

### 5.1 Critical Processes Requiring Test Coverage

**1. Agent Routing Pipeline**
- **Why Critical**: Wrong agent selection breaks user experience
- **Test Types**: Unit tests for `IntelligentIntentRouter`, integration tests for full routing flow
- **Coverage Target**: 90%+

**2. File Processing Pipeline**
- **Why Critical**: Core feature for clinical documentation
- **Test Types**: Integration tests with mock Gemini Files API, E2E tests with real files
- **Coverage Target**: 85%+

**3. Patient Context Retrieval**
- **Why Critical**: Determines quality of clinical responses
- **Test Types**: Integration tests for `buildPatientContext()`, E2E tests for multi-turn conversations
- **Coverage Target**: 90%+

**4. Ficha Clínica Generation**
- **Why Critical**: Legal documentation requirement
- **Test Types**: Integration tests for `ClinicalTaskOrchestrator`, snapshot tests for output format
- **Coverage Target**: 95%+

**5. Storage Sync (IndexedDB ↔ Firestore)**
- **Why Critical**: Data integrity and offline capability
- **Test Types**: Integration tests for sync logic, E2E tests for offline scenarios
- **Coverage Target**: 90%+

### 5.2 CI/CD Pipeline Design

**Pre-Merge Checks** (GitHub Actions):
```yaml
name: Pre-Merge Validation
on: [pull_request]
jobs:
  lint-and-type:
    - npm run lint
    - tsc --noEmit
  unit-tests:
    - npm run test
  security-scan:
    - npm audit
    - npm run verify:security
```

**Staging Deployment** (Vercel):
```yaml
name: Deploy to Staging
on: [push to main]
jobs:
  deploy:
    - Deploy to Vercel preview
    - Run E2E tests against preview URL
    - Notify team in Slack
```

**Production Deployment** (Manual Approval):
```yaml
name: Deploy to Production
on: [workflow_dispatch]
jobs:
  deploy:
    - Require manual approval
    - Deploy to Vercel production
    - Run smoke tests
    - Monitor Sentry for errors
```

---

## 6. Technical Debt & Refactoring

### 6.1 Immediate Refactoring (Pre-Beta)

**1. Remove `ignoreBuildErrors` and `ignoreDuringBuilds`**
- **Risk**: Broken code deploying to production
- **Action**: Set both to `false` in `next.config.mjs`
- **Impact**: Will surface hidden TypeScript/ESLint errors that must be fixed

**2. Resolve OpenSSL Legacy Provider**
- **Risk**: Security vulnerability, blocks dependency updates
- **Action**: Identify dependency requiring legacy provider, update or replace
- **Impact**: Cleaner build process, better security posture

**3. Complete Dynamic Orchestration Migration**
- **Current**: 75% on new system, 25% on legacy
- **Action**: Migrate remaining 25% to `DynamicOrchestrator`
- **Impact**: Simplify codebase, remove legacy code paths

**4. Consolidate Markdown Parsers**
- **Current**: 3 different parsers (markdown-it, streamdown, incremental)
- **Action**: Standardize on one parser (recommend: unified + remark/rehype)
- **Impact**: Reduce bundle size, simplify maintenance

### 6.2 Post-Beta Refactoring

**1. Remove Unused Dependencies**
- Audit and remove: `@supabase/supabase-js` (if not using), `resend` (if not using)
- **Impact**: Smaller bundle size, faster installs

**2. Implement Code Splitting**
- Lazy load Radix UI components
- Split agent code into separate bundles
- **Impact**: Faster initial page load

**3. Add Service Worker**
- Offline capability for critical features
- Background sync for Firestore updates
- **Impact**: Better offline experience

---

## 7. HIPAA Compliance Checklist

### 7.1 Technical Safeguards

- [ ] **Encryption at Rest**: Firestore encryption enabled (default)
- [ ] **Encryption in Transit**: HTTPS/TLS for all connections (Vercel default)
- [ ] **Access Controls**: Firebase Security Rules limit data access to authenticated users
- [ ] **Audit Logging**: Comprehensive logging of all data access (implement in Firestore triggers)
- [ ] **Business Associate Agreement**: Signed BAA with Google Cloud
- [ ] **Data Backup**: Automated Firestore backups configured
- [ ] **Breach Notification**: Incident response plan documented

### 7.2 Administrative Safeguards

- [ ] **Risk Assessment**: Complete HIPAA risk assessment
- [ ] **Privacy Policy**: Updated for beta launch
- [ ] **User Training**: Guide for psychologists on HIPAA compliance
- [ ] **Minimum Necessary Standard**: Only collect/store required data

### 7.3 Implementation Notes

**Firebase Security Rules Example**:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Only authenticated users can access their own data
    match /patients/{patientId} {
      allow read, write: if request.auth != null
        && request.auth.uid == resource.data.userId;
    }

    // Admin-only access to audit logs
    match /audit_logs/{logId} {
      allow read: if request.auth.token.admin == true;
      allow write: if false; // Logs are append-only via server
    }
  }
}
```

---

## 8. Success Metrics for Beta

### 8.1 Technical Metrics

- **Uptime**: 99.5%+ (excludes planned maintenance)
- **Response Latency (p95)**: < 2 seconds for agent responses
- **Error Rate**: < 1% of requests result in errors
- **File Processing Success**: 95%+ of uploads succeed
- **Data Loss Incidents**: 0 (critical priority)

### 8.2 User Engagement Metrics

- **Active Beta Users**: 10-20 psychologists
- **Sessions per User per Week**: 5+ (daily usage)
- **Conversation Turns per Session**: 10+ (deep engagement)
- **Feature Adoption**:
  - File uploads: 50%+ of users
  - Ficha Clínica generation: 80%+ of users
  - MCP integrations: 30%+ of users

### 8.3 Quality Metrics

- **User Satisfaction (NPS)**: 40+ (promoters - detractors)
- **Clinical Accuracy**: Psychologist review of agent responses (qualitative)
- **Bug Reports per User**: < 2 per week (stable experience)

---

## 9. Risk Register

### High-Impact Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Firestore migration breaks existing data** | High | Medium | Comprehensive testing, gradual rollout, rollback plan |
| **HIPAA compliance gaps discovered** | High | Low | Pre-launch audit, legal review, BAA with Google |
| **File processing remains broken** | High | Medium | Dedicated sprint, escalate to Google support if needed |
| **Patient context loss unfixable** | High | Low | Deep debugging, architectural redesign if necessary |
| **i18n increases complexity significantly** | Medium | Medium | Use established library, limit initial scope |
| **MCP integrations delayed** | Medium | High | Start early, deprioritize if blocking launch |

### Medium-Impact Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Agent routing evaluation inconclusive** | Medium | Medium | Launch with current approach, iterate post-beta |
| **CI/CD setup delays feature work** | Medium | Low | Parallelize, use GitHub Actions templates |
| **Beta users don't provide feedback** | Medium | Medium | Proactive outreach, incentivize participation |

---

## 10. Open Questions for Leadership

1. **Firestore Budget**: What is the monthly budget for Firestore operations? (Critical for pricing tier selection)

2. **Google Workspace Integration**: Do target psychologists use Gmail/Google Calendar, or should we support other providers (Outlook, Apple)?

3. **Data Residency**: Does Brasil require data to be stored in-country? (May affect Firebase region selection)

4. **Beta User Recruitment**: How will we recruit 10-20 psychologists in Chile, Argentina, Brasil?

5. **Pricing Model**: Is beta free? If paid, what is the pricing structure?

6. **Support Model**: What level of support will beta users receive? (Email, chat, phone?)

7. **Timeline Flexibility**: Is 8-week roadmap realistic given team size? Can we extend or prioritize differently?

8. **Entity Extraction**: Should we keep or remove? (Needs technical evaluation + business decision on latency tolerance)

9. **Socratic Tools**: Should we invest in refining current tools or pivot to document generation? (Needs user research)

10. **Post-Beta Plan**: What are success criteria for graduating from beta? What features unlock general availability?

---

## 11. Recommended Immediate Actions

**This Week** (Week 0):
1. ✅ Update CLAUDE.md with strategic clarifications
2. ✅ Create this STRATEGIC_PRIORITIES.md document
3. ⏳ Set up Firebase project with HIPAA BAA (DevOps/CTO)
4. ⏳ Fix patient context persistence bug (Senior Engineer)
5. ⏳ Debug file processing pipeline (Senior Engineer)

**Next Week** (Week 1):
1. ⏳ Deploy CI/CD pipeline (DevOps)
2. ⏳ Begin Firestore migration (Backend Team)
3. ⏳ Start i18n implementation (Frontend Team)
4. ⏳ Add E2E tests for critical flows (QA/Engineers)

**Week 2**:
1. ⏳ Complete critical bug fixes
2. ⏳ Continue Firestore migration
3. ⏳ Complete i18n for Spanish (Chile)
4. ⏳ Begin MCP framework implementation

**Weeks 3-8**: Follow roadmap in Section 4.

---

## 12. Conclusion

AuroraPro has strong architectural foundations but requires focused execution on critical bugs, infrastructure migration, and feature completions to reach beta readiness. The 8-week roadmap is ambitious but achievable with dedicated engineering resources and clear prioritization.

**Key Success Factors**:
1. Fix patient context persistence and file processing **first** (everything else depends on these)
2. Parallel track Firestore migration and i18n (independent work streams)
3. Set up CI/CD **early** to prevent regressions
4. Maintain weekly sprint reviews to adapt roadmap based on progress
5. Engage beta users early and often for feedback

**Next Steps**:
1. Review this document with leadership team
2. Answer open questions in Section 10
3. Assign engineering resources to Phase 1 priorities
4. Kick off Week 1 tasks immediately

---

**Document Owner**: CTO/Product Lead
**Review Cadence**: Weekly during beta prep, monthly post-launch
**Approval Required**: CEO, CTO before implementation begins

*End of STRATEGIC_PRIORITIES.md*
