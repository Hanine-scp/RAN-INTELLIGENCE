from __future__ import annotations

import os
import time

import pytest

from src.services.data_service import FilterContext, data_service, lake_ready

DASHBOARD_EMPTY_BUDGET_MS = float(os.getenv("CI_DASHBOARD_EMPTY_BUDGET_MS", "100"))
DASHBOARD_LAKE_BUDGET_MS = float(os.getenv("CI_DASHBOARD_LAKE_BUDGET_MS", "2000"))


def _elapsed_ms(start: float) -> float:
    return (time.perf_counter() - start) * 1000


def test_dashboard_empty_context_budget():
    ctx = FilterContext.from_inputs(selected_dates=[], effective_dates=[])
    start = time.perf_counter()
    result = data_service.get_dashboard(ctx)
    elapsed = _elapsed_ms(start)
    assert result["summary"] == []
    assert elapsed <= DASHBOARD_EMPTY_BUDGET_MS


@pytest.mark.skipif(not lake_ready(), reason="Parquet lake not available in CI")
def test_dashboard_with_lake_budget():
    from src.services.data_service import get_snapshot_dates

    dates = get_snapshot_dates()
    if not dates:
        pytest.skip("No snapshot dates in lake")
    ctx = FilterContext.from_inputs(selected_dates=dates[:1], effective_dates=dates[:1])
    start = time.perf_counter()
    result = data_service.get_dashboard(ctx)
    elapsed = _elapsed_ms(start)
    assert "kpis" in result
    assert elapsed <= DASHBOARD_LAKE_BUDGET_MS, (
        f"get_dashboard took {elapsed:.1f}ms (budget {DASHBOARD_LAKE_BUDGET_MS}ms)"
    )
