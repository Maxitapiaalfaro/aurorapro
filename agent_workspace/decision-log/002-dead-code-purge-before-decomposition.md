# ADR-002: Insert Dead Code Purge Before Orchestration Decomposition

**Date**: 2026-04-06
**Status**: Accepted
**Context**: Cross-agent analysis synthesis (orchestration-bottleneck-synthesis.md)

---

## Decision

**Insert P2 (orchestration dead code purge) between P1 (Firebase migration) and P3 (decomposition).**

Two independent AI agents analyzed Aurora's orchestration stack and converged on the same finding: ~2,400 lines of disabled/dead code exist across the orchestration layer. Decomposing these files without first removing dead code would mean decomposing code that should be deleted.

## Evidence

Both agents independently identified:
- `hopeai-orchestration-bridge.ts` (501 lines) — always returns `'dynamic'`, migration is 100% complete
- Bullet generation system (~600 lines) — commented out with `// DISABLED`
- Recommendations engine (~400 lines) — `enableRecommendations: false`
- User preferences learning (~315 lines) — only feeds disabled recommendations
- Edge-case forced routing (~400 lines) — `// DISABLED`, caused misrouting

## Consequences

- New P2 task: purge dead code before decomposing orchestration files
- P3–P7 renumbered from previous P2–P6
- Decomposition targets in `targets.md` should be recalculated after purge (file sizes will change)
- Bridge deletion removes 1 layer from the orchestration stack, simplifying P4 decomposition
