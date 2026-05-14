"""
Tests for ai_filter.py — grouped by concern:
  1. validate_filters     — pure function, zero Anthropic dependency
  2. parse_llm_response   — pure function, zero Anthropic dependency
  2b. build_system_prompt — prompt is code; test it like code
  3. parse_filter_query   — mocked Anthropic client via DI (never calls real API)
  4. POST /ai-filter      — Flask test client integration (monkeypatch per-test)
"""

import os
import sys
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import app as app_module
from ai_filter import (
    build_system_prompt,
    parse_filter_query,
    parse_llm_response,
    validate_filters,
)

VALID_ARMS = {'A', 'B'}
VALID_DOSES = {1800, 3000}
VALID_TUMORS = {'sqNSCLC', 'nsNSCLC', 'HNSCC'}


# ── Helper ────────────────────────────────────────────────────────────────────


def make_mock_client(response_text: str) -> MagicMock:
    """Return a mock Anthropic client whose messages.create returns response_text."""
    mock_content = MagicMock()
    mock_content.text = response_text
    mock_response = MagicMock()
    mock_response.content = [mock_content]
    mock_client = MagicMock()
    mock_client.messages.create.return_value = mock_response
    return mock_client


# ── 1. validate_filters — zero Anthropic dependency ──────────────────────────


def test_validate_filters_valid_arm_only():
    result = validate_filters(
        {'arm': 'A', 'dose': 'all', 'tumor_type': 'all'},
        VALID_ARMS,
        VALID_DOSES,
        VALID_TUMORS,
    )
    assert result == {'arm': 'A', 'dose': 'all', 'tumor_type': 'all'}


def test_validate_filters_dose_int_coerced_to_string():
    # Model returns integer 1800 — must come back as string "1800"
    result = validate_filters(
        {'arm': 'all', 'dose': 1800, 'tumor_type': 'all'},
        VALID_ARMS,
        VALID_DOSES,
        VALID_TUMORS,
    )
    assert result['dose'] == '1800'
    assert isinstance(result['dose'], str)


def test_validate_filters_dose_string_passthrough():
    result = validate_filters(
        {'arm': 'all', 'dose': '3000', 'tumor_type': 'all'},
        VALID_ARMS,
        VALID_DOSES,
        VALID_TUMORS,
    )
    assert result['dose'] == '3000'


def test_validate_filters_strips_whitespace_from_arm_and_tumor():
    result = validate_filters(
        {'arm': ' A ', 'dose': 'all', 'tumor_type': ' HNSCC '},
        VALID_ARMS,
        VALID_DOSES,
        VALID_TUMORS,
    )
    assert result['arm'] == 'A'
    assert result['tumor_type'] == 'HNSCC'


def test_validate_filters_invalid_arm_raises_valueerror():
    with pytest.raises(ValueError, match='arm'):
        validate_filters(
            {'arm': 'C', 'dose': 'all', 'tumor_type': 'all'},
            VALID_ARMS,
            VALID_DOSES,
            VALID_TUMORS,
        )


def test_validate_filters_invalid_dose_raises_valueerror():
    with pytest.raises(ValueError, match='dose'):
        validate_filters(
            {'arm': 'all', 'dose': '9999', 'tumor_type': 'all'},
            VALID_ARMS,
            VALID_DOSES,
            VALID_TUMORS,
        )


def test_validate_filters_non_numeric_dose_raises_valueerror():
    with pytest.raises(ValueError):
        validate_filters(
            {'arm': 'all', 'dose': '1800mg', 'tumor_type': 'all'},
            VALID_ARMS,
            VALID_DOSES,
            VALID_TUMORS,
        )


def test_validate_filters_invalid_tumor_raises_valueerror():
    with pytest.raises(ValueError, match='tumor'):
        validate_filters(
            {'arm': 'all', 'dose': 'all', 'tumor_type': 'UnknownType'},
            VALID_ARMS,
            VALID_DOSES,
            VALID_TUMORS,
        )


def test_validate_filters_missing_key_raises_valueerror():
    with pytest.raises(ValueError, match='missing'):
        validate_filters(
            {'arm': 'A', 'dose': 'all'},  # no tumor_type
            VALID_ARMS,
            VALID_DOSES,
            VALID_TUMORS,
        )


def test_validate_filters_unsupported_flag_raises_valueerror():
    with pytest.raises(ValueError, match='not supported'):
        validate_filters(
            {
                'arm': 'all',
                'dose': 'all',
                'tumor_type': 'all',
                'unsupported': True,
            },
            VALID_ARMS,
            VALID_DOSES,
            VALID_TUMORS,
        )


def test_validate_filters_all_all_all_without_flag_raises():
    # all-all-all with no unsupported flag = ambiguous/unparseable query
    with pytest.raises(ValueError):
        validate_filters(
            {'arm': 'all', 'dose': 'all', 'tumor_type': 'all'},
            VALID_ARMS,
            VALID_DOSES,
            VALID_TUMORS,
        )


# ── 2. parse_llm_response — zero Anthropic dependency ────────────────────────


def test_parse_llm_response_valid_json():
    raw = '{"arm": "A", "dose": "all", "tumor_type": "all"}'
    assert parse_llm_response(raw) == {
        'arm': 'A',
        'dose': 'all',
        'tumor_type': 'all',
    }


def test_parse_llm_response_non_json_raises_valueerror_not_jsondecodeerror():
    # Must raise ValueError (caught by endpoint) not JSONDecodeError (falls to 500)
    with pytest.raises(ValueError, match='non-JSON'):
        parse_llm_response('Here is your filter: {"arm": "A"}')


def test_parse_llm_response_empty_raises_valueerror():
    with pytest.raises(ValueError):
        parse_llm_response('')


# ── 2b. build_system_prompt — prompt is code, test it like code ─────────────────


def test_system_prompt_contains_unsupported_instruction():
    # Guards the unsupported-query detection mechanism — if this sentence is
    # accidentally removed from the prompt, the feature silently breaks with
    # no test failure until a user reports it.
    prompt = build_system_prompt(
        {'A', 'B'},
        {1800, 3000},
        {'sqNSCLC', 'nsNSCLC', 'HNSCC'},
    )
    assert 'unsupported' in prompt
    assert 'true' in prompt.lower()


def test_system_prompt_injects_valid_values_not_hardcoded():
    # Passing different sets must produce different prompt content.
    # Guards against build_system_prompt falling back to hardcoded strings
    # when the CSV changes and new valid values are passed in.
    prompt = build_system_prompt({'X', 'Y'}, {999}, {'TypeZ'})
    assert '"X"' in prompt or '"Y"' in prompt
    assert '"999"' in prompt
    assert '"TypeZ"' in prompt
    assert '"A"' not in prompt  # hardcoded arm A must not appear


# ── 3. parse_filter_query — mocked client, never calls real API ───────────────


def test_parse_filter_query_arm_extracted():
    client = make_mock_client('{"arm": "A", "dose": "all", "tumor_type": "HNSCC"}')
    result = parse_filter_query(
        'Show Arm A patients with HNSCC',
        client=client,
        valid_arms=VALID_ARMS,
        valid_doses=VALID_DOSES,
        valid_tumors=VALID_TUMORS,
    )
    assert result['arm'] == 'A'
    assert result['tumor_type'] == 'HNSCC'


def test_parse_filter_query_dose_int_from_model_normalized():
    # Model returns integer 1800 — must emerge as string "1800" from the pipeline.
    # arm=all, dose=1800, tumor=all is NOT all-all-all (dose is specific) so
    # validate_filters must pass and return dose as a string.
    client = make_mock_client('{"arm": "all", "dose": 1800, "tumor_type": "all"}')
    result = parse_filter_query(
        '1800mg patients',
        client=client,
        valid_arms=VALID_ARMS,
        valid_doses=VALID_DOSES,
        valid_tumors=VALID_TUMORS,
    )
    assert result['dose'] == '1800'
    assert isinstance(result['dose'], str)


def test_parse_filter_query_empty_query_raises_before_llm_call():
    client = make_mock_client('{}')
    with pytest.raises(ValueError, match='empty'):
        parse_filter_query(
            '',
            client=client,
            valid_arms=VALID_ARMS,
            valid_doses=VALID_DOSES,
            valid_tumors=VALID_TUMORS,
        )
    client.messages.create.assert_not_called()


def test_parse_filter_query_bad_json_raises_valueerror():
    client = make_mock_client('Sorry, I cannot help with that.')
    with pytest.raises(ValueError, match='non-JSON'):
        parse_filter_query(
            'Some ambiguous query',
            client=client,
            valid_arms=VALID_ARMS,
            valid_doses=VALID_DOSES,
            valid_tumors=VALID_TUMORS,
        )


def test_parse_filter_query_unsupported_raises_valueerror():
    client = make_mock_client(
        '{"arm": "all", "dose": "all", "tumor_type": "all", "unsupported": true}'
    )
    with pytest.raises(ValueError, match='not supported'):
        parse_filter_query(
            'Hide patients with tumour shrinkage greater than 30%',
            client=client,
            valid_arms=VALID_ARMS,
            valid_doses=VALID_DOSES,
            valid_tumors=VALID_TUMORS,
        )


# ── 4. POST /ai-filter endpoint — Flask test client ───────────────────────────


@pytest.fixture
def ai_client():
    # Yields only the Flask test client. monkeypatch is a built-in pytest
    # fixture — tests that need it declare it directly as a parameter.
    app_module.app.config['TESTING'] = True
    with app_module.app.test_client() as c:
        yield c


def test_ai_filter_endpoint_missing_body_returns_400(ai_client):
    r = ai_client.post('/ai-filter', content_type='application/json')
    assert r.status_code == 400
    assert 'error' in r.get_json()


def test_ai_filter_endpoint_empty_query_returns_400(ai_client):
    r = ai_client.post('/ai-filter', json={'query': ''})
    assert r.status_code == 400


def test_ai_filter_endpoint_valid_response_returns_200(ai_client, monkeypatch):
    mock_client = make_mock_client(
        '{"arm": "B", "dose": "all", "tumor_type": "HNSCC"}'
    )
    monkeypatch.setattr(app_module, '_anthropic_client', mock_client)
    r = ai_client.post('/ai-filter', json={'query': 'Show Arm B HNSCC patients'})
    assert r.status_code == 200
    body = r.get_json()
    assert body['arm'] == 'B'
    assert body['tumor_type'] == 'HNSCC'
    assert 'dose' in body


def test_ai_filter_endpoint_bad_llm_json_returns_400(ai_client, monkeypatch):
    mock_client = make_mock_client('not json at all')
    monkeypatch.setattr(app_module, '_anthropic_client', mock_client)
    r = ai_client.post('/ai-filter', json={'query': 'some query'})
    assert r.status_code == 400
    assert 'error' in r.get_json()
