<!--
Sentinel — Master Orchestrator & Command Center
Copyright (c) 2026 Kaushikkumaran
Original work — see NOTICE for details
Commit history: https://github.com/CodeBuildder/sentinel/commits/main
-->

<h1 align="center">Sentinel</h1>

<p align="center">
  The master orchestrator and command-center dashboard for the Sentinel platform — a
  LangGraph supervisor that aggregates security and resilience signals, scores fleet
  risk, and produces daily intelligence reports.
</p>

<p align="center">
  <a href="https://github.com/CodeBuildder/sentinel-platform/blob/main/docs/ARCHITECTURE.md"><strong>Architecture</strong></a>
  ·
  <a href="https://github.com/CodeBuildder/sentinel/milestones"><strong>Roadmap</strong></a>
  ·
  <a href="https://github.com/CodeBuildder/sentinel-platform"><strong>Sentinel Platform</strong></a>
</p>

## What Sentinel does

Sentinel sits above [Argus](https://github.com/CodeBuildder/argus-k8s) (security) and
[Phoenix](https://github.com/CodeBuildder/phoenix) (resilience) — the master supervisor
of the [Sentinel platform](https://github.com/CodeBuildder/sentinel-platform). It doesn't
detect threats or inject chaos itself; it watches the agents that do, and turns their raw
event streams into fleet-wide situational awareness.

- **LangGraph supervisor** — subscribes to the shared event bus, normalizes Argus +
  Phoenix events through the common schema, and routes them into scoring and reporting
- **Fleet risk scoring** — a continuous per-datacenter/per-component score derived from
  MTTR, recovery rate, cascade-prevention rate, and live threat signals
- **Daily report generator** — Claude-narrated daily intelligence: simulated vs. actual
  threats, simulated vs. actual failures, heal success rate, MTTR trend,
  cascade-prevention rate, and the causal chains behind the day's notable events
- **Command-center dashboard** — a 23-datacenter geospatial/grid heatmap with
  sparklines, a unified Argus + Phoenix + human-action timeline, a live component
  dependency graph with blast-radius pulse, and a daily insights panel — in the
  platform's dark command-center style

## Status

Scaffolding in progress — see the [milestones](https://github.com/CodeBuildder/sentinel/milestones)
(M4 Sentinel Orchestrator → M5 Sentinel Dashboard, then M6/M7 integration & polish) for
the build sequence and the issue backlog.

## Stack

FastAPI + LangGraph supervisor, Claude API for report narration and risk reasoning,
React + TypeScript + Vite + Tailwind dashboard, real-time via WebSocket/SSE. Subscribes
to the Redis-streams event bus defined in
[sentinel-platform](https://github.com/CodeBuildder/sentinel-platform) and reuses the
existing Prometheus/Grafana/Loki + Cilium stack from
[argus-k8s](https://github.com/CodeBuildder/argus-k8s) — no duplicate infrastructure.

## Related repos

| Repo | Role |
|---|---|
| [argus-k8s](https://github.com/CodeBuildder/argus-k8s) | Security agent — eBPF threat detection, policy enforcement, AI reasoning |
| [phoenix](https://github.com/CodeBuildder/phoenix) | Resilience agent — chaos injection, synthetic provisioning, self-healing |
| [sentinel-platform](https://github.com/CodeBuildder/sentinel-platform) | GitOps layer — shared schema, Helm umbrella chart, deploy harness |

## License

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
