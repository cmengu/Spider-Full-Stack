"""Shared fixtures for API tests — patch app.df and VALID_* from the same sample frame."""

import pytest
import pandas as pd

import app as app_module


@pytest.fixture
def sample_df():
    """
    5 rows, 3 patients — structured so filter correctness is unambiguous:
      Arm A: 3 rows | Arm B: 2 rows
      Dose 1800: 3 rows | Dose 3000: 2 rows
      sqNSCLC: 2 rows | nsNSCLC: 1 row | HNSCC: 2 rows
      A+3000: 0 rows | B+1800: 0 rows  (both empty intersections testable)
    """
    return pd.DataFrame(
        [
            {
                'subject_id': '08-201',
                'arm': 'A',
                'dose': 1800,
                'days': 47.0,
                'change': -1.619831,
                'tumor_type': 'sqNSCLC',
            },
            {
                'subject_id': '08-201',
                'arm': 'A',
                'dose': 1800,
                'days': 101.0,
                'change': 6.120192,
                'tumor_type': 'sqNSCLC',
            },
            {
                'subject_id': '08-202',
                'arm': 'A',
                'dose': 1800,
                'days': 28.0,
                'change': -1.276388,
                'tumor_type': 'nsNSCLC',
            },
            {
                'subject_id': '08-203',
                'arm': 'B',
                'dose': 3000,
                'days': 43.0,
                'change': -2.166169,
                'tumor_type': 'HNSCC',
            },
            {
                'subject_id': '08-203',
                'arm': 'B',
                'dose': 3000,
                'days': 92.0,
                'change': 1.500000,
                'tumor_type': 'HNSCC',
            },
        ]
    )


@pytest.fixture
def client(sample_df, monkeypatch):
    """
    Patches df AND all VALID_* sets derived from it.
    Without patching VALID_*, tests are coupled to real CSV values — not isolated.
    """
    monkeypatch.setattr(app_module, 'df', sample_df)
    monkeypatch.setattr(
        app_module,
        'VALID_ARMS',
        {str(a) for a in sample_df['arm'].unique()},
    )
    monkeypatch.setattr(
        app_module,
        'VALID_DOSES',
        {int(d) for d in sample_df['dose'].unique()},
    )
    monkeypatch.setattr(
        app_module,
        'VALID_TUMORS',
        {str(t) for t in sample_df['tumor_type'].unique()},
    )
    app_module.app.config['TESTING'] = True
    with app_module.app.test_client() as c:
        yield c
