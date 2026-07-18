from unittest.mock import AsyncMock, patch

import pytest

from main import _risk, _source, build_overview


def test_source_normalizes_agents():
    assert _source({"source": "argus-agent"}) == "argus"
    assert _source({"source": "phoenix"}) == "phoenix"


def test_risk_is_transparent_and_bounded():
    nodes = [{"entity_id": "pod/prod/api", "name": "api", "security_posture": "high-risk", "fragility_score": .5}]
    findings = [{"entity_id": "pod/prod/api", "severity": "critical"}]
    fleet, level, components = _risk(nodes, findings)
    assert 0 <= fleet <= 100
    assert level in {"stable", "guarded", "high", "critical"}
    assert components[0]["finding_count"] == 1
    assert fleet == components[0]["risk"]


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
    assert result["timeline"][0]["summary"] == "shell detected"
