from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from statistics import median

import httpx

from config import config

# Abstract SLI names as used by scenarios.yaml (measure.sli) mapped to PromQL
# templates. These assume a conventional RED-method schema (http_requests_total
# with a `code` label, a job-completion counter, a latency histogram) that has
# not been confirmed against the design partner's actual Prometheus. Treat as
# a starting point, not ground truth.
_SLI_TEMPLATES = {
    "http_request_success_rate": (
        'sum(rate(http_requests_total{{{selector},code!~"5.."}}[1m]))'
        ' / sum(rate(http_requests_total{{{selector}}}[1m]))'
    ),
    "job_completion_rate": (
        'sum(rate(job_completions_total{{{selector},status="success"}}[1m]))'
        ' / sum(rate(job_completions_total{{{selector}}}[1m]))'
    ),
    "http_request_latency_p95": (
        'histogram_quantile(0.95,'
        ' sum(rate(http_request_duration_seconds_bucket{{{selector}}}[5m])) by (le))'
    ),
}


def sli_query(sli: str, selector: str) -> str:
    try:
        template = _SLI_TEMPLATES[sli]
    except KeyError:
        raise ValueError(f"no PromQL template for sli={sli!r}; known: {sorted(_SLI_TEMPLATES)}") from None
    return template.format(selector=selector)


class PrometheusQueryError(Exception):
    pass


Series = list[tuple[datetime, float]]


class PrometheusClient:
    """Reads SLI data from the customer's Prometheus. Never our own probe (CLAUDE.md)."""

    def __init__(self, base_url: str | None = None, *, timeout: float | None = None):
        self.base_url = (base_url or config.PROMETHEUS_URL).rstrip("/")
        self.timeout = timeout if timeout is not None else config.REQUEST_TIMEOUT_SECONDS

    async def query_range(self, expr: str, start: datetime, end: datetime, step_seconds: int) -> Series:
        params = {
            "query": expr,
            "start": start.timestamp(),
            "end": end.timestamp(),
            "step": step_seconds,
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(f"{self.base_url}/api/v1/query_range", params=params)
        resp.raise_for_status()
        payload = resp.json()
        if payload.get("status") != "success":
            raise PrometheusQueryError(payload.get("error", "unknown prometheus error"))
        result = payload["data"]["result"]
        if not result:
            return []
        if len(result) > 1:
            raise PrometheusQueryError(f"expected a single series, got {len(result)}; narrow the selector")
        return [(datetime.fromtimestamp(float(ts), tz=timezone.utc), float(val)) for ts, val in result[0]["values"]]

    async def query_instant(self, expr: str, at: datetime) -> float | None:
        """Counter/gauge value at a single instant (Prometheus's own lookback,
        i.e. the most recent sample at or before `at`), not a stepped series."""
        params = {"query": expr, "time": at.timestamp()}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(f"{self.base_url}/api/v1/query", params=params)
        resp.raise_for_status()
        payload = resp.json()
        if payload.get("status") != "success":
            raise PrometheusQueryError(payload.get("error", "unknown prometheus error"))
        result = payload["data"]["result"]
        if not result:
            return None
        if len(result) > 1:
            raise PrometheusQueryError(f"expected a single series, got {len(result)}; narrow the selector")
        return float(result[0]["value"][1])


async def windowed_counter_delta(
    client: PrometheusClient,
    expr: str,
    window_start: datetime,
    window_end: datetime,
    *,
    scrape_interval_seconds: int,
) -> float:
    """Counter delta over [window_start, window_end] from two instant values,
    not query_range steps. query_range's own step alignment can silently clip
    traffic near either edge when a window boundary falls between two scrape
    timestamps (the grid's last point can fall up to scrape_interval_seconds
    short of window_end) -- this undercounts, worst on sparse series like
    failed requests.

    Queried at the exact boundaries, not padded outward: a Prometheus instant
    query already resolves to the most recent scrape at or before the given
    timestamp, which is correct for that exact instant -- it isn't on
    query_range's grid, so it doesn't have query_range's clipping problem.
    Padding both edges outward (window_start - pad, window_end + pad) was
    tried and rejected: it widens the counted span by 2 * pad on top of the
    window itself, which measurably overcounts on short windows (confirmed
    ~2x on a ~12s window in testing). scrape_interval_seconds is accepted so
    callers can size a Poisson/boundary-error allowance around this call's
    residual (sub-scrape-interval) timing noise, not to shift the query.
    """
    before = await client.query_instant(expr, window_start)
    after = await client.query_instant(expr, window_end)
    if before is None or after is None:
        raise PrometheusQueryError(
            f"no counter sample at or before the window [{window_start.isoformat()}, "
            f"{window_end.isoformat()}]; cannot compute a delta"
        )
    return after - before


@dataclass(frozen=True)
class BlindSpotResult:
    """app_failed alone can read a clean 0 while real cost is nonzero: a deny
    NetworkPolicy drops packets before they ever reach the app, so an
    app-level request counter never sees them.

    edge_drops is deliberately NOT added to app_failed to "correct" it.
    cilium_drop_count_total (and the underlying Hubble flow events it's
    derived from) counts dropped *packets*, not failed *requests* -- a
    single blocked connection attempt can retry at the TCP level and log
    several drop events for the one logical failure (confirmed via Hubble in
    testing: ~1800 drop events from ~280 distinct connection attempts, a
    ~6.5x inflation). Summing a packet count into a request count would be
    its own unit-mismatch bug. edge_drops is reported as a presence/
    corroboration signal only -- when blind, report SLI_BLIND and no number,
    not a wrong number."""

    app_failed: float
    edge_drops: float
    blind: bool
    reason: str | None


async def detect_sli_blind_spot(
    client: PrometheusClient,
    *,
    app_failed_expr: str,
    edge_drop_expr: str,
    window_start: datetime,
    window_end: datetime,
    scrape_interval_seconds: int,
) -> BlindSpotResult:
    """Cross-checks an app-level failure counter against an edge-level one
    (e.g. Cilium's cilium_drop_count_total, which counts policy-denied drops
    before they reach any pod) for the same window. Flags SLI_BLIND -- never
    a clean zero (CLAUDE.md Rule 7) -- when the app counter says nothing
    happened but the edge counter disagrees. Either expr can be whatever SLI
    query fits the action under test; app_failed_expr is expected to be ~0
    for network-layer actions (the app never sees them) and nonzero for
    app-visible ones (e.g. T1's fault-knob 500s), so neither side is right
    for every action type. When blind, there is no reliable Prometheus-based
    request count for this window -- report the flag and reason, not a
    number (see BlindSpotResult's note on why edge_drops isn't summed in).
    """
    app_failed = await windowed_counter_delta(
        client, app_failed_expr, window_start, window_end, scrape_interval_seconds=scrape_interval_seconds
    )
    edge_drops = await windowed_counter_delta(
        client, edge_drop_expr, window_start, window_end, scrape_interval_seconds=scrape_interval_seconds
    )
    blind = app_failed == 0 and edge_drops > 0
    reason = None
    if blind:
        reason = (
            f"app-level failed count is 0 but {edge_drops:.0f} edge-level policy-denied "
            "drops were observed in the same window; app metrics alone cannot see "
            "network-layer drops -- this is not a clean zero"
        )
    return BlindSpotResult(app_failed=app_failed, edge_drops=edge_drops, blind=blind, reason=reason)


def _nearest(series: Series, target: datetime, tolerance: timedelta) -> float | None:
    best_value: float | None = None
    best_delta: float | None = None
    for ts, value in series:
        delta = abs((ts - target).total_seconds())
        if delta <= tolerance.total_seconds() and (best_delta is None or delta < best_delta):
            best_value, best_delta = value, delta
    return best_value


@dataclass(frozen=True)
class BaselineResult:
    window_start: datetime
    window_end: datetime
    step_seconds: int
    lookback_weeks: int
    offset_tolerance_minutes: int
    observed: Series
    baseline: Series
    samples_per_point: list[int] = field(default_factory=list)

    @property
    def min_samples(self) -> int:
        return min(self.samples_per_point) if self.samples_per_point else 0

    @property
    def impact(self) -> float:
        """sum over [t0,t1] of (observed(t) - baseline(t)) — CLAUDE.md's containment-cost formula."""
        return sum(obs - base for (_, obs), (_, base) in zip(self.observed, self.baseline))


async def time_matched_baseline(
    client: PrometheusClient,
    expr: str,
    window_start: datetime,
    window_end: datetime,
    *,
    step_seconds: int = 30,
    lookback_weeks: int = 4,
    offset_tolerance_minutes: int = 15,
) -> BaselineResult:
    """Baseline is time-matched: same weekday and hour, prior N weeks (CLAUDE.md)."""
    if window_start.tzinfo is None or window_end.tzinfo is None:
        raise ValueError("window_start/window_end must be timezone-aware")

    observed = await client.query_range(expr, window_start, window_end, step_seconds)

    tolerance = timedelta(minutes=offset_tolerance_minutes)
    weekly_series: list[Series] = []
    for week in range(1, lookback_weeks + 1):
        shift = timedelta(weeks=week)
        series = await client.query_range(expr, window_start - shift - tolerance, window_end - shift + tolerance, step_seconds)
        weekly_series.append(series)

    baseline: Series = []
    samples_per_point: list[int] = []
    for ts, _ in observed:
        matched = []
        for week, series in enumerate(weekly_series, start=1):
            value = _nearest(series, ts - timedelta(weeks=week), tolerance)
            if value is not None:
                matched.append(value)
        if not matched:
            raise PrometheusQueryError(
                f"no baseline sample within {offset_tolerance_minutes}m of {ts.isoformat()} "
                f"across {lookback_weeks} prior week(s); baseline is undefined for this window"
            )
        baseline.append((ts, median(matched)))
        samples_per_point.append(len(matched))

    return BaselineResult(
        window_start=window_start,
        window_end=window_end,
        step_seconds=step_seconds,
        lookback_weeks=lookback_weeks,
        offset_tolerance_minutes=offset_tolerance_minutes,
        observed=observed,
        baseline=baseline,
        samples_per_point=samples_per_point,
    )
