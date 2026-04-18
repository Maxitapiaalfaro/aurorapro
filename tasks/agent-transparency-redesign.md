# Aurora Agent Transparency Surface — Consolidated Critique & State-of-the-Art Redesign

> Collaborative output from **UX**, **UI**, and **AIExpert** subagents. This document supersedes the individual critiques and is the working spec for redesign.

**Components reviewed**

- [components/agentic-transparency-flow.tsx](../components/agentic-transparency-flow.tsx)
- [components/execution-timeline.tsx](../components/execution-timeline.tsx)
- [components/cognitive-transparency-panel.tsx](../components/cognitive-transparency-panel.tsx)
- [lib/humanized-steps.ts](../lib/humanized-steps.ts)
- [config/agent-visual-config.ts](../config/agent-visual-config.ts)
- [types/clinical-types.ts](../types/clinical-types.ts), [types/operational-metadata.ts](../types/operational-metadata.ts)

---

## 1. Convergent diagnosis (where all three agents agree)

| # | Finding | Severity |
|---|---|---|
| **D1** | **Three competing surfaces** for the same underlying state (`AgenticTransparencyFlow` ⊕ `ExecutionTimeline` ⊕ `CognitiveTransparencyPanel`) with three vocabularies ("pasos" / "herramientas" / "comprobaciones"), three collapse models, and two icon libraries. State divergence is inevitable. | **Critical** — trust killer |
| **D2** | **The Aurora facet palette never reaches the live surface.** Spinner, active-row tint and progress bar are hard-coded `clarity-blue-500` regardless of which agent is running. Perspectiva/Memoria/Evidencia identity is decorative. | High |
| **D3** | **Type scale floor is too low for clinical use.** `text-[8px]` / `[9px]` / `[10px]` with `text-muted-foreground/25..40` opacity routinely fail WCAG 1.4.3 — especially on tablets in clinic lighting. | High |
| **D4** | **No claim → citation mapping.** Sources render as a flat list buried 3 clicks deep at 8–9 px. There is no bidirectional link between a sentence in the answer and the source/step that produced it. This is the single biggest missing trust signal for clinical defensibility. | **Critical** — clinical defensibility |
| **D5** | **Routing is opaque and uncontestable.** The structured `RoutingDecision` (RoutingReason enum, metadata_factors, edge-case flags) is dropped on the floor. A `CRITICAL_RISK_OVERRIDE` looks identical to a `HIGH_CONFIDENCE_CLASSIFICATION` in the UI. Clinician cannot reroute. | **Critical** — safety |
| **D6** | **Checkpoint card is not in the timeline.** `CheckpointRequest` exists in types but is **not** in the SSE union; lives as an out-of-band modal. Audit trail breaks: the message has no record that a human approved a write. | **Critical** — HIPAA/Ley 19.628 audit |
| **D7** | **Failure modes are flattened.** Single `error` status; no `retry`, `fallback`, `partial`, `timeout`, `rejected_by_policy`. A degraded run is rendered with a green check. | High |
| **D8** | **`ps_model_call → "Aurora está reflexionando…"` is dishonest.** Emitted unconditionally even when no reasoning occurred. There is no `thinking_delta` event in the SSE stream. `ReasoningBullet` is a synthetic ticker that contaminates trust in the real signals. | High |
| **D9** | **Auto-collapse on completion fights the user.** [agentic-transparency-flow.tsx#L570](../components/agentic-transparency-flow.tsx#L570) yanks the detail closed the moment a step completes — exactly when the clinician is reading it to decide whether to trust the result. | Medium |
| **D10** | **`ElapsedTimer` lies.** Binds to mount time, not step start time → resets to "0s" on remount, masking real long-runners. | Medium |
| **D11** | **No PHI-scope distinction.** `get_patient_record` and `search_academic_literature` render identically. The clinician cannot tell at a glance which steps touched patient data. | Medium |
| **D12** | **Progress bar as theater.** [`calculateProgress()`](../lib/humanized-steps.ts#L224) gives active steps a flat 0.5 weight — advances during stalls. Misleading in a live session. | Medium |

---

## 2. State-of-the-art benchmark — what Aurora is missing

Synthesized from leading clinical-and-agentic UIs (Glass Health, Abridge, OpenEvidence, Devin, Cursor, Claude Code, Perplexity Pro, Operator):

| # | Pattern | Reference | What Aurora must adopt |
|---|---|---|---|
| **P1** | **Plan-then-execute preamble** | Devin, Claude Code | Emit explicit plan event at turn start: *"Voy a revisar la ficha de María, sus memorias, y buscar evidencia."* Step list reconciles against the plan. |
| **P2** | **Claim-level provenance anchoring** | Glass Health, OpenEvidence | Inline `[1,3]` markers on the streamed answer that hover-highlight the grounded span and scroll the trail to the source card. Bidirectional. |
| **P3** | **Streamed thought trace (summary + on-demand full)** | Claude extended thinking, Perplexity Pro | Real `thinking_delta` events emitted **only** when `thinkingConfig` is enabled, with a `level` indicator. Otherwise label honestly: "Redactando respuesta". |
| **P4** | **First-class action-stream sub-states** | Operator, Computer Use | Dedicated events: `retry`, `fallback`, `partial`, `timeout`, `rejected_by_policy`. Amber visual state, distinct from red error. |
| **P5** | **PHI-scope labeling** | Abridge, Nuance DAX | Per-step `scope: 'phi' \| 'literature' \| 'system'` badge. Patient-data reads are unmissable. |
| **P6** | **Contestable routing** | Cursor agent panel | "¿Por qué Evidencia?" chip exposing `RoutingReason` enum, factors, and runner-up alternatives. "Cambiar especialista" affordance. |
| **P7** | **Source-grade signal** | Glass, OpenEvidence | Per-source badges: `revisada` / `guía` (e.g. MINSAL) / `gris`; recency decay; `validationStatus` with rejection reasons surfaced. |
| **P8** | **Working → resolved transition as a discrete event** | Linear, Vercel v0 | A single "Completado · 3.2s · 7 fuentes" row replaces the live rail. No ambiguous limbo state. |
| **P9** | **Inline checkpoint as audit row** | Devin, GitHub Copilot agent | Checkpoint becomes a permanent timeline node with actor + timestamp; survives reload. |
| **P10** | **Redaction-aware transparency** | regulated-domain norm | Distinguish "not emitted" from "emitted-then-redacted (PHI)". |

---

## 3. Architectural decision

**Keep one. Retire two.**

- **Keep:** `AgenticTransparencyFlow` (it's the only one with `LayoutGroup`, `useReducedMotion`, parallel batching, sticky expand, Stop affordance).
- **Retire:** `ExecutionTimeline` — strict subset, worse animation, no a11y on the expand button, no parallel grouping. Its only unique feature (bordered card per step) is a regression.
- **Retire / merge into Flow:** `CognitiveTransparencyPanel`. Its **PhaseStrip** (intent → routing → executing) is the one missing piece worth porting. Everything else duplicates Flow.

**Replacement:** `<AgentExecutionSurface>` — a thin composition shell consumed everywhere the three components are consumed today.

```tsx
<AgentExecutionSurface
  state="live" | "resolved" | "failed" | "awaiting-checkpoint" | "cancelled"
  timeline={ExecutionTimeline}            // canonical data source
  routing?={RoutingDecision}              // drives "¿Por qué este especialista?" chip
  thinking?={ThinkingTrace}               // optional, only when thinkingConfig enabled
  defaultCollapsed?
  density="comfortable" | "compact"       // clinical default = comfortable
  onCancel?()
  onCheckpointApprove?(id)
  onCheckpointReject?(id)
  onRouteOverride?(agent)                 // P6
  onCitationFocus?(sourceId)              // P2
/>
```

**Internal subcomponents**

- `<PhaseStrip>` — intent → routing → executing (ex-Cognitive panel header).
- `<ProgressRail>` — 2 px, **agent-colored** (fixes D2), driven by *plan denominator* (fixes D12), shimmer when no plan.
- `<RoutingChip>` — shows reason enum + factors + alternatives + override (P6).
- `<StepItem>` / `<ParallelGroup>` — current Flow internals, plus `scope` badge (P5), honest `ElapsedTimer` (fixes D10).
- `<CheckpointBanner>` — amber rail + inline diff + CTA (P9, fixes D6).
- `<SourcesChipRow>` — extracted to render in **the bubble footer**, not inside the timeline (P2, fixes D4). Aggregate `• 7 fuentes validadas` stays in the timeline.
- `<ResolvedHeader>` — collapsed final state (P8).

**State machine**

```
            ┌─────── live ───────┐
   start ──▶│ progress, elapsed, │── onComplete ───▶ resolved
            │ step fan-out       │── onError ──────▶ failed
            │                    │── onCancel ─────▶ cancelled
            │                    │── onGate ───────▶ awaiting-checkpoint
            └─────────┬──────────┘                       │
                      ▲                  onApprove │ onReject
                      └────────────────────────────┘
```

---

## 4. Event-vocabulary contract (backend ⇄ UI)

The current SSE union (`bullet | agent_selected | tool_execution | processing_step | chunk | document_preview | document_ready | response | error | complete`) cannot carry the proposed surface. The minimum new vocabulary:

```ts
// Turn lifecycle
TurnStartedEvent       { turnId, startedAt, userMessageId }
PlanEvent              { turnId, plannedSteps: [{id, kind, label}] }       // P1, fixes D12
TurnCompletedEvent     { turnId, durationMs, outcome, summary }            // P8

// Routing (replaces today's free-text reasoning)
RoutingDecisionEvent   { turnId, decision: RoutingDecision,                // P6, fixes D5
                         alternatives: [{agent, confidence}],
                         contestable: boolean }

// Thinking — emitted only when thinkingConfig is on
ThinkingStartedEvent   { turnId, stepId, model, level }                    // P3, fixes D8
ThinkingDeltaEvent     { turnId, stepId, delta, isSummary }
ThinkingCompletedEvent { turnId, stepId, durationMs, tokenCount }

// Tool execution (extends current ToolExecutionEvent)
ToolLifecycleEvent     { turnId, tool: { …, status:
                         'planned'|'started'|'progress'|'retry'|'fallback'
                       | 'partial'|'completed'|'timeout'|'error'
                       | 'rejected_by_policy',
                         attempt, maxAttempts, parallelGroupId,
                         scope: 'phi'|'literature'|'system',                // P5, fixes D11
                         result: { sourcesFound, sourcesAccepted,
                                   sourcesRejected: [{id, reason}] } } }   // D7, P7

// Provenance
SourceValidatedEvent   { turnId, source: AcademicSourceReference & {       // P7
                         validationStatus, relevanceScore,
                         rejectionReason?, fromToolId } }
CitationSpanEvent      { turnId, claimId, sourceIds, startOffset, endOffset } // P2, fixes D4

// Checkpoint
CheckpointRequestedEvent { turnId, checkpoint: CheckpointRequest }         // P9, fixes D6
CheckpointResolvedEvent  { turnId, checkpointId, resolution, actorId,
                           resolvedAt }

// Non-fatal warnings (drives amber UI, not red)
NonFatalWarningEvent   { turnId, code, message, affectedStepId? }          // P4, fixes D7
```

**CI invariant:** every SSE event type and every `RoutingReason` enum value must map to a humanized label in [lib/humanized-steps.ts](../lib/humanized-steps.ts). A typed registry + unit test prevents label drift.

---

## 5. Visual prototype — the unified surface

Renders **above the bubble body**, sharing the agent avatar's left edge. Tokens annotated in `⟨…⟩`.

### State A — `live`

```
 ┌─ ⟨rail 2px · agentConfig.typingDotColor⟩ ──────────────────────────────────┐
 │ ▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱  ⟨ProgressRail width = completed/planned⟩              │
 ├────────────────────────────────────────────────────────────────────────────┤
 │ ◉ Evidencia · sobre TEPT complejo en adolescentes      ⟳ 00:08    [■ Detener] │
 │   ⟨fs-agent-meta 11px · agentConfig.textColor⟩                              │
 │   [¿Por qué Evidencia? · 92% · NORMAL_CLASSIFICATION]   ← RoutingChip (P6)  │
 ├────────────────────────────────────────────────────────────────────────────┤
 │ Plan: razonamiento → 3 búsquedas paralelas → validación → síntesis         │
 ├────────────────────────────────────────────────────────────────────────────┤
 │ ✓ ✎  Razonando (medium · 812 tok)                                  0.6s    │
 │                                                                            │
 │ ┌─ 3 búsquedas paralelas   ▰▰▱  ⟨2/3 · agent color⟩  ──────────────────┐  │
 │ │ ✓ 📚 PubMed     "EMDR adolescentes TEPT complejo"            3.1s · 5 │  │
 │ │ ✓ 📚 Cochrane   "EMDR complex PTSD youth outcomes"           2.8s · 4 │  │
 │ │ ⟳ 📚 PsycINFO   "eye movement desensitization teenagers"     4.6s     │  │
 │ │   ⚠ reintento (timeout, intento 2/3)         ← amber, not red (P4)    │  │
 │ └───────────────────────────────────────────────────────────────────────┘  │
 │                                                                            │
 │ ○ ✎  Validando 12 fuentes…                                                 │
 │ ○ ✎  Sintetizando respuesta                                                │
 └────────────────────────────────────────────────────────────────────────────┘
   role="status" · aria-live="polite" · aria-busy="true"
```

### State B — `resolved-collapsed` (history default)

```
 ┌─ ⟨rail 2px · agentConfig/60⟩ ──────────────────────────────────────────────┐
 │ ◉ Evidencia · TEPT complejo en adolescentes · 7/12 fuentes · 14:32   [▸]   │
 └────────────────────────────────────────────────────────────────────────────┘
```

One line. **Faceta name leads. Clinical subject second. Signal-ratio third (not bare 7). Timestamp fourth.** No "4.2s" noise. Hover tooltip exposes duration for the curious.

### State C — `resolved-expanded` (clinician investigating)

```
 ┌─ ⟨rail 2px · agentConfig/60⟩ ──────────────────────────────────────────────┐
 │ ◉ Evidencia · TEPT complejo en adolescentes · 14:32       [▾] [📋 copiar]  │
 │   [¿Por qué Evidencia? · 92% · NORMAL_CLASSIFICATION  · alternativas: P 7%, M 1%] │
 ├────────────────────────────────────────────────────────────────────────────┤
 │ Plan ejecutado (4/4)                                                       │
 │  1. Razonamiento (medium, 812 tok)                                         │
 │  2. Búsquedas paralelas — 12 fuentes encontradas                           │
 │  3. Validación — 7 aceptadas · 5 descartadas                               │
 │  4. Síntesis con anclaje de citas                                          │
 ├────────────────────────────────────────────────────────────────────────────┤
 │ ✓ ✎  Razonando (medium)                                            0.6s [▾]│
 │     [ver resumen del razonamiento]    ← P3                                 │
 │                                                                            │
 │ ✓ 📚 3 búsquedas paralelas                                          4.6s   │
 │   ├ PubMed     · 3.1s · 5 ✓                                                │
 │   ├ Cochrane   · 2.8s · 4 ✓                                                │
 │   └ PsycINFO   · 4.6s · 3 ✓ ⚠ 1 reintento                                  │
 │                                                                            │
 │ ✓ 📚 Validación · 7 aceptadas · 5 descartadas                       2.2s   │
 │   ▾ Descartadas (5)                                                        │
 │     · Shapiro (1989) — antigüedad >20 años                                 │
 │     · Lee & Cuijpers (2013) — meta-análisis de adultos, no adolescentes    │
 │     · de Roos (2011) — muestra n<10                                        │
 │     · Hensley (2009) — tesis no arbitrada                                  │
 │     · Perkins (2023) — paywalled, no se pudo verificar metodología         │
 │                                                                            │
 │ ✓ ⚠ Confirmaste guardar observación sobre adolescente   14:31              │
 │     ⟨inline checkpoint audit row · P9⟩                                     │
 │                                                                            │
 │ ✓ ✎  Síntesis                                                       0.4s   │
 ├────────────────────────────────────────────────────────────────────────────┤
 │ Auditoría:  turnId t_01HX… · 10.2s · sin overrides de seguridad            │
 └────────────────────────────────────────────────────────────────────────────┘

  Chip row — rendered by caller in bubble footer (NOT inside surface):
   ① de Roos 2017 (Cochrane)  ② Diehle 2015 (JCPP)  ③ … ⑦
   ⟨h-6 · rounded-full · bg-{agent}-100 · text-{agent}-800 · ring-1⟩

  Answer text streams with inline markers:
   "EMDR muestra eficacia moderada en TEPT complejo adolescente [1,3]…"
                                                                ↑
                     hover → highlights span + scrolls trail to source ① / ③
```

### State D — `awaiting-checkpoint` (new)

```
 ┌─ ⟨rail 2px · warning/60⟩ ──────────────────────────────────────────────────┐
 │ ◉ Memoria · ⏸ Esperando aprobación clínica          elapsed paused @ 2s   │
 ├────────────────────────────────────────────────────────────────────────────┤
 │ ⚠ Se generó un borrador de ficha. Revise antes de guardar en la historia. │
 │   [ Revisar borrador ]   [ Rechazar ]   ⟨h-9 · ≥44 on coarse pointer⟩      │
 ├────────────────────────────────────────────────────────────────────────────┤
 │ ✓ ✎  Redactando ficha SOAP                                          2.1s   │
 │ ⏸    Esperando aprobación                                                  │
 └────────────────────────────────────────────────────────────────────────────┘
   role region · aria-live="assertive" · timer paused, not reset
```

### Token contract

| Element | Token |
|---|---|
| Live rail | `agentConfig.typingDotColor` (kills hard-coded clarity-blue) |
| Resolved rail | `agentConfig.typingDotColor/60` |
| Awaiting / failed rail | `warning/60` / `destructive/60` |
| Active row tint | `agentConfig.bgColor` at `/10` (was `clarity-blue-500/[0.08]`) |
| Completed check icon | `agentConfig.textColor/70` |
| Type scale (only three) | meta `11px` · body `12px` · cap `10px uppercase tracking-wider` — **kill `text-[8px]` and `text-[9px]` everywhere** |
| Opacity floor on text | active `/70`, label `/60`, decorative metadata `/50` (never below) |
| Row min-height | `28px` comfortable · `44px` on `pointer:coarse` |
| Focus ring | `focus-visible:ring-2 focus-visible:ring-ring` on every interactive row |
| Source chip | `h-6 · px-2 · rounded-full · bg-{agent}-100 · text-{agent}-800 · ring-1 ring-{agent}-200` |
| Scope badge | 🔒 PHI = `mineral-gray` outline · 📚 literatura = `academic-plum-200` · ⚙ sistema = `ash` |
| PhaseStrip divider | `border-border/40` (was `/20`) |

---

## 6. Interaction model (canonical)

| Action | Behavior |
|---|---|
| Click collapsed summary | Expands; clinician's last expand state restored (sticky **per message**, not just per agent type) |
| Click step row | Toggles that step. **Never auto-collapses on completion** (fixes D9). |
| Click `[1,3]` in answer | Scrolls trail into view, expands owning step, highlights source `#1` and `#3` |
| Click source chip | Opens DOI resolver (preferred) or URL in new tab |
| Click 🔒 PHI badge | Tooltip: "Este paso accedió al historial de María González." Linked to audit log |
| Click "¿Por qué Evidencia?" | Popover with reason enum + factors + alternatives + "Cambiar especialista" |
| Click "Cambiar especialista" | Re-routes the turn (P6); visible audit entry: "Override manual: Evidencia → Perspectiva" |
| Stop button **and `Esc`** | Aborts SSE; trail freezes; last active step → `cancelled` (distinct state, not error) |
| Checkpoint **Aprobar / Rechazar** | Resolves inline; banner collapses to permanent audit row with timestamp + actor |
| `[📋 copiar]` | Copies the trail as markdown (clinical-record compatible), PHI-scope notes preserved |
| Tab / Enter / Arrow | Full keyboard navigation; Tab between rows, Enter expands, Arrows within sources |

---

## 7. Implementation roadmap (ranked by clinical-trust impact)

| Phase | Work | Effort | Trust impact |
|---|---|---|---|
| **0 — invariants** | Honest `ElapsedTimer` (bind to `step.startedAt`); raise type floor (kill `text-[8px]/[9px]`); raise opacity floor (`/60` minimum on active text); facet-color the spinner/rail/active-tint | S | High (D2, D3, D10) |
| **1 — converge** | Build `<AgentExecutionSurface>` shell; port PhaseStrip from Cognitive panel; delete `ExecutionTimeline` and `CognitiveTransparencyPanel`; one vocabulary, one collapse model | M | Critical (D1) |
| **2 — backend contract** | Implement the new SSE event vocabulary (Section 4); add CI invariant: every event + every `RoutingReason` has a humanized label | M | High (D5, D7, D8) |
| **3 — provenance** | `SourceValidatedEvent` with `validationStatus` / `rejectionReason`; `CitationSpanEvent`; extract `<SourcesChipRow>` to bubble footer with inline `[n]` markers | L | **Critical (D4, P2, P7)** |
| **4 — checkpoint as event** | `CheckpointRequestedEvent` / `CheckpointResolvedEvent`; render inline in trail; persist resolution in `ExecutionTimeline` | M | **Critical (D6, P9)** |
| **5 — routing transparency** | Render `RoutingChip` with full `RoutingDecision`; expose alternatives; "Cambiar especialista" override (P6) | S | Critical (D5) |
| **6 — honest reasoning** | Wire `thinkingConfig` → `ThinkingStartedEvent` / `ThinkingDeltaEvent`; relabel `ps_model_call` honestly when thinking is off; remove or re-source `ReasoningBullet` | M | High (D8, P3) |
| **7 — failure clarity** | Non-fatal warning events (retry/fallback/partial/timeout); amber visual state; resolved variants `cancelled` ≠ `failed` | M | High (D7, P4) |
| **8 — PHI scope** | `scope` field on tool events; render badge; tooltip linked to audit log | S | Medium (D11, P5) |
| **9 — plan denominator** | `PlanEvent` at turn start; progress rail driven by `completed/planned`; shimmer when no plan | S | Medium (D12, P1) |

---

## 8. Definition of done

- One transparency component shipped (`<AgentExecutionSurface>`); the other two deleted.
- Every step is **honest**: no synthetic ticker, no fake reasoning label, no fake progress.
- Every claim in an answer can be traced — by click — to a specific accepted source and a specific tool call.
- Every routing decision carries a reason code, factors, and alternatives, and is contestable.
- Every destructive action lives in the timeline as a permanent, time-stamped, actor-attributed audit row.
- WCAG 2.1 AA: type ≥ 12 px body / 11 px meta, contrast ≥ 4.5:1 in both themes, every interactive row keyboard-reachable with visible focus, ≥ 44 px on coarse pointers.
- Reduced-motion respected on **every** animated transition (the merged surface, not just the Flow).
- A clinician cited in court could reconstruct, from a single message, what Aurora did, why, what data it touched, what evidence it used, what evidence it rejected, what it asked the human to approve, and how long it actually thought.

---

*Sources: independent critiques by [UX agent], [UI agent], and [AIExpert agent]; reconciled by orchestrator.*
