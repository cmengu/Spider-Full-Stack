import re
import sys
from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS

# Explicit sys.path so `from data import load_data` works regardless of invocation:
# flask --app backend/app from root, python app.py from backend/, or pytest
sys.path.insert(0, str(Path(__file__).parent))

from data import load_data

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

# Exactly the 6 columns the assignment spec requires
RESPONSE_COLUMNS = ['subject_id', 'arm', 'days', 'change', 'dose', 'tumor_type']

print(f'[startup] Loaded {len(df)} rows, {df["subject_id"].nunique()} patients')
print(f'[startup] Valid: arms={sorted(VALID_ARMS)} doses={sorted(VALID_DOSES)} tumors={sorted(VALID_TUMORS)}')


@app.route('/spider')
def spider():
    arms = request.args.get('arms', '')
    doses = request.args.get('doses', '')
    tumor_types = request.args.get('tumor_types', '')

    filtered = df  # reference only — boolean indexing below never mutates df

    if arms:
        arm_list = [a.strip() for a in arms.split(',')]
        invalid = set(arm_list) - VALID_ARMS
        if invalid:
            return jsonify({'error': f'Invalid arms: {sorted(invalid)}'}), 400
        filtered = filtered[filtered['arm'].isin(arm_list)]

    if doses:
        try:
            dose_list = [int(d.strip()) for d in doses.split(',')]
        except ValueError:
            return jsonify({'error': 'Doses must be integers'}), 400
        invalid = set(dose_list) - VALID_DOSES
        if invalid:
            return jsonify({'error': f'Invalid doses: {sorted(invalid)}'}), 400
        filtered = filtered[filtered['dose'].isin(dose_list)]

    if tumor_types:
        tumor_list = [t.strip() for t in tumor_types.split(',')]
        invalid = set(tumor_list) - VALID_TUMORS
        if invalid:
            return jsonify({'error': f'Invalid tumor types: {sorted(invalid)}'}), 400
        filtered = filtered[filtered['tumor_type'].isin(tumor_list)]

    # .copy() here is correct — we mutate result (days, change columns) below
    result = filtered[RESPONSE_COLUMNS].copy()
    result['days'] = result['days'].astype(int).astype(str)
    result['change'] = result['change'].round(6)

    return jsonify(result.to_dict(orient='records'))


if __name__ == '__main__':
    app.run(port=5001, debug=True)
