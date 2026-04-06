## Workflow Orchestration

### 1. Default Planning Mode
- Enter planning mode for ANY non-trivial task (more than 3 steps or architectural decisions).
- If something goes wrong, STOP and re-plan immediately; do not keep forcing it.
- Use planning mode for verification steps, not just for construction.
- Write detailed specifications in advance to reduce ambiguity.

### 2. Sub-agent Strategy
- Use sub-agents frequently to keep the main context window clean.
- Delegate research, exploration, and parallel analysis to sub-agents.
- For complex problems, dedicate more computing power through sub-agents.
- One task per sub-agent for focused execution.

### 3. Self-Improvement Loop
- After ANY user correction: update `tasks/lessons.md` with the pattern.
- Write rules for yourself that avoid the same error.
- Iterate relentlessly on these lessons until the error rate decreases.
- Review lessons at the start of the session for the corresponding project.

### 4. Verification Before Finishing
- Never mark a task as completed without demonstrating that it works.
- Compare the difference (diff) in behavior between the main branch and your changes when relevant.
- Ask yourself: "Would a Staff Engineer approve this?"
- Run tests, check logs, and demonstrate the code's correctness.

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask, "Is there a more elegant way?"
- If a fix seems like a hack: "Knowing everything I know now, implement the elegant solution."
- Skip this for simple and obvious fixes; do not over-engineer.
- Question your own work before presenting it.

### 6. Autonomous Error Correction
- When you receive an error report: just fix it. Don't ask to be handheld.
- Identify logs, errors, or failing tests and then resolve them.
- Zero need for context switching from the user.
- Go fix failing CI tests without being told how.

## Task Management

1. **Plan First**: Write the plan in `tasks/todo.md` with verifiable items.
2. **Verify Plan**: Confirm before starting implementation.
3. **Track Progress**: Mark items as completed as you progress.
4. **Explain Changes**: High-level summary at each step.
5. **Document Results**: Add a review section to `tasks/todo.md`.
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections.

## Fundamental Principles

- **Simplicity First**: Make each change as simple as possible. Affect the minimum necessary code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimum Impact**: Changes should only touch what is necessary. Avoid introducing errors.