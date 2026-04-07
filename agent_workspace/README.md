# Agent Workspace

Operational workspace for the AI Systems Architect agent working on Aurora optimization.

## Structure

```
agent_workspace/
  analysis/           Codebase analysis artifacts and system maps
  optimizations/      Granular optimization specs by domain
    lib-decomposition/  Plans for breaking up large lib/ files
  decision-log/       ADR-style decision records (numbered: 001-xxx.md)
```

## Conventions

- **Decisions**: Named `NNN-chose-X-over-Y.md` with context, options, and rationale
- **Reference baseline**: `docs/architecture/claude/claude-code-main/`

## Reference

All architectural decisions cross-referenced against:
`docs/architecture/claude/claude-code-main/` (Claude Code source)
