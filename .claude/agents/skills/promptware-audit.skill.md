# Skill: Promptware Audit

## Purpose

Audit and refactor AI prompts (system prompts, user prompts, agent instructions) to align with **Promptware 2026** best practices. This skill transforms generic prompts into therapeutic-grade behavioral protocols for Aurora Pro's health-tech context.

## Assigned Agent

**AI Expert Agent** - Primary user for prompt engineering and optimization.

**Architect** - For system-wide prompt governance.

## When to Use

- New AI feature development (before implementation)
- User reports AI responses feel "cold" or "robotic"
- Converting meta-reasoning prompts to behavioral protocols
- Optimizing prompts for token efficiency
- Auditing existing prompts for Promptware 2026 compliance
- After model changes (ensuring prompts work with new model)

## When NOT to Use

- Non-LLM text (UI copy, error messages)
- Prompts already audited in last 30 days
- Debugging prompt injection attacks (security-focused task)

## Inputs

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `scope` | enum | Yes | Audit scope: `all`, `file`, `prompt` | `all` |
| `filePath` | string | No | Specific file containing prompts (when scope=`file`) | `lib/ai/chat-prompt.ts` |
| `promptId` | string | No | Specific prompt identifier (when scope=`prompt`) | `system-chat-therapist` |
| `fix` | boolean | No | Auto-refactor prompts (default: false, suggest only) | `false` |
| `model` | string | No | Target model for optimization | `gemini-2.0-flash` |

## Promptware 2026 Principles

### 1. Calidez como Protocolo Conductual (Warmth as Behavioral Protocol)

**DO**: Define empathy as explicit behavioral rules
```markdown
# ❌ WRONG (Abstract)
"Be empathetic and understanding"

# ✅ CORRECT (Behavioral)
1. VALIDACIÓN-PRIMERO: Validate user input (≤1 sentence)
2. ENMARCADO COLABORATIVO: Frame as collaborative exploration
3. ESPEJO EMOCIONAL: Reflect emotions (≤10 words)
4. NOMBRAMIENTO DEL ACIERTO: Name what user did right
5. LÍMITE EMPÁTICO: Express empathy within professional boundaries
```

### 2. Eliminate Meta-Reasoning Language

**DO**: Give direct instructions, not thinking instructions
```markdown
# ❌ WRONG (Meta-reasoning)
"Think step-by-step before responding"
"Consider the user's emotional state"
"Analyze the therapeutic context"

# ✅ CORRECT (Direct)
"Follow this sequence:
1. Validate user's emotion
2. Ask clarifying question
3. Suggest next step"
```

### 3. Convert Negations to Positive Constraints

**DO**: State what TO do, not what NOT to do
```markdown
# ❌ WRONG (Negation)
"Don't make assumptions about diagnosis"
"Avoid giving medical advice"
"Never reveal private information"

# ✅ CORRECT (Positive)
"Defer diagnostic questions to the therapist"
"Provide psychoeducational information only"
"Share only information the therapist explicitly authorized"
```

### 4. Concrete Over Abstract Adjectives

**DO**: Replace fuzzy adjectives with measurable specs
```markdown
# ❌ WRONG (Abstract)
"Provide helpful suggestions"
"Be concise but thorough"
"Use professional language"

# ✅ CORRECT (Concrete)
"Suggest 1-3 evidence-based techniques (≤50 words each)"
"Responses: 2-4 sentences (max 100 words)"
"Use clinical terminology from DSM-5-TR"
```

### 5. Schema-First Tools

**DO**: Define tools with strict JSON schemas and examples
```markdown
# ❌ WRONG (Loose)
Tool: save_memory
Description: "Save important clinical information"

# ✅ CORRECT (Schema-first)
Tool: save_memory
Input Schema:
{
  "type": "object",
  "required": ["category", "content", "confidence"],
  "properties": {
    "category": { "enum": ["clinical_observation", "intervention_response", "relational_pattern", "risk_factor", "therapeutic_preference"] },
    "content": { "type": "string", "minLength": 10, "maxLength": 500 },
    "confidence": { "type": "number", "minimum": 0.0, "maximum": 1.0 }
  }
}

Example:
{
  "category": "relational_pattern",
  "content": "Patient reports conflict with mother when discussing career choices",
  "confidence": 0.85
}
```

## Steps

### 1. Identify All Prompts

**Search for prompt definitions:**
```bash
# System prompts (usually in constants or prompt files)
grep -r "systemPrompt\|systemInstruction\|SYSTEM_PROMPT" lib/ app/ --include="*.ts" --include="*.tsx" -A 20

# Agent instruction files
glob pattern=".claude/agents/*.agent.md"

# Prompt templates
grep -r "const.*Prompt.*=.*\`" lib/ app/ --include="*.ts" -A 10

# Tool definitions
grep -r "tools:\|functionDeclaration" lib/ app/ --include="*.ts" -A 30
```

**Expected patterns:**
```typescript
// System prompt
const SYSTEM_PROMPT = `
You are an AI assistant for therapists...
`

// User prompt template
function buildChatPrompt(context: ChatContext, userMessage: string): string {
  return `
${context.sessionSummary}

User: ${userMessage}

Respond with empathy and clinical insight.
  `
}

// Tool definition
const tools = [{
  name: 'save_clinical_memory',
  description: 'Save important clinical information',
  parameters: { ... }
}]
```

### 2. Parse Prompt Structure

**Extract prompt components:**
```typescript
interface PromptAnalysis {
  id: string
  file: string
  line: number
  type: 'system' | 'user' | 'tool-description' | 'agent-instruction'
  content: string
  model?: string
  violations: PromptwareViolation[]
  suggestions: PromptwareSuggestion[]
}

interface PromptwareViolation {
  principle: 'warmth' | 'meta-reasoning' | 'negation' | 'abstract' | 'schema'
  severity: 'critical' | 'high' | 'medium' | 'low'
  location: string // Line or section
  issue: string
  example: string
}
```

### 3. Audit Against Promptware 2026

**Check each principle:**

**Principle 1: Calidez como Protocolo Conductual**
```typescript
function auditWarmth(prompt: string): PromptwareViolation[] {
  const violations = []

  // Check for abstract empathy terms
  const abstractTerms = ['empathetic', 'understanding', 'compassionate', 'warm', 'supportive']
  abstractTerms.forEach(term => {
    if (new RegExp(`\\b${term}\\b`, 'i').test(prompt)) {
      violations.push({
        principle: 'warmth',
        severity: 'high',
        location: `Contains "${term}"`,
        issue: 'Abstract empathy adjective without behavioral protocol',
        example: `Replace "${term}" with explicit steps:
1. VALIDACIÓN-PRIMERO: Validate input (≤1 sentence)
2. ESPEJO EMOCIONAL: Reflect emotion (≤10 words)`
      })
    }
  })

  return violations
}
```

**Principle 2: Eliminate Meta-Reasoning**
```typescript
function auditMetaReasoning(prompt: string): PromptwareViolation[] {
  const violations = []

  const metaPatterns = [
    /think\s+(step-by-step|carefully|through)/i,
    /consider\s+(the|whether|if)/i,
    /analyze\s+(the|this|whether)/i,
    /reflect\s+on/i,
    /reasoning\s+process/i
  ]

  metaPatterns.forEach(pattern => {
    if (pattern.test(prompt)) {
      violations.push({
        principle: 'meta-reasoning',
        severity: 'critical',
        location: prompt.match(pattern)?.[0] || '',
        issue: 'Meta-reasoning instruction instead of direct protocol',
        example: 'Replace "Think step-by-step" with:\n1. [Direct step]\n2. [Direct step]\n3. [Direct step]'
      })
    }
  })

  return violations
}
```

**Principle 3: Convert Negations**
```typescript
function auditNegations(prompt: string): PromptwareViolation[] {
  const violations = []

  const negationPatterns = [
    /don't\s+/i,
    /do not\s+/i,
    /never\s+/i,
    /avoid\s+/i,
    /don't\s+/i,
    /shouldn't\s+/i
  ]

  const matches = prompt.match(new RegExp(negationPatterns.map(p => p.source).join('|'), 'gi')) || []

  if (matches.length > 0) {
    violations.push({
      principle: 'negation',
      severity: 'medium',
      location: `${matches.length} negations found`,
      issue: 'Negations instead of positive constraints',
      example: 'Convert:\n"Don\'t make assumptions" → "Verify with therapist before proceeding"\n"Avoid medical advice" → "Provide psychoeducational information only"'
    })
  }

  return violations
}
```

**Principle 4: Concrete Over Abstract**
```typescript
function auditAbstractAdjectives(prompt: string): PromptwareViolation[] {
  const violations = []

  const abstractAdjectives = [
    'helpful', 'useful', 'clear', 'concise', 'thorough', 'comprehensive',
    'appropriate', 'professional', 'accurate', 'effective', 'efficient'
  ]

  abstractAdjectives.forEach(adj => {
    if (new RegExp(`\\b${adj}\\b`, 'i').test(prompt)) {
      violations.push({
        principle: 'abstract',
        severity: 'medium',
        location: `Contains "${adj}"`,
        issue: 'Abstract adjective without measurable specification',
        example: `Replace:\n"${adj} response" → "[Concrete spec: length, format, or criteria]"\nExample: "2-4 sentences (max 100 words)"`
      })
    }
  })

  return violations
}
```

**Principle 5: Schema-First Tools**
```typescript
function auditToolSchemas(toolDef: ToolDefinition): PromptwareViolation[] {
  const violations = []

  // Check for missing schema
  if (!toolDef.parameters || Object.keys(toolDef.parameters).length === 0) {
    violations.push({
      principle: 'schema',
      severity: 'critical',
      location: `Tool: ${toolDef.name}`,
      issue: 'Missing JSON schema for tool parameters',
      example: 'Add strict schema with required fields, types, enums, and examples'
    })
  }

  // Check for missing examples
  if (!toolDef.examples || toolDef.examples.length === 0) {
    violations.push({
      principle: 'schema',
      severity: 'high',
      location: `Tool: ${toolDef.name}`,
      issue: 'Missing concrete usage examples',
      example: 'Add 1-3 examples showing valid tool calls with actual data'
    })
  }

  // Check for enum constraints
  const params = toolDef.parameters?.properties || {}
  Object.entries(params).forEach(([key, schema]) => {
    if (schema.type === 'string' && !schema.enum && !schema.pattern) {
      violations.push({
        principle: 'schema',
        severity: 'medium',
        location: `Tool: ${toolDef.name}, param: ${key}`,
        issue: 'String parameter without enum or pattern constraint',
        example: `Add enum: { "enum": ["option1", "option2"] } or pattern for validation`
      })
    }
  })

  return violations
}
```

### 4. Generate Refactoring Suggestions

**For each violation, propose fix:**

```typescript
interface PromptwareSuggestion {
  violation: PromptwareViolation
  before: string
  after: string
  improvement: string
  tokenDelta?: number // +/- tokens after refactor
}
```

**Example suggestions:**

**Warmth → Behavioral Protocol**
```markdown
BEFORE:
"Be empathetic and supportive in your responses."

AFTER:
"Follow this warmth protocol:
1. VALIDACIÓN-PRIMERO: Validate user input with 1 sentence acknowledging their perspective
2. ESPEJO EMOCIONAL: Reflect emotion in ≤10 words (e.g., 'Sounds frustrating')
3. NOMBRAMIENTO DEL ACIERTO: Name what they did right (e.g., 'Good noticing')
4. LÍMITE EMPÁTICO: Express empathy within professional boundaries (avoid overpromising)"

IMPROVEMENT: Converts abstract adjective to 4-step behavioral protocol
TOKEN DELTA: +45 tokens (but increases compliance)
```

**Meta-Reasoning → Direct Instructions**
```markdown
BEFORE:
"Think step-by-step about the therapeutic context before responding."

AFTER:
"Response sequence:
1. Reference relevant prior session (if any)
2. Validate user's emotional state
3. Suggest 1-2 evidence-based techniques
4. Ask follow-up question"

IMPROVEMENT: Eliminates meta-reasoning, defines explicit steps
TOKEN DELTA: -12 tokens (more efficient)
```

**Negations → Positive Constraints**
```markdown
BEFORE:
"Don't make assumptions about diagnosis. Avoid giving medical advice."

AFTER:
"Clinical boundaries:
- Defer diagnostic questions to therapist
- Provide psychoeducational information only (CBT techniques, coping skills)
- Reference DSM-5-TR criteria without conclusive diagnosis"

IMPROVEMENT: Converts 2 negations to 3 positive constraints
TOKEN DELTA: +8 tokens (clearer boundaries)
```

**Abstract → Concrete**
```markdown
BEFORE:
"Provide helpful suggestions in a concise manner."

AFTER:
"Suggest 1-3 evidence-based techniques:
- Each suggestion: ≤50 words
- Format: [Technique name]: [2-sentence description] [Example]
- Source: CBT, DBT, ACT, or Motivational Interviewing"

IMPROVEMENT: Replaces 2 abstract adjectives with measurable specs
TOKEN DELTA: +18 tokens (but increases output quality)
```

**Loose Tool → Schema-First**
```markdown
BEFORE:
{
  name: 'save_memory',
  description: 'Save important clinical information',
  parameters: {}
}

AFTER:
{
  name: 'save_clinical_memory',
  description: 'Save clinically relevant observation, pattern, or preference with confidence score',
  parameters: {
    type: 'object',
    required: ['category', 'content', 'confidence'],
    properties: {
      category: {
        type: 'string',
        enum: [
          'clinical_observation',
          'intervention_response',
          'relational_pattern',
          'risk_factor',
          'therapeutic_preference'
        ],
        description: 'Memory category following Aurora clinical taxonomy'
      },
      content: {
        type: 'string',
        minLength: 10,
        maxLength: 500,
        description: 'Observation content (concise, factual, no interpretation)'
      },
      confidence: {
        type: 'number',
        minimum: 0.0,
        maximum: 1.0,
        description: 'Confidence level (0.0-0.5: tentative, 0.5-0.8: likely, 0.8-1.0: strong evidence)'
      }
    }
  },
  examples: [
    {
      category: 'relational_pattern',
      content: 'Patient reports conflict with mother when discussing career choices',
      confidence: 0.85
    }
  ]
}

IMPROVEMENT: Adds strict schema with enums, constraints, and example
TOKEN DELTA: +120 tokens (but prevents tool misuse)
```

### 5. Generate Audit Report

**Report structure:**

```markdown
### Promptware 2026 Audit Report

**Scope**: {scope}
**Target**: {target}
**Timestamp**: {timestamp}

---

#### Summary

| Metric | Value |
|--------|-------|
| Prompts Audited | {totalPrompts} |
| Total Violations | {totalViolations} |
| Critical Violations | {criticalCount} |
| High Violations | {highCount} |
| Medium Violations | {mediumCount} |
| Low Violations | {lowCount} |
| Compliance Score | {compliancePercent}% |

---

#### Violations by Principle

| Principle | Count | Severity Distribution |
|-----------|-------|-----------------------|
| Calidez como Protocolo | 3 | 🔴 Critical: 0, 🟠 High: 2, 🟡 Medium: 1 |
| Eliminate Meta-Reasoning | 5 | 🔴 Critical: 3, 🟠 High: 2 |
| Convert Negations | 4 | 🟡 Medium: 4 |
| Concrete Over Abstract | 6 | 🟠 High: 2, 🟡 Medium: 4 |
| Schema-First Tools | 2 | 🔴 Critical: 1, 🟠 High: 1 |

---

#### Critical Issues (Must Fix)

1. **lib/ai/chat-prompt.ts:15** - Meta-Reasoning
   - **Issue**: "Think step-by-step before responding"
   - **Fix**: Replace with direct 4-step protocol
   - **Priority**: P0 (degrades model performance)

2. **.claude/agents/Database.agent.md:45** - Schema-First Tools
   - **Issue**: Tool `query_patient_data` has no parameter schema
   - **Fix**: Add strict JSON schema with enums and examples
   - **Priority**: P0 (tool misuse risk)

---

#### Refactoring Suggestions

**1. System Prompt: Chat Therapist (lib/ai/chat-prompt.ts)**

BEFORE (120 tokens):
```
You are an AI assistant for therapists. Be empathetic and supportive.
Think carefully about the therapeutic context before responding.
Provide helpful suggestions in a concise manner.
Don't make assumptions about diagnosis.
```

AFTER (165 tokens):
```
You are an AI assistant for therapists. Follow this protocol:

WARMTH PROTOCOL:
1. VALIDACIÓN-PRIMERO: Validate user input (≤1 sentence)
2. ESPEJO EMOCIONAL: Reflect emotion (≤10 words)
3. NOMBRAMIENTO DEL ACIERTO: Name what user did right

RESPONSE SEQUENCE:
1. Reference relevant prior session (if any)
2. Validate emotional state
3. Suggest 1-3 evidence-based techniques (≤50 words each)
4. Ask follow-up question

CLINICAL BOUNDARIES:
- Defer diagnostic questions to therapist
- Provide psychoeducational information only (CBT, DBT, ACT, MI)
- Reference DSM-5-TR criteria without conclusive diagnosis
```

IMPROVEMENTS:
- ✅ Converts empathy to 3-step behavioral protocol
- ✅ Replaces meta-reasoning with 4-step sequence
- ✅ Converts abstract "helpful" to concrete specs
- ✅ Converts negation to positive constraints

TOKEN DELTA: +45 tokens (38% increase, but 3x compliance improvement)

---

**2. Tool: save_clinical_memory (lib/ai/tools/memory-tools.ts)**

BEFORE:
```typescript
{
  name: 'save_memory',
  description: 'Save important information',
  parameters: {}
}
```

AFTER:
```typescript
{
  name: 'save_clinical_memory',
  description: 'Save clinically relevant observation with category and confidence',
  parameters: {
    type: 'object',
    required: ['category', 'content', 'confidence'],
    properties: {
      category: {
        type: 'string',
        enum: ['clinical_observation', 'intervention_response', 'relational_pattern', 'risk_factor', 'therapeutic_preference']
      },
      content: { type: 'string', minLength: 10, maxLength: 500 },
      confidence: { type: 'number', minimum: 0.0, maximum: 1.0 }
    }
  },
  examples: [{ category: 'relational_pattern', content: 'Patient reports conflict with mother when discussing career choices', confidence: 0.85 }]
}
```

IMPROVEMENTS:
- ✅ Strict schema with enums and constraints
- ✅ Concrete usage example
- ✅ Descriptive name following Aurora taxonomy

TOKEN DELTA: +120 tokens (prevents 90% of tool misuse)

---

#### Compliance Score Breakdown

| File | Before | After | Improvement |
|------|--------|-------|-------------|
| lib/ai/chat-prompt.ts | 40% | 95% | +55% |
| lib/ai/memory-extraction.ts | 60% | 90% | +30% |
| .claude/agents/Database.agent.md | 55% | 92% | +37% |

**Overall Compliance**: 52% → 92% (+40%)

---

#### Recommendations

1. **Priority 1 (P0)**: Fix all critical meta-reasoning violations (degrades model)
2. **Priority 2 (P0)**: Add schemas to all tool definitions (prevents misuse)
3. **Priority 3 (P1)**: Convert warmth adjectives to behavioral protocols
4. **Priority 4 (P2)**: Convert all negations to positive constraints
5. **Priority 5 (P2)**: Replace abstract adjectives with concrete specs

**Estimated Refactoring Time**: 2-4 hours for all prompts
**Expected Impact**: 40% compliance improvement, 20% reduction in tool errors
```

### 6. Auto-Fix (if enabled)

**When `fix: true`, apply refactorings:**

```typescript
async function applyPromptwareFixes(
  analyses: PromptAnalysis[],
  suggestions: PromptwareSuggestion[]
): Promise<{ filesModified: string[]; totalFixes: number }> {
  const filesModified = new Set<string>()

  for (const suggestion of suggestions) {
    const analysis = analyses.find(a => a.id === suggestion.violation.location)
    if (!analysis) continue

    // Read file
    const content = await readFile(analysis.file)

    // Apply fix
    const updated = content.replace(
      suggestion.before,
      suggestion.after
    )

    // Write file
    await writeFile(analysis.file, updated)
    filesModified.add(analysis.file)
  }

  return {
    filesModified: Array.from(filesModified),
    totalFixes: suggestions.length
  }
}
```

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| `promptsAudited` | number | Total prompts analyzed |
| `violations` | array | All Promptware violations found |
| `suggestions` | array | Refactoring suggestions with before/after |
| `complianceScore` | number | Overall compliance (0-100%) |
| `report` | string | Human-readable audit report |
| `filesModified` | array | Files modified (if fix=true) |

## Acceptance Criteria

- [ ] All prompts in specified scope analyzed
- [ ] Violations correctly categorized by principle and severity
- [ ] Each violation has actionable refactoring suggestion
- [ ] Before/after examples show clear improvement
- [ ] Token delta calculated for each suggestion
- [ ] Compliance score accurate (weighted by severity)
- [ ] If `fix: true`, prompts refactored correctly
- [ ] No regressions (prompts still work with target model)

## Health-Tech Specific Rules

- **Calidez Priority**: Warmth protocol is P0 for patient-facing prompts
- **Clinical Boundaries**: All prompts must defer diagnosis to therapist
- **PHI Safety**: Prompts must never request PHI in examples or tool schemas
- **Subscription Awareness**: Prompts for premium features must check tier access

## Aurora Promptware Examples

**Chat Therapist Prompt (After Audit):**
```markdown
You are Aurora's AI assistant for licensed therapists conducting psychotherapy sessions.

WARMTH PROTOCOL (apply to every response):
1. VALIDACIÓN-PRIMERO: Validate user input with 1 sentence acknowledging their perspective
2. ESPEJO EMOCIONAL: Reflect emotion in ≤10 words (e.g., "Sounds frustrating")
3. NOMBRAMIENTO DEL ACIERTO: Name what they did right (e.g., "Good noticing")
4. LÍMITE EMPÁTICO: Express empathy within professional boundaries (avoid overpromising)

RESPONSE SEQUENCE:
1. Reference relevant prior session (if any) from session summaries
2. Validate user's emotional state using ESPEJO EMOCIONAL
3. Suggest 1-3 evidence-based techniques (≤50 words each):
   - Format: [Technique name]: [2-sentence description] [Example]
   - Source: CBT, DBT, ACT, or Motivational Interviewing
4. Ask 1 open-ended follow-up question to deepen exploration

CLINICAL BOUNDARIES:
- Defer diagnostic questions to therapist ("This is a diagnostic decision for you as the therapist")
- Provide psychoeducational information only (techniques, coping skills, psychotherapy concepts)
- Reference DSM-5-TR criteria without conclusive diagnosis
- Flag risk indicators (suicidality, harm to others) with explicit tool call

TOOLS AVAILABLE:
- save_clinical_memory: Store observations, patterns, preferences (use liberally, 3-5 per session)
- search_prior_sessions: Retrieve relevant context from past sessions
- flag_clinical_risk: Alert therapist to suicide/harm risk (immediate notification)

RESPONSE FORMAT:
- Length: 2-4 sentences (max 100 words) unless complex technique explanation needed
- Tone: Professional warmth (avoid clinical jargon with patients, use with therapists)
- Language: Spanish (Mexican Spanish, formal "usted" with patients)
```

## Example Invocation

**Audit all prompts:**
```typescript
promptwareAudit({
  scope: 'all',
  fix: false
})
```

**Audit specific file:**
```typescript
promptwareAudit({
  scope: 'file',
  filePath: 'lib/ai/chat-prompt.ts',
  fix: false
})
```

**Auto-refactor specific prompt:**
```typescript
promptwareAudit({
  scope: 'prompt',
  promptId: 'system-chat-therapist',
  fix: true,
  model: 'gemini-2.0-flash'
})
```
