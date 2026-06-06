# Contributing to Sentinel

## Branch naming

| Type | Pattern | Example |
|---|---|---|
| New feature | `feat/m{N}-description` | `feat/m4-risk-scoring` |
| Bug fix | `fix/short-description` | `fix/timeline-event-ordering` |
| Documentation | `docs/short-description` | `docs/report-prompt-design` |
| Chore | `chore/short-description` | `chore/update-deps` |

## Commit style

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add cascade-prevention rate to risk scoring engine
fix: correct timezone handling in daily report generator
docs: document the supervisor's event normalization rules
chore: bump langgraph and fastapi versions
```

## Pull requests

- Every PR must reference an issue: `Closes #N` in the description
- Set the milestone (`M4`, `M5`, `M6`, `M7`) and add a type label (`orchestrator`,
  `dashboard`, `reports`, `ai`, `ci`) at creation time
- Keep PRs focused — one issue per PR where possible

## Labels

- `orchestrator` — LangGraph supervisor, event normalization, fleet risk scoring
- `dashboard` — React + TS + Vite + Tailwind master command-center UI
- `reports` — daily report generator and insights
- `ai` — Claude reasoning and report narration
- `ci` — CI/CD pipeline

Milestones (`M4`/`M5` for Sentinel's own build, plus `M6`/`M7` for cross-platform
integration and polish) track which phase an issue belongs to — see the
[milestones page](https://github.com/CodeBuildder/sentinel/milestones).

## Dashboard design rules

Dark command-center aesthetic, not generic AI/SaaS: monospace accents, neon-on-near-black,
dense real-time panels, live WebSocket updates, force-directed graph visualizations,
sparklines. Think SOC/NOC wall display, self-explanatory at a glance.
