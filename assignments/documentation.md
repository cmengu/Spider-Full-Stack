# Build Documentation

---

## Phase 1: Skeleton

**Goal:** Get both servers running and talking to each other before writing any real logic. Always have a working app at every stage.

### What was built

- Monorepo structure with `backend/` and `frontend/` under the project root
- Flask app on port 5001 with a single `GET /spider` returning a hardcoded `[]`
- Vite + React app on port 5173
- Root `package.json` with `concurrently` wiring up `npm run dev` to start both servers with one command
- Vite dev proxy forwarding `/api/*` → Flask, stripping the `/api` prefix before it reaches Flask

### Folder structure at end of Phase 1

```
Interview-assignment/
├── backend/
│   ├── app.py
│   ├── requirements.txt
│   └── venv/
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── vite.config.js
│   └── package.json
├── package.json         # root — concurrently
└── .gitignore
```

### Decisions made

**`.gitignore` created first before any installs**
`venv/`, `__pycache__/`, `node_modules/`, `.env` were gitignored before `pip install` or `npm install` ran so nothing sensitive was ever staged.

**Flask on port 5001, not 5000**
macOS AirPlay Receiver occupies port 5000 by default. Flask is started on 5001 to avoid the conflict.

**Plain `venv` inside `backend/`, not conda**
pip was coming from miniconda base. A plain `python3 -m venv backend/venv` was used instead to keep the project self-contained — reviewers can `pip install -r requirements.txt` without needing conda.

**venv activated via direct binary path in `concurrently`, not `source activate`**
`source venv/bin/activate` does not work reliably inside `concurrently` on zsh. The dev script calls the venv binary directly instead:
```json
"backend/venv/bin/flask --app backend/app run --port 5001"
```

**CORS configured from day 1**
`flask-cors` was wired up in `app.py` before anything else. Without it the frontend fetch would fail with a CORS error and the Phase 1 milestone could not be verified. CORS allows any localhost port using a regex to match the assignment spec (`http://localhost:*`):
```python
CORS(app, origins=[re.compile(r'http://localhost:\d+')])
```

**Vite proxy configured from day 1**
`vite.config.js` was updated with the proxy before writing any frontend fetch calls. This means the frontend always uses relative paths like `fetch('/api/spider')` and never has a hardcoded port — the Vite dev server is the single entry point.

**Flask route is `GET /spider`, not `GET /api/spider`**
The assignment spec defines the endpoint as `GET /spider`. The `/api` prefix only exists in the frontend as a proxy signal. The Vite proxy rewrites the path before forwarding to Flask — Flask never sees `/api`.

### Bugs and issues encountered

**Double `API response: []` in the browser console**
Seen as two identical log lines in DevTools. Caused by React 18 `StrictMode` which deliberately mounts every component twice in development to surface side effects. This is intentional behaviour, not a bug. It only happens in dev — never in production. `<StrictMode>` is in `main.jsx` and should be left in.

**`Import "flask_cors" could not be resolved` Pylance warning in VS Code**
VS Code's Pylance extension was using the system Python interpreter, which does not have `flask-cors` installed. Fixed by pointing VS Code to the venv interpreter: `Python: Select Interpreter` → `backend/venv/bin/python`. No code change needed — the code ran correctly throughout.

**`GET /api/spider` returning 404 on Flask**
Flask logged a 404 for `GET /api/spider`. This happened because the request was made directly to `http://localhost:5001/api/spider`, bypassing the Vite proxy. Flask only has the route `/spider` — calling it with the `/api` prefix returns 404 as expected. The correct access pattern is always through the Vite dev server on port 5173, never directly to Flask on 5001 during development.

| Caller | URL | Result |
|--------|-----|--------|
| Browser / frontend | `http://localhost:5173/api/spider` | Vite proxy strips `/api` → Flask `/spider` → 200 ✓ |
| Direct to Flask | `http://localhost:5001/spider` | 200 ✓ |
| Direct to Flask | `http://localhost:5001/api/spider` | 404 — no such route |

### Milestone achieved

- `npm run dev` from the project root starts both servers with one command
- `http://localhost:5001/spider` returns `[]` directly from Flask
- `http://localhost:5173/api/spider` returns `[]` via the Vite proxy
- Browser console at `http://localhost:5173` shows `API response: []` confirming the React `useEffect` fires, the fetch hits Flask through the proxy, and the response is received

---

## Phase 2: Data layer — `data.py` (Step 8)

**Goal:** One place owns CSV loading and cleaning. The Flask route will import this later; until then, `app.py` can still return `[]` on purpose so this step stays a **separate, verifiable commit** (per plan: do not batch with wiring `load_data()` into routes).

### What was built

- **`backend/data.py`** — `load_data() -> pd.DataFrame` reads `backend/spiderplot.csv`, validates schema, cleans rows, coerces types, returns a DataFrame ready for filtering / API column selection.
- **`backend/spiderplot.csv`** — copy of the dataset from `assignment/spiderplot.csv`. The `assignment/` tree is gitignored in this repo; the **backend copy is committed** so anyone who clones the repo gets the CSV without an extra copy step.
- **Automated tests** — `backend/tests/test_data.py`, `backend/pytest.ini`, and **`pytest==8.3.5`** in `backend/requirements.txt`. Run: `cd backend && ./venv/bin/pytest -v`.
- **`.gitignore`** — `backend/.pytest_cache/` added so pytest’s cache is not committed.

**Not in this step (deliberate):** Importing `load_data()` inside `app.py` or printing startup stats. The step-08 plan defers that to the next wiring step; adding a `[startup] Loaded … rows` line in `app.py` after `df = load_data()` is still recommended when the route is connected.

### Folder structure after Step 8 (data-related files)

```
backend/
├── app.py              # unchanged in Step 8 — still returns [] until wired
├── data.py             # load_data()
├── spiderplot.csv      # committed dataset
├── requirements.txt    # includes pytest
├── pytest.ini          # pythonpath = ., testpaths = tests
├── tests/
│   └── test_data.py
└── venv/
```

### Decisions and rationale (from Step 8 plan)

**Separate `data.py` from `app.py` (single responsibility)**  
HTTP (routes, query params, `jsonify`) stays in `app.py`; CSV semantics, types, and row hygiene stay in `data.py`. That way cleaning logic is testable with **pytest only**, without a Flask test client.

**Path-independent CSV path — `Path(__file__).parent / 'spiderplot.csv'`**  
A path like `'backend/spiderplot.csv'` depends on the process **current working directory**. If someone runs Flask from `backend/` vs repo root, a relative path breaks. Resolving from `__file__` is **zero CWD dependency**: the CSV always sits next to `data.py`.

**Explicit copy: `assignment/spiderplot.csv` → `backend/spiderplot.csv`**  
The plan calls out that “copy the file” must be a real subtask, not a vague note. The app’s contract is “CSV next to `data.py` in `backend/`.” Also decided to just put the csv file in the root folder because its jsut one file, if there are multiple i will create a data folder instead. 

**Fail-fast schema check — `REQUIRED_COLUMNS - set(df.columns)`**  
If the CSV is swapped or renamed, failing at the top of `load_data()` with a clear `ValueError` beats a cryptic `KeyError` deep in `dropna()`.

**Strip `subject_id`, `arm`, `tumor_type` after `astype(str)`**  
Leading/trailing spaces on categorical fields cause **silent wrong filters** (empty results, no exception). Stripping all filter-relevant string columns avoids that class of bug.

**`dropna` + `to_numeric(..., errors='coerce')` + second `dropna` on numerics**  
Rows with bad or missing numbers become NaN during coercion and are dropped before assumptions (e.g. int dose) apply.

**`dose` as plain `int`, not pandas nullable `Int64`**  
Nullable `Int64` and some numpy scalars are awkward for `flask.jsonify`. After the final `dropna`, `dose` has no NaNs; **`.astype(int)`** is JSON-safe and simpler than casting only at response time.

**Type hint `-> pd.DataFrame`**  
Documents the contract for callers and IDE tooling.

**Extra CSV columns (`first_dose`, `date`, `response`) remain on the DataFrame**  
`load_data()` does **not** drop those columns; the **API route** (when implemented) should select exactly the six assignment columns. That keeps loading faithful to the file while keeping the HTTP contract explicit in one place.

**Pytest tests**  
- Integration-style checks against the real committed CSV: **58 rows**, **10 patients**, no nulls in critical columns, `dose` dtype `int64`.  
- **Unhappy path:** temporary CSV missing required columns → `ValueError` via `monkeypatch` on `CSV_PATH`.  
This matches the plan’s emphasis on fail-fast behaviour and regression safety without coupling tests to Flask.

### Verification commands

**Quick script (same idea as plan Subtask 8c):**

```bash
cd /path/to/Interview-assignment && backend/venv/bin/python3 -c "
import sys
sys.path.insert(0, 'backend')
from data import load_data
df = load_data()
print('rows:', len(df), 'patients:', df['subject_id'].nunique())
"
```

**Expected after cleaning:** `rows: 58`, `patients: 10` (47 empty / invalid rows removed from the raw CSV, per data inspection in the plan thread).

**Unit tests:**

```bash
cd backend && ./venv/bin/pytest -v
```

**Import note for one-off scripts:** Use `sys.path.insert(0, 'backend')` then `from data import load_data` — there is no `backend/__init__.py`, so `from backend.data import ...` is not the right pattern for a standalone snippet.

### Git checkpoint (Step 8)

First commit for this step included **`backend/data.py`** and **`backend/spiderplot.csv`** only (per plan: no `app.py` wiring in the same batch).

**Follow-up:** `pytest`, `pytest.ini`, and `backend/tests/test_data.py` were added so `cd backend && ./venv/bin/pytest -v` is repeatable before the API route consumes `load_data()`.

---

## Step 9: `GET /spider` — wire `data.py` into Flask (`app.py`)

**Goal:** Replace the Phase 1 stub with a real **`GET /spider`** that reads the cleaned DataFrame from **`load_data()`**, accepts **`arms`**, **`doses`**, and **`tumor_types`** as comma-separated query parameters, validates them against values **derived from the loaded data**, and returns JSON that matches the assignment contract (six columns only, correct types, sensible HTTP errors).

### What was built

- **Startup load** — `df = load_data()` once at import time (inside `try`/`except` with a short printed hint if the CSV is missing, then re-raise). Startup logs print row count, patient count, and sorted **`VALID_*`** sets for quick sanity checks.
- **Query parameters** — `arms`, `doses`, `tumor_types` are optional; each may list multiple values separated by commas. Filters are applied in sequence on the same working **`filtered`** slice (logical AND across dimensions).
- **Validation** — Unknown arms, doses, or tumor types return **400** with **`jsonify({'error': '...'})`**. Dose tokens that are not valid integers after stripping return **400** (`Doses must be integers`). Valid filters that match no rows return **200** with **`[]`** (empty intersection is not an error).
- **Response shape** — Exactly six fields per object: `subject_id`, `arm`, `days`, `change`, `dose`, `tumor_type`. Extra columns from the CSV (`first_dose`, `date`, `response`, etc.) never appear in the payload. **`days`** is serialized as a **string** (via `astype(int).astype(str)`). **`change`** is rounded to six decimal places for stable JSON.
- **Edge case: trailing commas and blank tokens** — Tokens are parsed with `if segment.strip()` so natural typos like `?arms=A,` or `?doses=1800,` do not produce empty entries, spurious **400**s, or `int('')`. If every token is empty after stripping (e.g. `?arms=,`), the filter is **skipped** (same as omitting the parameter). An inner **`if arm_list:`** / **`if dose_list:`** / **`if tumor_list:`** ensures we never call **`.isin([])`**, which would incorrectly return zero rows.
- **Constants** — **`RESPONSE_COLUMNS`** is a **tuple** (fixed contract, not accidentally mutable). Pandas column indexing uses **`filtered[list(RESPONSE_COLUMNS)]`** because a **tuple of column names** in **`df[tuple]`** is interpreted as a **single MultiIndex label**, not as multiple columns.

### Decisions and rationale (Step 9 plan + follow-ups)

**Explicit `sys.path.insert(0, str(Path(__file__).parent))` before `from data import load_data`**  
Flask’s CLI may add the app directory to `sys.path`, but that is not something to rely on for `python app.py`, one-off scripts, or pytest importing the app module. Making the import path explicit keeps **`from data import load_data`** working from repo root, `backend/`, and tests.

**`VALID_ARMS`, `VALID_DOSES`, `VALID_TUMORS` derived from `df`, not literals**  
The set of legal filter values is a fact about the cleaned dataset. Duplicating it in `app.py` would eventually drift from `data.py`. Sets use **`str(...)`** and **`int(...)`** so membership checks use plain Python types (**`numpy.int64`** in sets is awkward for JSON and comparisons).

**`filtered = df` per request; copy only when building the response**  
The route does **not** copy the full frame on every request. Boolean indexing returns a view-backed slice; **`filtered[...].copy()`** is used only for the small result so mutating **`days`** / **`change`** does not touch the shared **`df`**.

**Tumor filter must apply `isin(tumor_list)`**  
Validating `tumor_types` but forgetting to filter the frame would return all rows — a silent, hard-to-spot bug. The plan called this out explicitly; the implementation always narrows **`filtered`** when **`tumor_list`** is non-empty.

**Error payloads use `sorted(invalid)`**  
Sets in f-strings look like Python **`{...}`** in JSON; sorting gives a predictable, API-friendly list in the message text.

**Integration verification script hygiene**  
When Flask is started in the background for curl-based checks, a bash **`trap 'kill $FLASK_PID' EXIT`** immediately after **`FLASK_PID=$!`** ensures the server is torn down on success, failed **`assert`**, or **Ctrl-C**, avoiding **“address already in use”** on the next run.

**Row counts in manual checks are dataset-dependent**  
For example, **`?tumor_types=HNSCC`** returns **every** HNSCC row in the **committed** CSV — the plan once assumed a smaller count from an older slice of the data. Verification should assert **correct filtering** (e.g. all returned rows have `tumor_type == 'HNSCC'`) and/or compare counts to **`load_data()`**, not a hard-coded row count tied to a specific CSV revision.

### Folder structure after Step 9

`backend/app.py` is the only application file that changes in this step; **`data.py`**, CSV, and tests stay as in Step 8.

```
backend/
├── app.py              # GET /spider — load_data(), filters, validation, jsonify
├── data.py
├── spiderplot.csv
├── tests/
│   └── test_data.py
└── ...
```

### Verification

**Flask test client (no server port):** import **`app`** with **`sys.path.insert(0, 'backend')`**, then **`app.test_client().get('/spider?...')`** to assert status codes, column keys, **`days`** type, and dynamic filter counts against **`app.df`**.

**Manual / plan-style checks** (from repo root, with venv):

```bash
backend/venv/bin/flask --app backend/app run --port 5001 &
FLASK_PID=$!
trap "kill $FLASK_PID 2>/dev/null" EXIT
until curl -s http://localhost:5001/spider > /dev/null 2>&1; do sleep 0.3; done

curl -s "http://localhost:5001/spider" | python3 -c "import sys,json; d=json.load(sys.stdin); assert len(d)==58"
curl -s "http://localhost:5001/spider?arms=Z" -o /dev/null -w "%{http_code}\n"   # expect 400
curl -s "http://localhost:5001/spider?arms=A&doses=3000" | python3 -c "import sys,json; assert json.load(sys.stdin)==[]"
```

Existing data tests still apply: **`cd backend && ./venv/bin/pytest -v`**.

### Git checkpoint (Step 9)

Commit **`backend/app.py`** after the route matches the contract (Step 9 plan: do not batch with the next frontend milestone unless the roadmap says otherwise).
