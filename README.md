<!--
Sentinel — Master Orchestrator & Command Center
Copyright (c) 2026 Kaushikkumaran
Original work — see NOTICE for details
Commit history: https://github.com/CodeBuildder/sentinel/commits/main
-->

<h1 align="center">Sentinel</h1>

<p align="center">
  The OpenAI-native master orchestrator and unified command center for the Sentinel
  platform—correlating Argus security evidence and Phoenix resilience outcomes through
  the Sentinel Operations Graph (SOG).
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
- **Operational briefing** — OpenAI-generated intelligence: simulated vs. actual
  threats, simulated vs. actual failures, heal success rate, MTTR trend,
  cascade-prevention rate, and the causal chains behind the day's notable events
- **Command-center dashboard** — a 23-datacenter geospatial/grid heatmap with
  sparklines, a unified Argus + Phoenix + human-action timeline, a live component
  dependency graph with blast-radius pulse, and a daily insights panel — in the
  platform's dark command-center style

## Build Week command center

The Build Week MVP includes a FastAPI aggregation layer and React command center with:

- unified Argus + Phoenix evidence timeline
- transparent fleet/component risk scoring
- Sentinel Operations Graph topology and posture
- autonomy trust and human-gated action visibility
- honest disconnected/degraded source states
- OpenAI Responses API operational briefings generated from live shared state

### One-command complete platform demo

For the recommended judge path, keep the three checkouts in this layout and run the
orchestrator from Argus:

```text
Projects/
├── argus-k8s/                 # run the command here
└── sentinel-stack/
    ├── phoenix/
    ├── sentinel/
    └── sentinel-platform/
```

The recommended judge path is cluster-free. It needs Docker or OrbStack for one
disposable Redis container, but does not need Kubernetes, kubectl, Cilium, Falco, or
Chaos Mesh. Run the non-mutating doctor:

```bash
make -C ../../argus-k8s doctor
```

Launch the complete platform:

```bash
make -C ../../argus-k8s demo-platform
```

The command installs missing dependencies; starts a disposable local SOG and real local
Argus, Phoenix, and Sentinel services; seeds an explicitly synthetic three-node,
multi-namespace topology; and verifies multiple cross-agent incidents through Sentinel.
A bounded replay/simulator feed makes counters, timelines, freshness, and risk views
change during the presentation. Open Argus at
**http://127.0.0.1:5173**, Phoenix at **http://127.0.0.1:5174**, and Sentinel at
**http://127.0.0.1:5175**. Every synthetic entity and finding is labeled; no Kubernetes
API or live Chaos Mesh fault is used. `Ctrl-C` stops the local services and removes the
disposable Redis container.

For the guarded real three-node k3s proof:

```bash
kubectl config use-context argus
make -C ../../argus-k8s doctor-live
make -C ../../argus-k8s demo-platform-live
```

The doctor is read-only and ends with a `READY`/`NOT READY` verdict plus an exact next
action. The live command requires the exact context and the phrase
`INJECT LIVE FAULT`, creates only `sentinel-live-demo`, and continuously probes a
two-replica HTTP target. It waits for observed Argus/Falco evidence, asks Phoenix to
create one real Chaos Mesh `PodChaos`, verifies the replacement and full readiness, and
then requires Sentinel to expose the correlated incident with `observed` + `live_chaos`
provenance. The scorecard contains measured availability and recovery time; `Ctrl-C`
deletes only the isolated namespace.

Open the resulting correlated incident to see the canonical resilience proof:
**Healthy → Fault injected → Detection → Decision → Human approval → Recovery →
Verification**. Live runs include measured detection time, recovery time, HTTP
availability, and evidence sources. Every record is assigned exactly one visible label:
**Live Observed**, **Synthetic Simulator**, **Live Chaos Mesh**, or **Replayed Evidence**.
Older records without stage evidence display unavailable steps instead of inferred data.

Before presenting, expand **Presentation Preflight** at the top of Sentinel. The panel
checks Argus, Phoenix, Sentinel, SOG, OpenAI, Kubernetes, Cilium, Falco, Kyverno, and
Chaos Mesh through read-only endpoints. Portable mode marks cluster-only systems N/A;
live mode reports actual Ready pod counts from the authorized kubectl context. Every
failure includes its evidence and an exact remediation. The platform demo commands will
not declare success unless this panel reports **Ready to present**.

Select **How it works** in Sentinel's header for the unified 30-second explanation. The
full-screen flow introduces Argus observation, the SOG shared model, Sentinel/OpenAI
decision support, human governance, and Phoenix recovery plus verification. It includes
a ready-to-speak judge narration, explicit autonomous/high-risk boundaries, and all four
evidence-provenance labels. The overlay is responsive and closes with its button, the
backdrop, or `Escape`.

### Sentinel-only development

Run the Sentinel Operations Graph service first, then:

```bash
cp .env.example .env
make setup-local
set -a; source .env; set +a
make demo-local
```

Open **http://127.0.0.1:5175**.

The top-bar product switcher uses the explicit `VITE_ARGUS_URL` and
`VITE_PHOENIX_URL` values from `.env`. The reserved local console ports are Argus
`5173`, Phoenix `5174`, and Sentinel `5175`; deployed environments should replace
those values with their public URLs.

## Stack

FastAPI aggregation/orchestration service, OpenAI Responses API for operational briefing,
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
