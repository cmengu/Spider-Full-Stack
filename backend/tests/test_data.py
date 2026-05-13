"""Tests for data.load_data — run from repo: cd backend && ./venv/bin/pytest"""

import pytest

import data as data_module


def test_load_data_returns_expected_row_and_patient_counts():
    # Data integrity snapshot — tests the committed CSV, not load_data() behaviour.
    # If spiderplot.csv is updated with new patients, update these counts to match.
    assert data_module.CSV_PATH.exists(), 'backend/spiderplot.csv must exist'
    df = data_module.load_data()
    assert len(df) == 58
    assert df['subject_id'].nunique() == 10


def test_load_data_no_nulls_in_critical_columns():
    df = data_module.load_data()
    cols = ['subject_id', 'arm', 'days', 'change', 'dose', 'tumor_type']
    assert not df[cols].isnull().any().any()


def test_load_data_dose_is_integer_dtype():
    df = data_module.load_data()
    assert df['dose'].dtype == 'int64'


def test_load_data_raises_when_required_columns_missing(tmp_path, monkeypatch):
    bad = tmp_path / 'bad.csv'
    bad.write_text('subject_id,days\nx,1\n', encoding='utf-8')
    monkeypatch.setattr(data_module, 'CSV_PATH', bad)
    with pytest.raises(ValueError, match='missing required columns'):
        data_module.load_data()
