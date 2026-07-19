from unittest.mock import AsyncMock, patch

import pytest

from main import _correlated_incidents, _risk, _source, _summary, build_overview, readiness
from config import config


def test_source_normalizes_agents():
    assert _source({"source": "argus-agent"}) == "argus"
    assert _source({"source": "phoenix"}) == "phoenix"


def test_summary_normalizes_structured_argus_assessment():
    finding = {"payload": {"assessment": {"assessment": "critical shell evidence", "confidence": 0.97}}}
    assert _summary(finding) == "critical shell evidence"


def test_risk_is_transparent_and_bounded():
    nodes = [{"entity_id": "pod/prod/api", "name": "api", "security_posture": "high-risk", "fragility_score": .5}]
    findings = [{"entity_id": "pod/prod/api", "severity": "critical"}]
    fleet, level, components = _risk(nodes, findings)
    assert 0 <= fleet <= 100
    assert level in {"stable", "guarded", "high", "critical"}
    assert components[0]["finding_count"] == 1
    assert fleet == components[0]["risk"]


def test_incident_requires_explicit_cross_agent_correlation():
    argus = {"id": "a", "source": "argus", "severity": "critical", "timestamp": "2026-07-18T00:00:00Z", "correlation_id": "case-1", "summary": "detected", "provenance": "observed"}
    phoenix = {"id": "p", "source": "phoenix", "severity": "high", "timestamp": "2026-07-18T00:00:05Z", "correlation_id": "case-1", "summary": "recovered", "outcome": "verified", "provenance": "live_chaos"}
    standalone = {"id": "solo", "source": "phoenix", "severity": "high", "timestamp": "2026-07-18T00:00:06Z", "correlation_id": "case-2"}
    incidents = _correlated_incidents([standalone, phoenix, argus])
    assert len(incidents) == 1
    assert incidents[0]["correlation_id"] == "case-1"
    assert incidents[0]["status"] == "resolved"
    assert incidents[0]["sources"] == ["argus", "phoenix"]
    assert [item["id"] for item in incidents[0]["timeline"]] == ["a", "p"]
    assert incidents[0]["report"]["detection"] == "detected"
    assert incidents[0]["report"]["recovery"] == "recovered"
    assert incidents[0]["report"]["root_cause"] == "Not established by the supplied evidence"
    assert "no wider impact is claimed" in incidents[0]["report"]["impact"]


def test_incident_exposes_only_supplied_proof_stages_and_metrics():
    argus = {"id": "a", "source": "argus", "severity": "high", "timestamp": "2026-07-18T00:00:01Z", "correlation_id": "proof-1", "provenance": "observed"}
    phoenix = {"id": "p", "source": "phoenix", "severity": "high", "timestamp": "2026-07-18T00:00:07Z", "correlation_id": "proof-1", "provenance": "live_chaos", "outcome": "verified_recovery", "payload": {"scenario_id": "chaos-1", "evidence_source": "Falco + HTTP probe", "metrics": {"detection_ms": 1200, "recovery_ms": 4300, "availability_percent": 99.8}, "lifecycle": [{"stage": "healthy", "timestamp": "2026-07-18T00:00:00Z", "status": "verified"}, {"stage": "verification", "timestamp": "2026-07-18T00:00:07Z", "status": "verified"}]}}
    incident = _correlated_incidents([argus, phoenix])[0]
    assert [item["stage"] for item in incident["proof"]["lifecycle"]] == ["healthy", "verification"]
    assert incident["proof"]["metrics"]["availability_percent"] == 99.8
    assert incident["proof"]["experiment_id"] == "chaos-1"
    assert incident["report"]["verification"] == "Verification evidence was not supplied"
    assert incident["report"]["evidence_source"] == "Falco + HTTP probe"


@pytest.mark.asyncio
async def test_overview_aggregates_sources():
    async def fake_get(path, params=None):
        if path == "/topology":
            return {"nodes": [{"entity_id": "pod/prod/api", "name": "api", "security_posture": "clean", "fragility_score": 0}], "edges": []}
        return []
    findings = [{"event_id": "1", "source": "argus", "entity_id": "pod/prod/api", "severity": "high", "timestamp": "2026-07-18T00:00:00Z", "payload": {"assessment": "shell detected"}}]
    with patch("main._get", new=AsyncMock(side_effect=fake_get)), patch(
        "main._findings_for_entities", new=AsyncMock(return_value=findings)
    ):
        result = await build_overview()
    assert result["counts"]["argus"] == 1
    assert result["counts"]["live"] == 1
    assert result["counts"]["replayed"] == 0
    assert result["counts"]["affected"] == 1
    assert result["sources"]["argus"]["connected"] is True
    assert result["sources"]["argus"]["latest_at"] == "2026-07-18T00:00:00Z"
    assert result["components"][0]["evidence"][0]["summary"] == "shell detected"
    assert result["timeline"][0]["summary"] == "shell detected"


@pytest.mark.asyncio
async def test_portable_readiness_is_presentation_ready_without_kubernetes(monkeypatch):
    async def healthy(name, url, remediation):
        return {"name": name, "status": "ready", "required": True, "evidence": f"{url} ok", "remediation": ""}

    monkeypatch.setattr("main._http_readiness", healthy)
    monkeypatch.setattr(config, "DEMO_MODE", "portable")
    monkeypatch.setattr(config, "OPENAI_API_KEY", "configured")
    result = await readiness()
    assert result["ready_to_present"] is True
    assert result["summary"]["blocking"] == 0
    assert result["summary"]["not_applicable"] == 5
    assert {item["name"] for item in result["components"]} >= {"Argus", "Phoenix", "Sentinel", "SOG", "OpenAI", "Kubernetes", "Cilium", "Falco", "Kyverno", "Chaos Mesh"}


@pytest.mark.asyncio
async def test_readiness_explains_blocking_service_and_openai(monkeypatch):
    async def services(name, url, remediation):
        status = "not_ready" if name == "Argus" else "ready"
        return {"name": name, "status": status, "required": True, "evidence": f"{url} {status}", "remediation": remediation if status != "ready" else ""}

    monkeypatch.setattr("main._http_readiness", services)
    monkeypatch.setattr(config, "DEMO_MODE", "portable")
    monkeypatch.setattr(config, "OPENAI_API_KEY", "")
    result = await readiness()
    assert result["ready_to_present"] is False
    assert result["summary"]["blocking"] == 2
    blocking = {item["name"]: item for item in result["components"] if item["required"] and item["status"] != "ready"}
    assert blocking["Argus"]["remediation"]
    assert blocking["OpenAI"]["status"] == "not_configured"
