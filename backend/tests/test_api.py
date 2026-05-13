"""
Tests for GET /spider.

Grouped by concern:
  1. Response contract  — shape, types, columns
  2. Filter correctness — each filter actually narrows results
  3. Input validation   — invalid values return 400, not 500
  4. Edge cases         — empty params, commas, whitespace, case
  5. Combined filters   — AND logic, empty intersections
  6. State isolation    — df not mutated between requests
  7. Security           — injection attempts never reach pandas
"""

import app as app_module


# ── 1. Response contract ──────────────────────────────────────────────────────


def test_returns_all_rows_when_no_params(client):
    r = client.get('/spider')
    assert r.status_code == 200
    assert len(r.get_json()) == 5


def test_response_is_a_list_not_an_object(client):
    r = client.get('/spider')
    assert isinstance(r.get_json(), list)


def test_returns_exactly_six_columns(client):
    r = client.get('/spider')
    row = r.get_json()[0]
    assert set(row.keys()) == {
        'subject_id',
        'arm',
        'days',
        'change',
        'dose',
        'tumor_type',
    }


def test_does_not_leak_extra_columns(client):
    r = client.get('/spider')
    row = r.get_json()[0]
    for forbidden in ('first_dose', 'date', 'response'):
        assert forbidden not in row, f'column {forbidden!r} should not be in response'


def test_days_is_string_not_int(client):
    r = client.get('/spider')
    for row in r.get_json():
        assert isinstance(row['days'], str), (
            f"days should be str, got {type(row['days']).__name__} for row {row}"
        )


def test_dose_is_int_not_string(client):
    r = client.get('/spider')
    for row in r.get_json():
        assert isinstance(row['dose'], int), (
            f"dose should be int, got {type(row['dose']).__name__}"
        )


def test_change_is_float(client):
    r = client.get('/spider')
    for row in r.get_json():
        assert isinstance(row['change'], float), (
            f"change should be float, got {type(row['change']).__name__}"
        )


# ── 2. Filter correctness ─────────────────────────────────────────────────────


def test_arm_filter_returns_only_matching_rows(client):
    r = client.get('/spider?arms=A')
    data = r.get_json()
    assert all(row['arm'] == 'A' for row in data)


def test_arm_filter_returns_correct_count(client):
    # sample_df: Arm A = 3 rows — if filter broken, returns 5
    r = client.get('/spider?arms=A')
    assert len(r.get_json()) == 3


def test_dose_filter_returns_only_matching_rows(client):
    r = client.get('/spider?doses=1800')
    data = r.get_json()
    assert all(row['dose'] == 1800 for row in data)


def test_dose_filter_returns_correct_count(client):
    # sample_df: dose 1800 = 3 rows — if filter broken, returns 5
    r = client.get('/spider?doses=1800')
    assert len(r.get_json()) == 3


def test_tumor_type_filter_actually_filters(client):
    # Cycles the bug: tumor_types validated but filter line missing → all rows.
    r = client.get('/spider?tumor_types=HNSCC')
    data = r.get_json()
    assert len(data) == 2, (
        f'expected 2 HNSCC rows, got {len(data)} — '
        f'check that filtered = filtered[filtered["tumor_type"].isin(tumor_list)] exists'
    )
    assert all(row['tumor_type'] == 'HNSCC' for row in data)


def test_tumor_type_filter_returns_only_matching_rows(client):
    r = client.get('/spider?tumor_types=sqNSCLC')
    data = r.get_json()
    assert all(row['tumor_type'] == 'sqNSCLC' for row in data)


# ── 3. Input validation ───────────────────────────────────────────────────────


def test_invalid_arm_returns_400(client):
    r = client.get('/spider?arms=Z')
    assert r.status_code == 400


def test_invalid_arm_error_has_error_key(client):
    r = client.get('/spider?arms=Z')
    body = r.get_json()
    assert 'error' in body


def test_invalid_arm_error_message_no_python_set_notation(client):
    r = client.get('/spider?arms=Z')
    msg = r.get_json()['error']
    assert '{' not in msg and '}' not in msg, (
        f'error message contains Python set notation: {msg!r}'
    )


def test_invalid_dose_non_integer_returns_400(client):
    r = client.get('/spider?doses=abc')
    assert r.status_code == 400


def test_invalid_dose_negative_returns_400(client):
    r = client.get('/spider?doses=-1800')
    assert r.status_code == 400


def test_invalid_dose_zero_returns_400(client):
    r = client.get('/spider?doses=0')
    assert r.status_code == 400


def test_invalid_dose_float_returns_400(client):
    r = client.get('/spider?doses=1800.5')
    assert r.status_code == 400


def test_invalid_dose_very_large_returns_400(client):
    r = client.get('/spider?doses=99999999999999999999')
    assert r.status_code == 400


def test_invalid_tumor_type_returns_400(client):
    r = client.get('/spider?tumor_types=UnknownType')
    assert r.status_code == 400


# ── 4. Edge cases: empty, whitespace, commas, case ───────────────────────────


def test_empty_arm_param_returns_all(client):
    r = client.get('/spider?arms=')
    assert len(r.get_json()) == 5


def test_whitespace_only_arm_param_returns_all(client):
    r = client.get('/spider?arms=   ')
    assert len(r.get_json()) == 5


def test_trailing_comma_arm_returns_filtered_not_400(client):
    r = client.get('/spider?arms=A,')
    assert r.status_code == 200
    assert len(r.get_json()) == 3


def test_double_comma_arm_param_skips_blank_token(client):
    r = client.get('/spider?arms=A,,B')
    assert r.status_code == 200


def test_arm_with_spaces_around_comma(client):
    r = client.get('/spider?arms=A, B')
    assert r.status_code == 200
    assert len(r.get_json()) == 5


def test_lowercase_arm_returns_400_not_empty_array(client):
    r = client.get('/spider?arms=a')
    assert r.status_code == 400


# ── 5. Combined filters and empty results ────────────────────────────────────


def test_empty_intersection_returns_200_with_empty_array(client):
    r = client.get('/spider?arms=A&doses=3000')
    assert r.status_code == 200
    assert r.get_json() == []


def test_all_three_filters_combined_returns_correct_rows(client):
    r = client.get('/spider?arms=A&doses=1800&tumor_types=sqNSCLC')
    data = r.get_json()
    assert len(data) == 2
    assert all(row['arm'] == 'A' for row in data)
    assert all(row['dose'] == 1800 for row in data)
    assert all(row['tumor_type'] == 'sqNSCLC' for row in data)


def test_all_three_filters_no_intersection_returns_empty(client):
    r = client.get('/spider?arms=B&doses=1800&tumor_types=HNSCC')
    assert r.get_json() == []


# ── 6. State isolation ────────────────────────────────────────────────────────


def test_df_not_mutated_after_filtered_request(client, sample_df):
    r = client.get('/spider?arms=A')
    assert r.status_code == 200
    assert len(app_module.df) == len(sample_df), (
        'module-level df was mutated by a filtered request — '
        'filtered = df.copy() was used somewhere instead of filtered = df'
    )


def test_consecutive_requests_are_independent(client):
    client.get('/spider?arms=A')
    r2 = client.get('/spider')
    assert len(r2.get_json()) == 5


# ── 7. Security ───────────────────────────────────────────────────────────────


def test_special_characters_in_arm_returns_400(client):
    r = client.get("/spider?arms=A'; DROP TABLE patients;--")
    assert r.status_code == 400


def test_html_characters_in_tumor_type_returns_400(client):
    r = client.get('/spider?tumor_types=<script>alert(1)</script>')
    assert r.status_code == 400


def test_invalid_tumor_type_error_is_valid_json(client):
    r = client.get('/spider?tumor_types=<script>alert(1)</script>')
    assert r.get_json() is not None
    assert 'error' in r.get_json()
