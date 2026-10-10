from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from prometheus import (
    PrometheusClient,
    PrometheusQueryError,
    detect_sli_blind_spot,
    sli_query,
    time_matched_baseline,
    windowed_counter_delta,
)


def test_sli_query_known_name_fills_selector():
    expr = sli_query("http_request_success_rate", 'job="api"')
    assert 'job="api"' in expr
    assert "http_requests_total" in expr


def test_sli_query_unknown_name_raises():
    with pytest.raises(ValueError):
        sli_query("made_up_sli", 'job="api"')


@pytest.mark.asyncio
async def test_query_range_parses_single_series():
    client = PrometheusClient(base_url="http://prom.test")
    payload = {
        "status": "success",
        "data": {"result": [{"values": [[1000, "0.99"], [1030, "0.98"]]}]},
    }
    fake_response = AsyncMock()
    fake_response.raise_for_status = lambda: None
    fake_response.json = lambda: payload
    with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=fake_response)):
        series = await client.query_range("up", datetime.now(timezone.utc), datetime.now(timezone.utc), 30)
    assert series == [
        (datetime.fromtimestamp(1000, tz=timezone.utc), 0.99),
        (datetime.fromtimestamp(1030, tz=timezone.utc), 0.98),
    ]


@pytest.mark.asyncio
async def test_query_range_rejects_multiple_series():
    client = PrometheusClient(base_url="http://prom.test")
    payload = {"status": "success", "data": {"result": [{"values": [[1000, "1"]]}, {"values": [[1000, "2"]]}]}}
    fake_response = AsyncMock()
    fake_response.raise_for_status = lambda: None
    fake_response.json = lambda: payload
    with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=fake_response)):
        with pytest.raises(PrometheusQueryError):
            await client.query_range("up", datetime.now(timezone.utc), datetime.now(timezone.utc), 30)


@pytest.mark.asyncio
async def test_query_range_raises_on_prometheus_error_status():
    client = PrometheusClient(base_url="http://prom.test")
    payload = {"status": "error", "error": "bad query"}
    fake_response = AsyncMock()
    fake_response.raise_for_status = lambda: None
    fake_response.json = lambda: payload
    with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=fake_response)):
        with pytest.raises(PrometheusQueryError, match="bad query"):
            await client.query_range("up", datetime.now(timezone.utc), datetime.now(timezone.utc), 30)


@pytest.mark.asyncio
async def test_time_matched_baseline_rejects_naive_datetimes():
    client = PrometheusClient(base_url="http://prom.test")
    with pytest.raises(ValueError):
        await time_matched_baseline(client, "up", datetime.now(), datetime.now())


@pytest.mark.asyncio
async def test_time_matched_baseline_computes_impact_from_median_of_prior_weeks():
    window_start = datetime(2026, 7, 20, 14, 0, tzinfo=timezone.utc)  # a Monday
    window_end = window_start + timedelta(minutes=1)
    observed = [(window_start, 0.90), (window_start + timedelta(seconds=30), 0.90)]

    def week_series(ts, value):
        return [(ts, value), (ts + timedelta(seconds=30), value)]

    # Three prior weeks, baseline success rate steady at 0.99; one query per
    # week (lookback_weeks=3) plus the initial observed-window query.
    responses = [
        observed,
        week_series(window_start - timedelta(weeks=1), 0.99),
        week_series(window_start - timedelta(weeks=2), 0.99),
        week_series(window_start - timedelta(weeks=3), 0.97),
    ]
    client = PrometheusClient(base_url="http://prom.test")
    with patch.object(client, "query_range", new=AsyncMock(side_effect=responses)):
        result = await time_matched_baseline(
            client, "up", window_start, window_end, step_seconds=30, lookback_weeks=3, offset_tolerance_minutes=15
        )

    assert result.min_samples == 3
    assert [v for _, v in result.baseline] == [0.99, 0.99]
    assert result.impact == pytest.approx((0.90 - 0.99) * 2)


@pytest.mark.asyncio
async def test_time_matched_baseline_raises_when_no_prior_week_has_data():
    window_start = datetime(2026, 7, 20, 14, 0, tzinfo=timezone.utc)
    window_end = window_start + timedelta(seconds=30)
    observed = [(window_start, 0.90)]
    client = PrometheusClient(base_url="http://prom.test")
    with patch.object(client, "query_range", new=AsyncMock(side_effect=[observed, [], [], []])):
        with pytest.raises(PrometheusQueryError):
            await time_matched_baseline(client, "up", window_start, window_end, lookback_weeks=3)


@pytest.mark.asyncio
async def test_query_instant_returns_none_on_empty_result():
    client = PrometheusClient(base_url="http://prom.test")
    payload = {"status": "success", "data": {"result": []}}
    fake_response = AsyncMock()
    fake_response.raise_for_status = lambda: None
    fake_response.json = lambda: payload
    with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=fake_response)):
        value = await client.query_instant("up", datetime.now(timezone.utc))
    assert value is None


@pytest.mark.asyncio
async def test_query_instant_parses_single_value():
    client = PrometheusClient(base_url="http://prom.test")
    payload = {"status": "success", "data": {"result": [{"value": [1000, "42"]}]}}
    fake_response = AsyncMock()
    fake_response.raise_for_status = lambda: None
    fake_response.json = lambda: payload
    with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=fake_response)):
        value = await client.query_instant("up", datetime.now(timezone.utc))
    assert value == 42.0


@pytest.mark.asyncio
async def test_windowed_counter_delta_queries_exact_boundaries_not_padded():
    window_start = datetime(2026, 7, 20, 14, 0, 0, tzinfo=timezone.utc)
    window_end = window_start + timedelta(seconds=30)
    client = PrometheusClient(base_url="http://prom.test")
    calls = []

    async def fake_query_instant(expr, at):
        calls.append(at)
        return 100.0 if at == window_start else 136.0

    with patch.object(client, "query_instant", new=fake_query_instant):
        delta = await windowed_counter_delta(
            client, "http_requests_total", window_start, window_end, scrape_interval_seconds=5
        )

    assert delta == 36.0
    # exact boundaries, not shifted outward -- padding was tried and found to
    # overcount (widens the counted span by 2 * scrape_interval_seconds)
    assert calls == [window_start, window_end]


@pytest.mark.asyncio
async def test_windowed_counter_delta_raises_when_no_sample_in_padded_window():
    window_start = datetime(2026, 7, 20, 14, 0, 0, tzinfo=timezone.utc)
    window_end = window_start + timedelta(seconds=30)
    client = PrometheusClient(base_url="http://prom.test")
    with patch.object(client, "query_instant", new=AsyncMock(return_value=None)):
        with pytest.raises(PrometheusQueryError):
            await windowed_counter_delta(
                client, "http_requests_total", window_start, window_end, scrape_interval_seconds=5
            )


@pytest.mark.asyncio
async def test_windowed_counter_delta_rejects_negative_delta():
    # A counter can appear to go backwards in a sum() aggregation if one of
    # the summed series' targets goes unscrapable mid-window and its last
    # value drops out -- found via a NetworkPolicy isolation test where
    # Prometheus's own scrape of the isolated pod failed too.
    window_start = datetime(2026, 7, 20, 14, 0, 0, tzinfo=timezone.utc)
    window_end = window_start + timedelta(seconds=30)
    client = PrometheusClient(base_url="http://prom.test")

    async def fake_query_instant(expr, at):
        return 27777.0 if at == window_start else 27525.0

    with patch.object(client, "query_instant", new=fake_query_instant):
        with pytest.raises(PrometheusQueryError, match="negative"):
            await windowed_counter_delta(
                client, 'sum(http_requests_total{code="500"})', window_start, window_end, scrape_interval_seconds=5
            )


@pytest.mark.asyncio
async def test_detect_sli_blind_spot_flags_zero_app_failed_with_real_drops():
    window_start = datetime(2026, 7, 20, 14, 0, 0, tzinfo=timezone.utc)
    window_end = window_start + timedelta(seconds=30)
    client = PrometheusClient(base_url="http://prom.test")

    async def fake_delta(client_, expr, start, end, *, scrape_interval_seconds):
        return 0.0 if "http_requests_total" in expr else 420.0

    with patch("prometheus.windowed_counter_delta", new=fake_delta):
        result = await detect_sli_blind_spot(
            client,
            app_failed_expr='http_requests_total{code="500"}',
            edge_drop_expr='cilium_drop_count_total{reason="Policy denied"}',
            window_start=window_start,
            window_end=window_end,
            scrape_interval_seconds=5,
        )

    assert result.blind is True
    assert result.app_failed == 0.0
    assert result.edge_drops == 420.0
    assert "420" in result.reason
    assert "not a clean zero" in result.reason


@pytest.mark.asyncio
async def test_detect_sli_blind_spot_not_blind_when_app_counter_agrees():
    window_start = datetime(2026, 7, 20, 14, 0, 0, tzinfo=timezone.utc)
    window_end = window_start + timedelta(seconds=30)
    client = PrometheusClient(base_url="http://prom.test")

    async def fake_delta(client_, expr, start, end, *, scrape_interval_seconds):
        return 19.0 if "http_requests_total" in expr else 0.0

    with patch("prometheus.windowed_counter_delta", new=fake_delta):
        result = await detect_sli_blind_spot(
            client,
            app_failed_expr='http_requests_total{code="500"}',
            edge_drop_expr='cilium_drop_count_total{reason="Policy denied"}',
            window_start=window_start,
            window_end=window_end,
            scrape_interval_seconds=5,
        )

    assert result.blind is False
    assert result.reason is None


@pytest.mark.asyncio
async def test_detect_sli_blind_spot_not_blind_when_both_zero():
    window_start = datetime(2026, 7, 20, 14, 0, 0, tzinfo=timezone.utc)
    window_end = window_start + timedelta(seconds=30)
    client = PrometheusClient(base_url="http://prom.test")

    async def fake_delta(client_, expr, start, end, *, scrape_interval_seconds):
        return 0.0

    with patch("prometheus.windowed_counter_delta", new=fake_delta):
        result = await detect_sli_blind_spot(
            client,
            app_failed_expr='http_requests_total{code="500"}',
            edge_drop_expr='cilium_drop_count_total{reason="Policy denied"}',
            window_start=window_start,
            window_end=window_end,
            scrape_interval_seconds=5,
        )

    assert result.blind is False
