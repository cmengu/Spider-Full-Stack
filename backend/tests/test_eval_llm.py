"""
Live LLM eval tests for parse_filter_query.
Run with:  pytest -m eval --tb=short -v
Skip in CI: pytest -m "not eval"
Requires:   ANTHROPIC_API_KEY in environment.
"""
import json
import os
import sys
import time

import anthropic
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import app as app_module
from ai_filter import parse_filter_query

VALID_ARMS = app_module.VALID_ARMS
VALID_DOSES = app_module.VALID_DOSES
VALID_TUMORS = app_module.VALID_TUMORS

CASES_PATH = os.path.join(os.path.dirname(__file__), 'eval_cases.json')


def load_cases():
    with open(CASES_PATH) as f:
        return json.load(f)


@pytest.fixture(scope='session')
def anthropic_client():
    key = os.environ.get('ANTHROPIC_API_KEY')
    if not key:
        pytest.skip('ANTHROPIC_API_KEY not set — skipping live eval')
    with anthropic.Anthropic(api_key=key, max_retries=1) as client:
        yield client


@pytest.mark.eval
@pytest.mark.parametrize('case', load_cases(), ids=lambda c: c['id'])
def test_llm_filter_parsing(case, anthropic_client):
    t0 = time.monotonic()

    if case.get('expect_error'):
        with pytest.raises(ValueError, match=case.get('expect_match')) as exc_info:
            parse_filter_query(
                case['query'],
                client=anthropic_client,
                valid_arms=VALID_ARMS,
                valid_doses=VALID_DOSES,
                valid_tumors=VALID_TUMORS,
            )
        latency = time.monotonic() - t0
        print(f"\n  [{case['id']}] raised ValueError in {latency:.2f}s: {exc_info.value}")
        return

    result = parse_filter_query(
        case['query'],
        client=anthropic_client,
        valid_arms=VALID_ARMS,
        valid_doses=VALID_DOSES,
        valid_tumors=VALID_TUMORS,
    )
    latency = time.monotonic() - t0
    print(f"\n  [{case['id']}] {result}  ({latency:.2f}s)")

    if 'accept_any' in case:
        assert result in case['accept_any'], (
            f"[{case['id']}] got {result}, expected one of {case['accept_any']}\n"
            f"  query: {case['query']!r}\n"
            f"  note: {case.get('notes', '')}"
        )
        return

    expected = case['expected']
    for field in ('arm', 'dose', 'tumor_type'):
        assert result[field] == expected[field], (
            f"[{case['id']}] field '{field}': got {result[field]!r}, "
            f"expected {expected[field]!r}\n"
            f"  query: {case['query']!r}"
        )
