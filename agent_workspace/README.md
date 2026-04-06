# Agent Workspace

Operational workspace for the AI Systems Architect agent working on Aurora optimization.

## Structure

```
agent_workspace/
  analysis/           Codebase analysis artifacts and system maps
    gap-analysis/     Delta tracking: Aurora vs claude-code reference
  proposals/          RFC-style architectural proposals (numbered: 001-xxx.md)
  optimizations/      Granular optimization specs by domain
    lib-decomposition/  Plans for breaking up large lib/ files
    performance/        Performance optimization specs
    security/           Security hardening specs
  benchmarks/         Before/after measurements
    baseline/           Current state metrics
    results/            Post-optimization metrics
  decision-log/       ADR-style decision records (numbered: 001-xxx.md)
```

## Conventions

- **Proposals**: Named `NNN-short-title.md` (e.g., `001-agent-router-refactor.md`)
- **Decisions**: Named `NNN-chose-X-over-Y.md` with context, options, and rationale
- **Benchmarks**: Include timestamp, methodology, and raw data
- **Reference baseline**: `docs/architecture/claude/claude-code-main/`

## Reference

All architectural decisions cross-referenced against:
`docs/architecture/claude/claude-code-main/` (Claude Code source)
