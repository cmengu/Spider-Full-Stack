import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / '.env')

from flask import Flask, jsonify, request
from flask_cors import CORS

# Explicit sys.path so `from data import load_data` works regardless of invocation:
# flask --app backend/app from root, python app.py from backend/, or pytest
sys.path.insert(0, str(Path(__file__).parent))

from data import load_data

import anthropic
from ai_filter import parse_filter_query

app = Flask(__name__)
CORS(app, origins=[re.compile(r'http://localhost:\d+')])

try:
    df = load_data()
except Exception as e:
    print(f'[ERROR] Failed to load spiderplot.csv: {e}')
    print('[ERROR] Make sure backend/spiderplot.csv exists (copy from assignment/)')
    raise

# Set comprehensions cast to plain Python types — numpy.int64 is not JSON-serializable
VALID_ARMS = {str(a) for a in df['arm'].unique()}
VALID_DOSES = {int(d) for d in df['dose'].unique()}
VALID_TUMORS = {str(t) for t in df['tumor_type'].unique()}

# Anthropic client: max_retries=1 so worst-case backend time (5s × 2) stays under
# the frontend's AbortSignal.timeout(12000ms). Created once at startup.
_anthropic_client = anthropic.Anthropic(max_retries=1)

# Fixed response shape — tuple so accidental mutation cannot add columns silently
RESPONSE_COLUMNS = ('subject_id', 'arm', 'days', 'change', 'dose', 'tumor_type')

print(f'[startup] Loaded {len(df)} rows, {df["subject_id"].nunique()} patients')
print(f'[startup] Valid: arms={sorted(VALID_ARMS)} doses={sorted(VALID_DOSES)} tumors={sorted(VALID_TUMORS)}')


@app.route('/spider')
def spider():
    arms = request.args.get('arms', '')
    doses = request.args.get('doses', '')
    tumor_types = request.args.get('tumor_types', '')

    filtered = df  # reference only — boolean indexing below never mutates df

    if arms:
        # Drop empty tokens so trailing commas (?arms=A, or ?arms=,) do not 400
        arm_list = [a.strip() for a in arms.split(',') if a.strip()]
        if arm_list:
            invalid = set(arm_list) - VALID_ARMS
            if invalid:
                return jsonify({'error': f'Invalid arms: {sorted(invalid)}'}), 400
            filtered = filtered[filtered['arm'].isin(arm_list)]

    if doses:
        dose_list = [
            d.strip() for d in doses.split(',') if d.strip()
        ]
        if dose_list:
            try:
                dose_list = [int(d) for d in dose_list]
            except ValueError:
                return jsonify({'error': 'Doses must be integers'}), 400
            invalid = set(dose_list) - VALID_DOSES
            if invalid:
                return jsonify({'error': f'Invalid doses: {sorted(invalid)}'}), 400
            filtered = filtered[filtered['dose'].isin(dose_list)]

    if tumor_types:
        tumor_list = [
            t.strip() for t in tumor_types.split(',') if t.strip()
        ]
        if tumor_list:
            invalid = set(tumor_list) - VALID_TUMORS
            if invalid:
                return jsonify({'error': f'Invalid tumor types: {sorted(invalid)}'}), 400
            filtered = filtered[filtered['tumor_type'].isin(tumor_list)]

    # .copy() here is correct — we mutate result (days, change columns) below
    # list() — pandas treats a tuple of labels as one MultiIndex key, not multiple columns
    result = filtered[list(RESPONSE_COLUMNS)].copy()
    result['days'] = result['days'].astype(int).astype(str)
    result['change'] = result['change'].round(6)

    return jsonify(result.to_dict(orient='records'))


@app.route('/ai-filter', methods=['POST'])
def ai_filter():
    body = request.get_json(silent=True)
    if not body or 'query' not in body:
        return jsonify({'error': 'Missing query'}), 400
    query = body.get('query', '')
    if not isinstance(query, str) or not query.strip():
        return jsonify({'error': 'Query must be a non-empty string'}), 400
    try:
        filters = parse_filter_query(
            query,
            client=_anthropic_client,
            valid_arms=VALID_ARMS,
            valid_doses=VALID_DOSES,
            valid_tumors=VALID_TUMORS,
        )
        return jsonify(filters)
    except ValueError as exc:
        # ValueError = client-caused problem (bad query, unsupported type, invalid LLM output)
        return jsonify({'error': str(exc)}), 400
    except Exception:
        # Unexpected failure — never leak internal details
        return jsonify({'error': 'AI filter unavailable. Please try again.'}), 500


if __name__ == '__main__':
    app.run(port=5001, debug=os.environ.get('FLASK_DEBUG', 'false').lower() == 'true')
