from __future__ import annotations

import asyncio
import json
from collections import Counter
from datetime import datetime, timezone
from typing import Any

import httpx
import structlog
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI
from pydantic import BaseModel

from config import config

log = structlog.get_logger()
app = FastAPI(title="Sentinel Orchestrator and Operations Graph Gateway", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

SEVERITY_WEIGHT = {"critical": 100, "high": 72, "medium": 45, "med": 45, "low": 18, "info": 5}
POSTURE_WEIGHT = {"critical": 100, "high-risk": 78, "medium-risk": 48, "low-risk": 20, "clean": 0}


class BriefingRequest(BaseModel):
    question: str = "What requires operator attention right now?"


async def _get(path: str, params: dict | None = None) -> Any:
    async with httpx.AsyncClient(timeout=config.REQUEST_TIMEOUT_SECONDS) as client:
        response = await client.get(f"{config.WORLD_MODEL_URL}{path}", params=params)
        response.raise_for_status()
        return response.json()


def _source(finding: dict) -> str:
    source = str(finding.get("source") or finding.get("source_agent") or "unknown").lower()
    if "argus" in source:
        return "argus"
    if "phoenix" in source:
        return "phoenix"
    return source


def _severity(finding: dict) -> str:
    return str(finding.get("severity") or finding.get("payload", {}).get("severity") or "info").lower()


async def _findings_for_entities(nodes: list[dict]) -> list[dict]:
    semaphore = asyncio.Semaphore(5)

    async def load(node: dict) -> list[dict]:
        async with semaphore:
            try:
                response = await client.get(
                    f"{config.WORLD_MODEL_URL}/findings",
                    params={"entity_id": node["entity_id"], "limit": 50},
                )
                response.raise_for_status()
                rows = response.json()
                return [{**row, "entity_name": node.get("name"), "entity_type": node.get("entity_type")} for row in rows]
            except Exception as exc:  # noqa: BLE001
                log.warning("finding_load_failed", entity_id=node.get("entity_id"), error=str(exc))
                return []

    limits = httpx.Limits(max_connections=8, max_keepalive_connections=5)
    async with httpx.AsyncClient(timeout=20, limits=limits) as client:
        results = await asyncio.gather(*(load(node) for node in nodes))
    deduped: dict[str, dict] = {}
    for finding in (item for group in results for item in group):
        key = str(finding.get("event_id") or f"{finding.get('timestamp')}:{finding.get('entity_id')}:{finding.get('type')}")
        deduped[key] = finding
    return sorted(deduped.values(), key=lambda item: str(item.get("timestamp", "")), reverse=True)


def _risk(nodes: list[dict], findings: list[dict]) -> tuple[int, str, list[dict]]:
    components = []
    by_entity: dict[str, list[dict]] = {}
    for finding in findings:
        by_entity.setdefault(str(finding.get("entity_id", "unknown")), []).append(finding)
    for node in nodes:
        recent = by_entity.get(node.get("entity_id"), [])
        threat = max((SEVERITY_WEIGHT.get(_severity(row), 5) for row in recent), default=0)
        posture = POSTURE_WEIGHT.get(str(node.get("security_posture", "clean")).lower(), 0)
        fragility = min(100, max(0, round(float(node.get("fragility_score", 0)) * 100)))
        score = round((threat * 0.5) + (posture * 0.3) + (fragility * 0.2))
        components.append({
            "entity_id": node.get("entity_id"), "name": node.get("name"),
            "namespace": node.get("namespace"), "entity_type": node.get("entity_type"),
            "risk": score, "security_posture": node.get("security_posture", "clean"),
            "fragility": fragility, "finding_count": len(recent),
        })
    components.sort(key=lambda item: item["risk"], reverse=True)
    fleet = round(sum(item["risk"] for item in components) / len(components)) if components else 0
    level = "critical" if fleet >= 75 else "high" if fleet >= 50 else "guarded" if fleet >= 25 else "stable"
    return fleet, level, components


async def build_overview() -> dict:
    degraded: list[str] = []
    try:
        topology = await _get("/topology")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"Sentinel Operations Graph unavailable: {exc}") from exc
    nodes = topology.get("nodes", [])
    findings = await _findings_for_entities(nodes)
    try:
        trust = await _get("/trust")
    except Exception:  # noqa: BLE001
        trust, degraded = [], ["trust"]
    try:
        incidents = await _get("/incidents")
    except Exception:  # noqa: BLE001
        incidents, degraded = [], [*degraded, "incidents"]

    fleet_risk, risk_level, components = _risk(nodes, findings)
    sources = Counter(_source(item) for item in findings)
    severities = Counter(_severity(item) for item in findings)
    timeline = [{
        "id": row.get("event_id"), "source": _source(row), "severity": _severity(row),
        "timestamp": row.get("timestamp"), "entity_id": row.get("entity_id"),
        "entity_name": row.get("entity_name"), "type": row.get("type", "finding"),
        "correlation_id": row.get("correlation_id"),
        "stage": row.get("payload", {}).get("stage") or row.get("payload", {}).get("node"),
        "action": row.get("payload", {}).get("recommended_action") or row.get("payload", {}).get("action_taken"),
        "outcome": row.get("payload", {}).get("outcome") or row.get("payload", {}).get("verify_result"),
        "summary": row.get("payload", {}).get("assessment")
            or row.get("payload", {}).get("causal_chain")
            or row.get("payload", {}).get("outcome")
            or row.get("payload", {}).get("rule")
            or row.get("type", "Operational finding"),
        "payload": row.get("payload", {}), "replayed": bool(row.get("replayed")),
    } for row in findings[:80]]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(), "status": "degraded" if degraded else "ok",
        "degraded_sources": degraded, "fleet_risk": fleet_risk, "risk_level": risk_level,
        "counts": {"entities": len(nodes), "edges": len(topology.get("edges", [])),
                   "findings": len(findings), "incidents": len(incidents),
                   "argus": sources.get("argus", 0), "phoenix": sources.get("phoenix", 0),
                   "critical": severities.get("critical", 0), "high": severities.get("high", 0)},
        "sources": {"argus": {"connected": sources.get("argus", 0) > 0, "findings": sources.get("argus", 0)},
                    "phoenix": {"connected": sources.get("phoenix", 0) > 0, "findings": sources.get("phoenix", 0)}},
        "components": components[:20], "timeline": timeline, "topology": topology,
        "incidents": incidents, "trust": trust,
    }


@app.get("/health")
async def health() -> dict:
    try:
        world_model = await _get("/health")
        connected = world_model.get("status") == "ok"
    except Exception:  # noqa: BLE001
        connected, world_model = False, None
    return {"status": "ok" if connected else "degraded", "service": "sentinel-orchestrator",
            "world_model_connected": connected, "openai_configured": bool(config.OPENAI_API_KEY),
            "world_model": world_model}


@app.get("/overview")
async def overview() -> dict:
    return await build_overview()


@app.post("/briefing")
async def briefing(body: BriefingRequest) -> dict:
    if not config.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY not configured")
    state = await build_overview()
    compact = {key: state[key] for key in ("fleet_risk", "risk_level", "counts", "sources")}
    compact["top_components"] = state["components"][:5]
    compact["recent_timeline"] = state["timeline"][:10]
    instructions = (
        "You are Sentinel, the OpenAI-powered supervisor for autonomous infrastructure. "
        "Brief an SRE using only the supplied live state. Distinguish Argus security evidence "
        "from Phoenix resilience evidence. Never claim a source is connected when its count is zero. "
        "Return concise Markdown with: Current posture, What changed, Operator decisions, Next action."
    )
    response = await AsyncOpenAI(api_key=config.OPENAI_API_KEY).responses.create(
        model=config.OPENAI_MODEL, instructions=instructions,
        input=f"Operator question: {body.question}\n\nLive state:\n{json.dumps(compact, default=str)}",
        max_output_tokens=900,
    )
    return {"briefing": response.output_text, "model": config.OPENAI_MODEL,
            "generated_at": datetime.now(timezone.utc).isoformat()}
