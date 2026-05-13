from pathlib import Path

import pandas as pd

CSV_PATH = Path(__file__).parent / 'spiderplot.csv'

REQUIRED_COLUMNS = {'subject_id', 'arm', 'days', 'change', 'dose', 'tumor_type'}


def load_data() -> pd.DataFrame:
    df = pd.read_csv(CSV_PATH)

    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(f'spiderplot.csv is missing required columns: {missing}')

    df = df.dropna(subset=['subject_id', 'days', 'change', 'dose'])

    for col in ['subject_id', 'arm', 'tumor_type']:
        df[col] = df[col].astype(str).str.strip()
    df = df[df['subject_id'] != '']

    df['days'] = pd.to_numeric(df['days'], errors='coerce')
    df['change'] = pd.to_numeric(df['change'], errors='coerce')
    df['dose'] = pd.to_numeric(df['dose'], errors='coerce')

    df = df.dropna(subset=['days', 'change', 'dose'])

    df['dose'] = df['dose'].astype(int)

    return df
