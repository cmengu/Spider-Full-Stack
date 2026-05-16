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

---

## Step 10: Manual curl verification

**Goal:** Confirm the live Flask server behaves identically to what the unit tests assert — same filters, same status codes, same JSON shape — before moving to the frontend.

### What was built

No new files. Step 9's bash verification script covers this entirely. Step 10 is complete when Step 9's 8-check script passes.

### Why this step exists at all

Unit tests run the route **in-process** via Flask's test client. Manual curl hits the **real server over a real socket**. They should agree — but occasionally they don't. Flask's test client bypasses WSGI middleware, OS-level socket limits, and CORS headers. A 2-minute curl pass catches the class of bug that only shows up when a real HTTP connection is involved.

### Decisions and rationale

**`trap "kill $FLASK_PID 2>/dev/null" EXIT` immediately after backgrounding Flask**  
Without a trap, any failing `assert` exits the script and leaves Flask running on port 5001. The next verification run then fails immediately with `OSError: address already in use`. The trap fires on **any** exit — success, failed assertion, Ctrl-C — so the port is always released.

**Poll until ready instead of `sleep 2`**  
```bash
until curl -s http://localhost:5001/spider > /dev/null 2>&1; do sleep 0.3; done
```
A fixed `sleep 2` is fragile: slow machines or cold venv startups may not be ready in time. Polling exits the moment Flask responds — faster on fast machines, safe on slow ones.

**Count assertions should compare filter correctness, not hardcoded numbers**  
An earlier draft asserted `?tumor_types=HNSCC` returns 5 rows. The real data has 31 HNSCC rows across 5 patients. Hardcoding row counts ties the verification to a specific CSV snapshot. The safer pattern is: assert all returned rows have `tumor_type == 'HNSCC'` (correctness), plus optionally cross-check count against `load_data()` at runtime rather than a constant.

### Milestone

All 8 curl checks pass: full dataset (58 rows), column set (6 keys), `days` type (string), arm filter, tumor filter, invalid arm (400), invalid dose (400), empty intersection (200 with `[]`).

---

## Step 11: pytest tests for `GET /spider`

**Goal:** Catch silent regressions in the route logic — validation, filtering, response shape, state isolation — without relying on a running server or the contents of the real CSV.

### What was built

- **`backend/tests/conftest.py`** — `sample_df` fixture (5 rows, 3 patients) and a `client` fixture that replaces the module-level `df` and all `VALID_*` sets with fixture-derived values for every test.
- **`backend/tests/test_api.py`** — 28 tests across 7 groups: response contract, filter correctness, input validation, edge cases, combined filters, state isolation, security.

### What the Flask test client actually does

`client.get('/spider?arms=Z')` does **not** start a server or open a socket. It calls the Flask app **in-process**, passing a fake WSGI request object directly to the routing layer. The `spider()` function runs exactly as it would under a real HTTP request — `request.args`, validation, pandas filtering, `jsonify` — and returns a response object the test can inspect.

This means every test is testing **`app.py` logic**: the split-strip-validate-filter-select pipeline. What varies is which branch of that pipeline each test exercises.

### Why `sample_df` instead of the real CSV

The real `df` has 58 rows. If `assert len(r.get_json()) == 32` breaks because a new patient was added to the CSV, the test suite has become a test of the *dataset*, not the *route logic*. `test_data.py` already covers data integrity against the real CSV; `test_api.py` should cover route behaviour.

`sample_df` is 5 rows you define. The counts are facts you control — they never drift. When `?arms=A` asserts 3 rows, a broken filter returning 5 is immediately caught, not masked by a coincidentally correct count.

**Why 5 rows, not 3:** With 3 rows a broken filter returning "all rows" and a working filter returning "correct rows" can produce the same count by coincidence. The 5-row fixture is structured so every filter has a unique expected count:

| Filter | Expected rows | What it catches if wrong |
|---|---|---|
| `?arms=A` | 3 | Filter returning all 5 |
| `?arms=B` | 2 | Filter returning all 5 |
| `?tumor_types=HNSCC` | 2 | The original missing-filter-line bug |
| `?arms=A&doses=3000` | 0 | AND logic failing |

### Why the `client` fixture patches `VALID_*` too — not just `df`

`VALID_ARMS`, `VALID_DOSES`, `VALID_TUMORS` are derived from `df` **at import time** — once, before any test runs. Patching only `df` leaves the validation sets pointing at the real CSV's values. The fixture data happens to use the same arms and doses as the real data, so tests pass — but for the wrong reason. If you needed a test row with `arm='C'` to verify validation rejects unknown values, the real `VALID_ARMS = {'A','B'}` would intercept it, not the fixture-derived one.

Patching all four attributes makes the test hermetic: the route sees exactly the DataFrame and validation sets the fixture defines, nothing from the real CSV.

### Why the simple approach (real CSV) is also valid for this take-home

The more complex fixture setup is correct in principle. But for a fixed 58-row CSV that never changes during the project, testing against real data with known counts is also defensible — and simpler to explain in the presentation:

> *"I tested against the real data with counts I verified during data inspection. The CSV is fixed for this take-home, so count assertions won't drift."*

The fixture approach is worth knowing because it shows you understand **test isolation** and **what you're actually testing**. The real-data approach is worth knowing because it shows **pragmatism**. Be ready to argue either direction.

### Decisions and rationale

**`import app as app_module` at the top of conftest, not inside the fixture**  
Module-level import makes the side effect (CSV load, startup prints) visible and explicit. Inside-fixture import hides it and implies the module is imported fresh per test — it isn't; Python caches module imports.

**`sys.path.insert` not needed in conftest**  
`pytest.ini` at `backend/pytest.ini` has `pythonpath = .`, which adds `backend/` to `sys.path` automatically. An explicit `sys.path.insert` in conftest is redundant and signals you don't know where the path is actually coming from.

**Test the assumption violations, not just the happy path**  
Every route has implicit assumptions. The tests are organised around violating those assumptions:

| Assumption the code makes | Test that violates it |
|---|---|
| Arms are case-sensitive | `?arms=a` → expect 400, not empty array |
| Dose tokens are parseable as int | `?doses=1800.5` → expect 400 |
| Flask takes first value for duplicate params | `?arms=A&arms=B` → only Arm A rows returned |
| Boolean indexing never mutates `df` | Check `len(app.df)` unchanged after a filtered request |
| Injection strings fail validation, not pandas | SQL injection → 400, not 500 |

**The one test that catches the original code's bug**  
```python
def test_tumor_type_filter_actually_filters(client):
    r = client.get('/spider?tumor_types=HNSCC')
    assert len(r.get_json()) == 2   # not 5 — proves filter ran
```
The original `app.py` draft validated `tumor_types` then forgot to apply the filter. This test fails immediately on the broken code and passes on the fix. A happy-path test that only checks `status_code == 200` would have missed it entirely.

**State isolation tests**  
```python
def test_df_not_mutated_after_filtered_request(client, sample_df):
    client.get('/spider?arms=A')
    assert len(app_module.df) == len(sample_df)  # still 5

def test_consecutive_requests_are_independent(client):
    client.get('/spider?arms=A')
    r2 = client.get('/spider')
    assert len(r2.get_json()) == 5  # not 3
```
These tests verify that `filtered = df` (a reference, not a copy) never writes back to `df`. If someone changed `filtered = df` to `filtered = df.copy()` and then accidentally assigned `df = filtered` after filtering, these tests catch it.

**Security tests return 400, not 500**  
SQL injection and XSS strings are not in `VALID_ARMS` or `VALID_TUMORS`. They hit the validation layer and return 400 before the injection string ever reaches pandas. A 500 would mean the validation was bypassed — the injection reached a pandas operation that crashed on unexpected input, which is worse than a clean 400.

### Folder structure after Step 11

```
backend/
├── app.py
├── data.py
├── spiderplot.csv
├── pytest.ini
├── tests/
│   ├── conftest.py       ← new
│   ├── test_data.py      ← existing (unchanged)
│   └── test_api.py       ← new
└── venv/
```

### Verification

```bash
cd /Users/ngchenmeng/Interview-assignment
backend/venv/bin/pytest backend/tests/ -v
```

All 32+ tests green (4 existing `test_data.py` + 28 new `test_api.py`).

### Git checkpoint (Step 11)

Commit **`backend/tests/conftest.py`** and **`backend/tests/test_api.py`** together after all tests pass.

---

## Phase 3: Frontend data pipeline (Steps 12–16)

**Goal:** Build the frontend data layer before writing any UI. The API returns flat rows — one row per patient per timepoint. Plotly needs per-patient trace objects. This phase writes the pure transformation function that bridges the two, locks its behaviour with a Vitest suite, and separates rendering constants from data logic before Phase 5 makes everything visual.

### What was built

| File | Responsibility |
|------|---------------|
| `frontend/vite.config.js` | Added `test.environment: 'jsdom'`; removed stale `// flag` comment from proxy block |
| `frontend/package.json` | `react-router-dom`, `react-plotly.js`, `plotly.js`; dev: `vitest`, `@vitest/coverage-v8`; `"test": "vitest run"` |
| `frontend/src/constants.js` | `COLOR_MAP` — arm+dose string → hex color; single import point for Phase 5 and 6 |
| `frontend/src/utils/transformData.js` | `buildPatientSeries(rows)` — groups flat API rows into per-patient DTOs with `colorKey` and sorted `points` |
| `frontend/src/utils/transformData.test.js` | 13 Vitest tests covering grouping, metadata, type coercion, baseline injection, sort order, edge cases, and `colorKey` correctness |

### Folder structure after Phase 3

```
frontend/src/
├── constants.js                        ← new
├── utils/
│   ├── transformData.js                ← new
│   └── transformData.test.js           ← new
├── App.jsx                             # unchanged
└── main.jsx                            # unchanged
```

### Decisions and rationale

**`groupBySubject` renamed to `buildPatientSeries`**
The original draft named the function `groupBySubject` but it does three things: groups rows by patient, injects a synthetic baseline point, and sorts both points and patients. The name was a lie — it implied a simple grouping operation when the function also injects domain-specific data and sorts. `buildPatientSeries` accurately describes the output: a series of patient objects ready for Plotly.

**`COLOR_MAP` moved out of `transformData.js` into `constants.js`**
The first draft exported `COLOR_MAP` from `transformData.js`. A transform module has no business knowing about hex colors — that is a rendering concern. More practically, `COLOR_MAP` is also consumed by `FilterPanel` (Phase 6) for legend rendering. If it lived in `transformData.js`, Phase 6 would import a rendering constant from a data module, creating a coupling that makes refactoring harder. `constants.js` is the single source of truth for all app-wide rendering constants.

**`colorKey` computed once in `buildPatientSeries`, stored on the patient object**
Each patient in the output carries a `colorKey` field: `` `ARM ${row.arm} ${row.dose} mg` ``. This matches `COLOR_MAP`'s key format exactly. Without this, `SpiderPlot` (Phase 5) would have to reconstruct the key string inline every time it renders a trace. That reconstruction is untestable in the transform suite — if the arm field format ever changed (e.g. `'A'` → `'Arm A'`), the chart would silently render with no colors and no error. Computing `colorKey` once in the transform and verifying it against `COLOR_MAP` in tests catches this class of bug before the chart exists.

**O(n+m) baseline injection, not O(n×m)**
The original baseline check used `rows.some(r => r.subject_id === patient.subject_id && Number(r.days) === 0)` inside the per-patient `forEach`. For each patient, this scans all rows — O(patients × rows). The correct approach builds a `Set` of day-zero subject IDs in one O(n) pass before the patient loop, then does O(1) `.has()` lookups per patient. Total: O(rows + patients). For 10 patients and 58 rows it makes no practical difference, but O(n×m) is the wrong algorithm when O(n+m) is trivial.

**Baseline check uses `Number(r.days) === 0` not `p.weeks === 0`**
After division (`days / 7`), exact float equality against `0` is technically fine for integer day values (`0 / 7 === 0`), but it is fragile — a future CSV with fractional-day entries could produce `0.001 / 7 = 0.000143`, which would fail the equality check and cause double-baseline injection. Checking the raw integer days value before division is the source of truth. The question the code is answering is "did a real day-0 measurement exist in the data?" — checking `r.days`, not the derived `p.weeks`, is the correct place to ask it.

**`vitest environment: jsdom`, not `node`**
Pure utility functions like `buildPatientSeries` have no browser API calls and could run in either environment. `node` was tempting because it is technically correct for today's tests and marginally faster. It was rejected because Phase 9 ("fill out remaining Vitest edge cases") will add component tests — those need `jsdom` for DOM access. Setting `node` now means either changing the global config later (one migration step) or adding `// @vitest-environment jsdom` at the top of every future component test file (boilerplate forever). `jsdom` works for both utility and component tests at zero cost today.

**`react-plotly.js` + `plotly.js` over a lighter chart library**
The assignment spec calls for a spider plot. Plotly has native support for the exact chart type, reference lines, hovertemplate, and responsive sizing the spec requires. A lighter library like recharts would require building those features manually. For a take-home where time is the constraint, Plotly is the right call despite the ~3 MB bundle size.

**`@vitest/coverage-v8` installed but not enforced**
Coverage is not part of Phase 3's success criteria. It is installed now so `--coverage` is available if needed later without a separate install step.

### Why `buildPatientSeries` outputs `points` as a separate array

The API returns flat rows. Plotly needs two parallel arrays per trace: `x` (weeks) and `y` (change). Storing both as `{weeks, change}` objects in a `points` array keeps the transform output self-contained — the chart component extracts x and y with two `.map()` calls:

```js
x: patient.points.map(p => p.weeks),
y: patient.points.map(p => p.change),
```

The remaining fields — `arm`, `dose`, `tumor_type`, `colorKey`, `subject_id` — are metadata consumed by the filter panel, legend, hover tooltip, and patient count display. They never go into Plotly's `x`/`y` arrays. The shape was designed so each concern reads exactly what it needs and ignores the rest.

### Test suite design — what was wrong with the first draft and why

The first draft had 7 tests. After two rounds of senior review, the suite was expanded to 13. Changes made:

**Fixed: syntax error in `withDayZero` fixture**
The double-baseline test had an incomplete object literal — the file would fail to parse entirely, silently skipping the test and giving false confidence.

**Fixed: magic strings replaced with named constants**
`'08-201'`, `'08-202'`, `'08-203'` scattered across multiple tests were extracted to `S1`, `S2`, `S3` constants. A typo in one fixture row now fails at the constant definition, not silently at a `.find()` returning `undefined`.

**Fixed: sort test was an indirect self-comparison**
The original `expect(weeks).toEqual([...weeks].sort((a, b) => a - b))` checks "is the output sorted?" but not "are the values correct?". A function returning wrong week values in sorted order would pass. Replaced with explicit expected values: `expect(weeks[0]).toBe(0)`, `expect(weeks[1]).toBeCloseTo(47 / 7)`, `expect(weeks[2]).toBeCloseTo(101 / 7)`.

**Added: patient structure test (not just count)**
The original `toHaveLength(2)` only verified count. A function returning `[null, null]` would pass. Added `toMatchObject` asserting all five fields — `subject_id`, `arm`, `dose`, `tumor_type`, `colorKey` — are present and correct on the patient object.

**Added: metadata field correctness for each patient**
No test verified that `arm`, `dose`, `tumor_type` were correctly assigned. A grouping bug that swapped patient metadata would pass the entire original suite. Added a dedicated test asserting S2's metadata is `arm: 'B'`, `dose: 3000`, `tumor_type: 'HNSCC'`.

**Added: dose type coercion test**
`Number(row.dose)` is in the code specifically because the API could return dose as a string. No test asserted `typeof patient.dose === 'number'`. If that coercion broke, Phase 5 would receive string doses and the sort comparator `a.dose - b.dose` would silently return `NaN`, breaking patient ordering.

**Added: single-timepoint patient test**
No test covered a patient with exactly one real measurement. After baseline injection, they should have exactly two points. Without this test, an off-by-one in the injection logic could produce a patient with only a baseline and no measurements — visually a dot, not a line.

**Added: `colorKey` → `COLOR_MAP` cross-check**
`buildPatientSeries` produces `colorKey` values. `COLOR_MAP` in `constants.js` is what `SpiderPlot` will look up. Without a test that imports both and asserts `COLOR_MAP[patient.colorKey]` is defined, a typo in either file would pass all transform tests and only fail visually in Phase 5.

### Verification

```bash
cd frontend && npm test
```

Expected output:
```
 ✓ src/utils/transformData.test.js (13)

Test Files  1 passed (1)
     Tests  13 passed (13)
```

### Git checkpoints (Phase 3)

One commit per step — do not batch:

```
step 12: install react-router-dom, plotly, vitest; jsdom env; clean proxy comment
step 13: add constants.js with COLOR_MAP
step 14: write buildPatientSeries — colorKey, O(n+m) baseline check, JSDoc
step 15: 13 vitest cases — structure, metadata, type coercion, colorKey, edge cases
docs: Phase 3 — transformData, constants, Vitest suite
```

---

## Phase 4: Bootstrap — Tailwind, Router, Navbar (Steps 15b–18)

**Goal:** Remove unused Vite scaffold assets, add **Tailwind CSS v4** (`@tailwindcss/vite`, `@import "tailwindcss"` as **first line** of `index.css`), mount **`BrowserRouter`** in **`main.jsx`**, declare **`/`** and **`/visualisation`** (British spelling) with **`Landing`** / **`Visualisation`** stubs, then add a persistent **`Navbar`** (`Link` + **`NavLink`** with `className={({ isActive }) => ...}`) **above** `<Routes>` in **`App.jsx`**.

### What was built

| Step | Change |
|------|--------|
| **15b** | Deleted **`App.css`**, **`assets/react.svg`**, **`assets/vite.svg`** (no imports in `src/`). **`hero.png`** removed in Phase 4 senior review pass (zero importers confirmed by grep). |
| **16** | **`tailwindcss`**, **`@tailwindcss/vite`**; **`vite.config.js`** → `plugins: [tailwindcss(), react()]`; **`index.css`** prepended with `@import "tailwindcss";` |
| **17** | **`BrowserRouter`** wraps **`App`** in **`main.jsx`**; **`App.jsx`** → `<Routes>` + stubs in **`pages/Landing.jsx`**, **`pages/Visualisation.jsx`** |
| **18** | **`components/Navbar.jsx`**; **`App.jsx`** fragment with **`<Navbar />`** then **`<Routes>`** |

### Decisions (from plan)

- **Router in `main.jsx`**, not `App.jsx`, so **`App`** stays testable with a **`MemoryRouter`** when needed.
- **`NavLink`** callback for active styling — no **`useLocation`** + manual path compare.
- **Navbar above routes** — not duplicated inside each page.
- **Plugin order** `tailwindcss()` before `react()` per Tailwind v4 convention.

### Verification

```bash
cd frontend && npm test    # 13 passed
cd frontend && npm run lint
cd frontend && npm run build
```

Browser (with **`npm run dev`**): **`/`** shows **Landing**; **`/visualisation`** shows **Visualisation**; Navbar and active link styling on both.

### Git checkpoints (Phase 4)

```
step 15b: delete Vite scaffold dead files — App.css, react.svg, vite.svg not imported anywhere
step 16: install tailwind v4, wire @tailwindcss/vite plugin, @import as first line of index.css
step 17: BrowserRouter in main.jsx, two-route App.jsx, Landing and Visualisation stubs
step 18: Navbar with NavLink isActive callback, mounted above Routes in App.jsx
```

### Steps 19–21: Landing page (phrase4 plan)

| Step | Deliverable |
|------|-------------|
| **19** | **`components/SummaryCard.jsx`** — `title` + `value`, JSDoc `@param` contract, Tailwind card, `text-left` |
| **20** | **`pages/Landing.jsx`** — `AbortController` fetch, early returns per state, `useMemo` + exported `deriveStats`, three **`SummaryCard`**s |
| **21** | **`Link`** CTA to **`/visualisation`** (`Explore Spider Plot →`) |

**Git checkpoints:** `step 19: add SummaryCard…`, `step 20: Landing — fetch…`, `step 21: CTA Link…`

Verify with backend on **5001**: cards show **10**, **A, B**, **1800mg, 3000mg**; Vitest stays **18** passed (13 transform + 5 deriveStats).

---

## Phase 4, Steps 19–21: Senior Review — 10 Issues Identified and Resolved

After the initial plan was drafted a senior review pass found 10 issues across CSS infrastructure, component contracts, state management, and plan process. Each is documented below: the original issue, why the naïve fix is insufficient, and the resolution actually applied.

---

### Item 1 — No `AbortController` on the fetch

**Issue:** The original `useEffect` had no cleanup function. React 18 `StrictMode` deliberately unmounts and remounts every component in development — the first fetch fires, React unmounts, React remounts, the second fetch fires. With no abort, the first fetch continues in-flight and calls `setRows` on a component instance that has been discarded.

**Why the naïve fix falls short:** Adding `AbortController` with a `finally(() => setLoading(false))` cleanup still fires `setLoading` on the abort path — calling state setters on an unmounted component, which is the exact problem being fixed. `finally` runs unconditionally; that includes the abort.

**Resolution applied:** `setLoading(false)` was moved out of `finally` into the explicit success `.then` and the non-abort `.catch` branch. The abort path returns early with no state calls. The cleanup function `() => controller.abort()` is the return value of `useEffect`.

```js
// abort path — no state calls
.catch(err => {
  if (err.name === 'AbortError') return
  setError(err.message)
  setLoading(false)
})
return () => controller.abort()
```

---

### Item 2 — Error state rendered wrong card values

**Issue:** The render used `loading ? '…' : stats.X` as the guard for card values. After a fetch failure, `loading = false` and `rows = []`, so `deriveStats([])` returned `{patients: 0, arms: '', doses: ''}`. Cards rendered `0`, empty string, empty string — wrong values with no visual error indication beyond the error message above them.

**Why the naïve fix falls short:** The three-state ternary `loading ? '…' : error ? 'N/A' : stats.X` repeated across three cards is a DRY violation embedded in JSX. Adding a fourth state later (e.g. stale data) requires touching all three cards.

**Resolution applied:** Early returns. Three explicit render branches — loading, error, success — each with a self-contained `return`. The success path has no conditional logic; `stats` is guaranteed valid. Layout shell (`<main className="px-8 py-12">`) is identical across all three branches so the page does not shift during state transitions.

---

### Item 3 — `constants/colorMap.js` path was stale in two places

**Issue:** The roadmap plan (`.claude/plans/roadmap.md`) and Claude's memory file both documented the `COLOR_MAP` file as `frontend/src/constants/colorMap.js`. The actual file created in Phase 3 was `frontend/src/constants.js`. If Phase 5 imported from `'../constants/colorMap'` it would get a module-not-found error with no obvious cause.

**Why the naïve fix falls short:** Renaming the file to match the stale doc would break the existing test import `import { COLOR_MAP } from '../constants'` and add unnecessary churn. The file is already in the right place.

**Resolution applied:** Both documents updated to `constants.js`. The file was not moved — the document was the error. File paths in design documents rot; the interface (`COLOR_MAP`, key format) is what matters to document.

---

### Item 4 — `deriveStats` not exported, not memoised, not tested

**Three separate problems that compound each other:**

**Not exported:** `deriveStats` was a module-level unexported function. No test could import it directly. Any derivation bug would only surface visually in the browser.

**Not memoised:** Called on every render. When `loading = true` and `rows = []`, it ran and allocated throwaway `Set` objects on every re-render. The dependency contract — "only recalculate when `rows` changes" — was invisible in the code.

**Not tested:** The critical edge case — `Number(r.dose)` deduplicating the string `"1800"` and the number `1800` as the same dose — had no test. If that coercion broke, the Dose Levels card would silently show `1800mg, 1800mg`.

**Resolution applied:** `deriveStats` named-exported from `Landing.jsx`. `frontend/src/pages/landing.test.js` created with five tests: patient count, arm sort, dose format, string/number dose deduplication, and empty input safe values. `useMemo(() => deriveStats(rows), [rows])` wired in the component. Tests written before the component was wired — test output was the verification that export + logic were correct. Vitest count: 13 → 18.

---

### Item 5 — Two CSS design systems not bridged

**Issue:** `index.css` defined custom CSS variables (`--text`, `--text-h`, `--border`, `--accent`). Components used Tailwind's built-in grays (`text-gray-600`, `border-gray-200`). The two systems were not synchronised — changing `--text-h` would not affect any component using `text-gray-900`.

**Why the naïve fix falls short:** "Pick one system" means either rewriting all component classes to use CSS variables (no Tailwind tooling benefit) or deleting the CSS variables (losing the dark mode override system in the existing `prefers-color-scheme` block).

**Resolution applied:** Tailwind v4's `@theme` block bridges the two without choosing either:

```css
@theme {
  --color-brand-text:    #6b6375;
  --color-brand-heading: #08060d;
  --color-brand-border:  #e5e4e7;
  --color-accent:        #aa3bff;
}
```

`text-brand-text`, `border-brand-border`, `text-brand-heading`, `text-accent` are now valid Tailwind utility classes referencing the design system values. Existing components using Tailwind grays continue to work. Phase 8 polish can migrate incrementally.

**Dark mode note:** `@theme` tokens compile to static values, not CSS variable references. Full dark mode support via Tailwind utilities would require `dark:` variants per component. For this project, dark mode is handled via the existing `prefers-color-scheme: dark` `:root` override block. The `@theme` tokens cover light mode component styling only.

---

### Item 6 — `font: 18px` on `:root` silently skewed all Tailwind `rem` values

**Issue:** `font: 18px/145% var(--sans)` in `:root` set the CSS base font size to 18px. Tailwind's default rem scale assumes `1rem = 16px`. With an 18px base: `text-sm` resolved to 15.75px, `p-6` to 27px, `gap-4` to 18px — every rem-based utility was off by 12.5%.

**Why the naïve fix falls short:** Simply changing `font-size: 18px` to `font-size: 16px` on `:root` loses the intended 18px body text size. The issue is not the size itself but where it is set: `:root` affects the `rem` scale; `body` does not.

**Resolution applied:** `font-size`, `line-height`, `font-family`, and the responsive `@media (max-width: 1024px) { font-size: 16px }` were moved from `:root` to `body`. The `:root` block retains only CSS variable declarations and rendering-hint properties (`color-scheme`, `font-synthesis`, etc.). `rem` is now based on the browser default 16px; body text is rendered at 18px.

---

### Item 7 — `text-align: center` on `#root` was implicit layout behaviour

**Issue:** The Vite scaffold default left `text-align: center` on the `#root` div. All child text centred by default — including error messages, subtitles, and the CTA button — without any visible indication in the component JSX. `SummaryCard` had `text-left` to fight this, but the override made sense only if you knew about the global rule.

**Why the naïve fix falls short:** Removing it blindly without auditing dependents causes visual regressions. The page title and subtitle were centred by this rule and needed `text-center` added explicitly before the global rule was removed.

**Resolution applied:** `text-align: center` removed from `#root`. `SummaryCard`'s `text-left` class remains (now semantically "left-align this card" rather than "override a global default"). Centering is now a visible, auditable decision in component JSX. Any future component with centred text will have `text-center` declared on it — discoverable without reading `index.css`.

---

### Item 8 — Orphaned `frontend/src/assets/hero.png`

**Issue:** Step 15b deleted `App.css`, `react.svg`, and `vite.svg`. `hero.png` was left behind with zero importers anywhere in `frontend/src/`. The step 15b plan listed specific filenames to delete rather than running a reference sweep.

**Resolution applied:** `hero.png` deleted via `git rm`. The Phase 9 cleanup step now includes a systematic sweep to catch any remaining unreferenced assets:

```bash
find frontend/src/assets -type f | while read f; do
  name=$(basename "$f")
  count=$(grep -r "$name" frontend/src --include="*.jsx" --include="*.js" -l | wc -l)
  echo "$count $name"
done
```

Files returning `0` are unreferenced. This replaces the name-based approach with a reference-based approach — more reliable as the project grows.

**Step 15b note updated:** Documentation previously recorded `hero.png` as "kept". That entry has been corrected: `hero.png` was removed in the Phase 4 senior review pass.

---

### Item 9 — `SummaryCard` had no prop type contract

**Issue:** `SummaryCard` accepted `value` as any type. Passing a number (e.g. `stats.patients`, which is `Set.size` — a `number`) would render silently. There was no signal to the caller that the contract required a `string`.

**Why the naïve fix falls short:** Removing `String(stats.patients)` at the call site is correct (React renders `{0}` as `"0"` — no casting needed for render). But removing it without documenting the prop contract just moves the ambiguity back into the component.

**Resolution applied:** JSDoc `@param {{ title: string, value: string }}` added to `SummaryCard`. Any IDE with JSDoc type checking now flags a numeric `value` at the call site. `String(stats.patients)` is kept in `Landing.jsx` as the explicit cast that satisfies the documented contract — the conversion is visible and intentional rather than implicit.

---

### Item 10 — Plan Step 21 used full-file replacement for an additive change

**Issue:** The implementation plan for Step 21 (adding the CTA `Link`) provided the complete `Landing.jsx` as a code block under "Self-Contained Rule." An agent executing the plan would overwrite the entire file. If Step 20's output had any legitimate deviation from the plan — whitespace normalisation, a wording tweak, a corrected import — Step 21 would silently revert it with the stale version from the plan document.

**Why the naïve fix falls short:** "Show only a diff" is ambiguous. A diff without context is hard for an agent to apply correctly to a file that may differ slightly from the plan.

**Resolution applied:** Step 21 in `.claude/plans/phrase4.md` updated to specify two precise Edit operations with exact `old_string` / `new_string` pairs and a uniqueness verification command for each anchor:

1. Insert `import { Link } from 'react-router-dom'` — anchor: the SummaryCard import line (verified unique before applying)
2. Insert `<Link>` JSX block — anchor: `</div>` immediately before `</main>` (verified unique in scope)

**Principle documented:** The "Self-Contained Rule" in the plan template is designed for steps that create new files or perform full rewrites. Additive steps should use Edit semantics — minimum change, verified-unique anchor, no full-file replacement.

---

## Code Review — Technical Debt Pass (post-Phase 4)

A senior-level review of the codebase after Phase 4 identified several issues across CSS infrastructure, test quality, and code correctness. The following documents each issue, the fix applied, and the reasoning. Items that were investigated and deliberately left unchanged are also noted.

---

### Fix 1 — `index.css`: Dead portfolio-template CSS removed

**Issue:** `index.css` contained rules and variables with no corresponding HTML anywhere in the project: `#social .button-icon`, `.counter`, `code { ... }`, and CSS custom properties `--accent` (purple), `--accent-bg`, `--accent-border`, `--social-bg`, `--shadow`, `--code-bg`. These originated from a personal portfolio template and were never removed. The purple `#aa3bff` accent colour had no relation to the pink/blue clinical palette in `COLOR_MAP`. The `--heading` variable was set to the same font stack as `--sans` — two names for one value.

**Fix applied:**
- Removed `--color-accent` from the `@theme` block
- Removed `--code-bg`, `--accent`, `--accent-bg`, `--accent-border`, `--social-bg`, `--shadow`, `--heading`, `--mono` from `:root`
- Removed the same dead variables from the `@media (prefers-color-scheme: dark)` `:root` block
- Removed `#social .button-icon { filter: invert(1) brightness(2); }` from the dark mode block
- Removed the `code, .counter { ... }` and `code { ... }` rule blocks
- Replaced `var(--heading)` in `h1, h2` with `var(--sans)` — the `--heading` variable is deleted

**What stays:** `--text`, `--text-h`, `--bg`, `--border`, dark mode overrides for those four, font smoothing, `#root` layout, and heading/paragraph base styles. Every remaining rule has a corresponding rendered element.

---

### Fix 2 — `backend/app.py`: `debug=True` replaced with environment variable

**Issue:** `app.run(port=5001, debug=True)` in source code unconditionally enables Flask's interactive debugger. On a shared or networked machine this exposes a PIN-protected Python shell to anyone who can reach port 5001. Hardcoding a security-relevant flag in source bypasses the environment separation that `.env` files exist to provide.

**Fix applied:**
```python
app.run(port=5001, debug=os.environ.get('FLASK_DEBUG', 'false').lower() == 'true')
```
`import os` added at the top of `app.py`. Default is `false` — debug mode must be explicitly opted into via the environment. Set `FLASK_DEBUG=true` in `backend/.env` for local development.

---

### Fix 3 — `frontend/src/utils/transformData.js`: `colorKey` now uses coerced dose

**Issue:** The `colorKey` string was constructed from `row.dose` (raw API value) while the `dose` property was set to `Number(row.dose)` (coerced). Both happen to produce the same string today because the API returns dose as an integer. But they are derived from different sources — if the raw value ever arrived as a float (`1800.0`) or edge-case string, `row.dose` and `Number(row.dose)` could produce different string representations.

**Fix applied:**
```js
const dose = Number(row.dose)
grouped[key] = {
  dose,
  colorKey: `ARM ${row.arm} ${dose} mg`,
  ...
}
```
`dose` and `colorKey` are now guaranteed to be derived from the same coerced value.

**JSDoc comment also corrected:** The algorithm comment previously claimed "O(n+m)" complexity. The actual implementation is three sequential O(n) passes (Set build → group → inject/sort). The comment was updated to reflect this accurately.

---

### Fix 4 — `backend/tests/test_api.py`: Redundant and mislabelled tests removed or renamed

**Three tests deleted** (redundant coverage):

| Deleted test | Reason |
|---|---|
| `test_empty_intersection_is_not_404` | `test_empty_intersection_returns_200_with_empty_array` already asserts `status_code == 200`, making the `!= 404` assertion on the same URL redundant |
| `test_invalid_param_never_returns_500` | A loop over 4 URLs already individually tested by `test_invalid_arm_returns_400`, `test_invalid_dose_non_integer_returns_400`, etc. |
| `test_duplicate_arm_param_uses_first_value` | Tests `flask.request.args.get()` framework behaviour, not application logic |

**Three tests renamed** (mislabelled as security tests):

| Old name | New name | Reason for rename |
|---|---|---|
| `test_sql_injection_in_arm_returns_400_not_500` | `test_special_characters_in_arm_returns_400` | No SQL exists in this app — calling it a SQL injection test misrepresents the threat model. The actual behaviour being tested is "special characters in arm param are rejected by validation." |
| `test_xss_attempt_in_tumor_type_returns_400` | `test_html_characters_in_tumor_type_returns_400` | XSS requires rendering user input as HTML. Flask's `jsonify` does not do this. The test verifies input rejection, not XSS defence. |
| `test_injection_error_response_body_is_valid_json` | `test_invalid_tumor_type_error_is_valid_json` | Name now reflects what it actually tests. |

**Result:** 40 tests (down from 43). All 40 pass.

---

### Fix 5 — `frontend/src/utils/transformData.test.js`: Misleading constant names corrected

**Issue:** `S2 = '08-203'` and `S3 = '08-202'` implied an alphanumeric ordering that the values did not follow (203 > 202, yet S2 < S3 by name). A reader scanning the fixture would assume S1 < S2 < S3 by patient ID, which is incorrect.

**Fix applied:** Renamed to semantically meaningful identifiers:
```js
const S1       = '08-201'  // arm A, dose 1800, sqNSCLC — primary test patient
const PATIENT_B  = '08-203'  // arm B, dose 3000, HNSCC
const PATIENT_A2 = '08-202'  // arm A, dose 3000, sqNSCLC — multi-dose sort test only
```
All usages updated throughout the file. All 18 Vitest tests pass.

---

### Fix 6 — `backend/tests/test_data.py`: Snapshot nature of row-count test documented

**Issue:** `assert len(df) == 58` is a snapshot assertion against the committed CSV, not a test of `load_data()`'s behaviour. If the CSV is updated with new patients, this test fails with no indication of whether the loading function is broken or the data simply changed.

**Fix applied:** Comment added above the assertion:
```python
# Data integrity snapshot — tests the committed CSV, not load_data() behaviour.
# If spiderplot.csv is updated with new patients, update these counts to match.
```
The assertion is retained — the CSV is fixed for this take-home and the snapshot is a valid data integrity check. The comment makes the intent explicit so a future reader knows to update the number rather than investigate a bug in the loading logic.

---

### Investigated and intentionally left unchanged

**`days` returned as string from the API:** Reviewed against the assignment spec. The JSON example explicitly shows `"days": "47"` with string quotes. The implementation matches the spec. The test `test_days_is_string_not_int` is correct.

**`sys.path.insert` in `app.py`:** Acknowledged as a workaround for the absence of `pyproject.toml` or `backend/__init__.py`. Left in place — fixing it requires adding packaging infrastructure that is outside the scope of this take-home. Documented here as known technical debt.

**Filtering model (client-side vs server-side):** The roadmap stated client-side filtering; the API implements server-side filter params; Phase 6 will add client-side filtering on top. Decision: the frontend will always fetch all rows on mount and filter in memory. The dataset is bounded by clinical trial scale (sub-1000 rows) and a server round-trip on every filter change adds latency with no benefit at this data size. The API filter params are kept as documented in the spec and remain available for future consumers or pagination needs — the frontend simply does not use them. No code change required; this note closes the documentation gap.

---

## Phase 5: Visualisation Page — SpiderPlot, FilterPanel, Visualisation (Steps 22–24)

**Goal:** Replace the `Visualisation.jsx` stub with a fully working clinical spider plot page. After this phase: `SpiderPlot.jsx` renders all patient lines with correct colours, reference lines, legend deduplication, and hover highlight; `FilterPanel.jsx` owns the three filter dropdowns, SoC mPFS input, and AI filter UI; `Visualisation.jsx` is the coordinator — owns all state, fetches from `/api/spider` on filter change, derives patient counts, and composes the layout.

---

### Architecture — four patterns and why

#### Pattern 1: Coordinator (Visualisation owns all state)

`Visualisation.jsx` is the single source of truth for every piece of filter state. `SpiderPlot` and `FilterPanel` are pure-presentational — they receive values and callbacks, they never fetch or store application state themselves.

**Why this matters for maintainability:** If `SpiderPlot` fetched its own data, the "Showing X of Y patients" count could not be derived — it would require a separate fetch or a prop tunnel from a component that shouldn't own that concern. The AI filter and manual dropdowns would also need explicit synchronisation logic because they would live in different subtrees. With the coordinator pattern, AI filter writes to `setSelectedArm` / `setSelectedDose` / `setSelectedTumor` — the exact same setters the manual dropdowns use. Sync is automatic and zero-cost.

**What breaks if violated:** Any component that fetches its own data creates two sources of truth. Every future feature that needs to know "what filters are currently active" must either prop-drill from the top or introduce a global store. The coordinator pattern keeps that boundary clean from day one.

#### Pattern 2: Two-memo Plotly trace pattern (`traces` / `displayTraces`)

```js
const traces = useMemo(() => { ... }, [series])               // expensive — O(n) object construction
const displayTraces = useMemo(() => { ... }, [traces, hoveredCurve]) // cheap — opacity overlay only
```

The expensive step — building all Plotly trace objects including x/y arrays, customdata, and hovertemplate — runs only when `series` changes (i.e. when the data itself changes). The cheap step — applying opacity — runs on every hover event.

**Why this matters for scalability:** If opacity were included in the `traces` memo, every `onHover` event would rebuild all N trace objects. At 10 patients this is imperceptible. At 300 patients with 30 time points each, rebuilding 9,000 data-point mappings on every cursor movement would cause visible frame drops. Decoupling the two responsibilities is the correct architecture regardless of current dataset size — it does not become a footgun as the data grows.

**Why this matters for maintainability:** The two memos have different reasons to change. `traces` changes when the data transform logic changes. `displayTraces` changes when the hover interaction model changes. Keeping them separate means a change to one does not risk breaking the other.

#### Pattern 3: Two-state SoC input (`inputValue` string / `socMpfsWeeks` number)

`FilterPanel` holds `inputValue` (a string, updated on every keystroke). `Visualisation` holds `socMpfsWeeks` (a number, updated only on valid blur-commit). The chart only ever reads `socMpfsWeeks`.

**Why this matters for maintainability:** This encodes a boundary between display state and application state at the type level. `inputValue` can be `""`, `"-"`, `"10."`, or `"abc"` — all valid intermediate typing states that cannot be represented as a `number`. Using a single numeric state forces validation on every keystroke, which either snaps the field (bad UX) or propagates invalid values to the chart (data integrity violation). The two-state pattern is the only design that satisfies both constraints.

**Why this matters for conciseness:** `commitSocInput` is the single translation point between the two states. All validation logic lives in one function. There is no validation in `onChange`, no validation in `Visualisation`'s setter, no validation in `SpiderPlot`. One function, one place to change if the rules change.

**The sync-back mechanism:** A `useEffect` in `FilterPanel` watches `socMpfsWeeks` and resets `inputValue` to `String(socMpfsWeeks)` when it changes. This handles the Reset All case — `Visualisation` resets `socMpfsWeeks` to `DEFAULT_SOC`, and `FilterPanel`'s effect fires to update the display string. Without this, the input field would retain stale user-typed text after a reset.

#### Pattern 4: AbortController per fetch effect

Every `useEffect` that calls `fetch` creates an `AbortController`, passes its signal to `fetch`, and returns `() => controller.abort()` as the cleanup function.

**Why this matters for correctness:** React's `useEffect` cleanup fires before the next effect run. When a user changes a filter quickly — arm A, then arm B, then arm A again — three fetches fire in rapid succession. Without abort, the slowest response wins and can overwrite a more recent result. With abort, each cleanup cancels the previous in-flight request before the new one starts. The chart always reflects the most recent filter selection.

**Why this matters for scalability:** At low latency (localhost) race conditions are unlikely. Against a real API with variable response times, they are inevitable. Wiring AbortController from the start means this class of bug cannot enter the codebase later.

---

### Step 22: `SpiderPlot.jsx`

**Single responsibility:** Receive `series` (pre-built `PatientSeries[]`) and `socMpfsWeeks`, build Plotly traces, render chart.

#### Decision: receive `series`, not raw `rows`

`Visualisation` already calls `buildPatientSeries(rows)` to get `series.length` for the patient count display. If `SpiderPlot` received raw rows and called `buildPatientSeries` internally, the same O(n) transform would run twice on every filter change — once for the count, once for the chart. Passing `series` makes the data flow unidirectional and eliminates the redundant computation.

**Maintainability impact:** A future change to `buildPatientSeries` (new field, different sort) only needs to be verified in one place. The chart cannot diverge from the count display because they read the same object.

#### Decision: `seriesBounds` memo split from `layout` memo

The original single `layout` memo depended on `[series, socMpfsWeeks]`. The axis range computation (scanning all data points for min/max values) does not use `socMpfsWeeks` at all — it was in the dependency array by accident.

```js
// Before: full data scan on every SoC input blur
const layout = useMemo(() => { ... }, [series, socMpfsWeeks])

// After: data scan only when data changes
const seriesBounds = useMemo(() => { ... }, [series])
const layout       = useMemo(() => { ... }, [seriesBounds, socMpfsWeeks])
```

**Scalability impact:** The SoC input is a frequently changed value — users adjust it to compare survival benchmarks. Every blur commit previously triggered an O(n) scan across all patient time points. After the split, SoC changes only recompute the cheap layout object (shapes, annotations, axis config). The data scan runs only when the actual patient data changes.

**Maintainability impact:** Dependency arrays are a documentation of what a memo depends on. An incorrect dependency array is a silent lie that future developers will read and trust. `[seriesBounds, socMpfsWeeks]` is accurate; `[series, socMpfsWeeks]` was not.

#### Decision: module-level constants for clinical thresholds

```js
const PD_THRESHOLD  = 20    // RECIST progression threshold (% increase)
const PR_THRESHOLD  = -30   // RECIST partial-response threshold (% decrease)
const TICK_INTERVAL = 6     // x-axis tick cadence in weeks
```

These values have domain meaning. `20` and `-30` are RECIST criteria — thresholds defined by oncology protocol, not arbitrary chart formatting numbers. A clinician or product manager asking "can we adjust the partial response threshold to -25%?" should require a one-line edit to a named constant, not a grep through a Plotly layout function.

**Maintainability impact:** Named constants make the why visible. `PR_THRESHOLD = -30` tells a reader this is a domain value, not a layout magic number. `makeHLine(-30, 'dash')` tells a reader nothing without comments.

#### Decision: `HOVER_TEMPLATE` and `PLOT_CONFIG` hoisted to module level

Both are static — they do not depend on any props or state. Defining them inside the component means they are re-evaluated on every render (for `PLOT_CONFIG`) or every `series` change (for `HOVER_TEMPLATE` inside the memo).

**Scalability impact:** `PLOT_CONFIG` is a new object reference on every render. React-Plotly compares props by reference; a new `config` object on every render may trigger spurious Plotly internal reconciliation. Hoisting it to module level makes the reference stable.

**Conciseness impact:** Inline object literals in JSX are noise. `config={PLOT_CONFIG}` is immediately readable; `config={{ displaylogo: false, modeBarButtonsToRemove: [...] }}` forces the reader to parse an inline definition mid-JSX.

#### Decision: `makeTopAnnotation` helper for SoC label

`makeRightAnnotation` was used for the PD and PR labels. The SoC label above the vertical line was hand-rolled inline with a full object literal. Two annotation styles, no shared factory.

**Maintainability impact:** If the font size or colour for chart annotations needs to change, it now changes in one helper per annotation type rather than one helper plus one inline object. Consistency in the factory pattern makes the `annotations` array scannable — each line is one function call, not a mix of function calls and object literals.

#### Decision: `customdata` uses a single `meta` array per patient

```js
// Before: creates one new array per data point
customdata: patient.points.map(() => [subject_id, arm, dose, tumor_type])

// After: all points share one array object
const meta = [patient.subject_id, patient.arm, patient.dose, patient.tumor_type]
customdata: patient.points.map(() => meta)
```

Patient metadata is constant across all of a patient's time points. The previous implementation allocated N identical 4-element arrays for a patient with N measurements. A patient with 30 visits produced 30 heap allocations of the same 4 values.

**Scalability impact:** Memory allocation is cheap in isolation but compounds. At 300 patients × 30 visits each, the old approach allocated 9,000 arrays on every series change. The new approach allocates 300 arrays total.

#### Decision: `handleHover` extracted as `useCallback`

```js
const handleHover = useCallback(e => {
  const c = e.points?.[0]?.curveNumber
  if (c != null) setHoveredCurve(c)
}, [])
```

**Maintainability impact:** Named functions are visible in the React DevTools component profiler. An inline arrow in JSX shows as an anonymous function. When profiling hover performance, `handleHover` identifies the handler immediately; `e => { ... }` does not.

**Conciseness impact:** Multi-statement inline arrows in JSX are a readability smell. The JSX layer should describe structure, not contain logic. Extracting the handler makes the `<Plot>` props scannable without parsing imperative code.

#### Known ceiling: `displayTraces` hover copies

`displayTraces` creates a shallow copy of all N trace objects on every hover event via `traces.map((t, i) => ({ ...t, opacity: ... }))`. At 10 patients this is imperceptible. At 300+ patients moving the cursor across the chart creates continuous frame-by-frame array allocations.

The correct fix is Plotly's imperative `restyle()` API, which updates a single property on existing traces without rebuilding the data array. This requires restructuring `SpiderPlot` from declarative React props to an imperative Plotly instance — a meaningful change outside this phase's scope. Documented as known tech debt; upgrade path is `Plotly.restyle(plotRef.current.el, { opacity }, indices)`.

---

### Step 23: `FilterPanel.jsx`

**Single responsibility:** Receive filter values and callbacks, render dropdowns, SoC input, and AI filter UI. Hold only display state — `aiQuery` and `inputValue`.

#### Decision: two-state SoC input (display string + committed number)

See Architecture Pattern 3 above. The key implementation detail: `Number()` is used instead of `parseFloat()` for the parse step.

```js
const parsed = Number(inputValue.trim())
```

`parseFloat("10.5abc")` returns `10.5` — it silently accepts and truncates garbage input. `Number("10.5abc")` returns `NaN` — it rejects it entirely. The validation intent is "this must be a complete, clean number" not "give me whatever leading digits you can find." `Number()` enforces that intent.

**Maintainability impact:** The validation rule is explicit and testable in isolation. Any future change to validation bounds (`parsed < 0`, `parsed > maxWeeks`) is a one-line edit in `commitSocInput`. There is no validation scattered across the component.

#### Decision: `maxWeeks` passed as prop, not validated in Visualisation's setter

The upper bound for the SoC input (`parsed > maxWeeks`) lives in `FilterPanel`. The alternative is to validate in `Visualisation`'s `setSocMpfsWeeks` setter or in a custom setter wrapper.

**Maintainability impact:** Validation lives where the user sees the input and where the error is visible. If validation lived in Visualisation, an invalid value would need to propagate up through `onSocMpfsChange`, get rejected, and somehow communicate the rejection back down to FilterPanel for display. The prop-based approach keeps the control flow local: input → `commitSocInput` → revert display or call `onSocMpfsChange`. No round-trip required.

#### Decision: `Select` helper component for dropdown repetition

Three identical `<select>` structures — same class string, same pattern — are extracted into a `Select(label, value, options, onChange)` helper defined at the bottom of the file. Three call sites replace three repetitions of 8 lines each.

**Conciseness impact:** The three `<Select>` lines in the JSX are scannable in seconds. The three raw `<select>` blocks would require reading ~24 lines of identical markup to confirm they are structurally the same. Any change to the dropdown style (focus ring, border colour) now requires one edit.

**Maintainability impact:** The `Select` helper is file-private (not exported). It solves a local repetition problem without creating a shared component that other files might depend on. The boundary is explicit.

#### Decision: `aiQuery` stays in FilterPanel, not lifted to Visualisation

`aiQuery` is what the user is typing in the AI textarea. Visualisation does not need to know about mid-type state — it only needs the query when the user clicks Filter. Lifting `aiQuery` to Visualisation would cause the entire page (including the chart) to re-render on every keystroke.

**Scalability impact:** Keeping display state local to the component that owns the display is the correct boundary. Every keystroke in the AI textarea re-renders only `FilterPanel`. With `aiQuery` in Visualisation, it would re-render `FilterPanel`, `SpiderPlot`, the patient count display, and any other children of the coordinator.

---

### Step 24: `Visualisation.jsx`

**Single responsibility:** Own all filter state, fetch on filter change, derive patient counts, compose layout.

#### Decision: `buildParams` as a pure function outside the component

```js
function buildParams(arm, dose, tumor) {
  const p = new URLSearchParams()
  if (arm   !== 'all') p.set('arms',        arm)
  if (dose  !== 'all') p.set('doses',       dose)
  if (tumor !== 'all') p.set('tumor_types', tumor)
  const s = p.toString()
  return s ? `?${s}` : ''
}
```

The critical invariant this function enforces: `'all'` is never sent as a query parameter value. The backend does not understand `?arms=all` — it validates arms against known values and would return 400.

**Maintainability impact:** A pure function is testable in isolation. The query-building logic can be verified with five input/output pairs without mounting a React component, mocking fetch, or setting up a test client. Any future addition (e.g. a new filter dimension) is a one-line addition to `buildParams` with a corresponding test.

**Conciseness impact:** If this logic lived inside the `useEffect`, it would be mixed with fetch setup, controller creation, state updates, and error handling. Extracting it makes the effect's job clear: "call `buildParams`, call `fetch`, handle the response."

#### Decision: `hasCapturedTotal` as a `useRef`, not `useState`

```js
const hasCapturedTotal = useRef(false)
// ...
if (!hasCapturedTotal.current) {
  setTotalPatients(buildPatientSeries(data).length)
  hasCapturedTotal.current = true
}
```

`hasCapturedTotal` is a one-way latch. Once `true`, it never goes back. It does not drive any rendering decision — it is internal bookkeeping for the effect. Using `useState` would cause an extra re-render the moment the total is captured (the state update would trigger a render cycle with no visible change). `useRef` mutates without triggering re-renders.

**Maintainability impact:** The semantics of `ref` vs `state` communicate intent. `useRef` signals "this is side-effect bookkeeping." `useState` signals "this drives rendering." Using the wrong one misleads future readers about why a re-render occurs.

**The total patient count problem explained:** The `"Showing X of Y"` counter needs a stable total. After the first unfiltered fetch, all subsequent fetches are filtered — the total is no longer recoverable from the response. The latch captures it once from the first response and freezes it for the page lifetime. No second parallel fetch is needed; the initial mount state (`all` defaults) guarantees the first response is the full dataset.

#### Decision: AI filter writes to the same state setters as manual dropdowns

```js
setSelectedArm(json.arm   === 'all' ? 'all' : String(json.arm))
setSelectedDose(json.dose  === 'all' ? 'all' : String(json.dose))
setSelectedTumor(json.tumor_type === 'all' ? 'all' : json.tumor_type)
```

The AI filter response sets the same three state variables as the manual dropdowns. The dropdowns then reflect the AI-applied values immediately — no extra sync logic, no shadow state.

**Maintainability impact:** Any future feature that reads `selectedArm` (a new chart layer, a URL param sync, an export function) automatically reflects both manual and AI filter changes without modification. The state is one thing; how it got set is irrelevant to consumers.

**The `String()` coercion:** The API might return `dose` as a number (`1800`) while the dropdown compares string values (`'1800'`). `String(json.dose)` normalises the type at the entry point so the dropdown's `value={selectedDose}` comparison is always string-to-string. Without this, the dropdown would show the correct label visually but the `value` prop would not match any `<option>`, causing a silent mismatch.

#### Decision: `maxWeeks || Infinity` default during loading

```js
const maxWeeks = useMemo(
  () => series.length === 0 ? Infinity : series.reduce(...),
  [series],
)
```

On first mount, `series` is empty before the fetch completes. `FilterPanel`'s SoC input validation checks `parsed > maxWeeks`. If `maxWeeks` were `0` during loading, any positive input would fail validation and revert — the user could not type a value before data loaded. `Infinity` makes every positive value valid during the loading window, then resolves to the actual data maximum once the fetch completes.

**Maintainability impact:** The guard lives in the `maxWeeks` derivation, not in `commitSocInput`. `FilterPanel` does not need to know about the loading state — it just receives a `maxWeeks` prop. The coordinator absorbs the edge case; the child component is simpler.

---

### Senior Review Fixes applied to Phase 5 code

Seven issues caught and fixed before implementation. Full rationale for each is in the Architecture section above; this table is the quick-reference record.

| # | Issue | Fix | Impact |
|---|---|---|---|
| 1 | `20`, `-30`, `6` as magic numbers in layout | `PD_THRESHOLD`, `PR_THRESHOLD`, `TICK_INTERVAL` constants | Maintainability — threshold changes are 1-line edits |
| 2 | `HOVER_TEMPLATE` and `PLOT_CONFIG` inline in component | Hoisted to module level | Conciseness + scalability — stable references, no per-render allocation |
| 3 | `layout` memo depended on `[series, socMpfsWeeks]` | Split into `seriesBounds` (depends on `[series]`) + `layout` (depends on `[seriesBounds, socMpfsWeeks]`) | Scalability — O(n) data scan no longer runs on every SoC change |
| 4 | `customdata` allocated N identical arrays per patient | Single `meta` array per patient, N references to it | Scalability — eliminates N×4 heap allocations on every series update |
| 5 | Comment claimed early return guards the memos above it | Comment removed | Maintainability — React hooks run unconditionally before early returns; the comment was wrong |
| 6 | SoC annotation hand-rolled inline; PD/PR used helpers | `makeTopAnnotation(x, text)` helper added | Maintainability — one factory pattern for all annotations |
| 7 | Multi-statement `onHover` inline arrow in JSX | `handleHover = useCallback(fn, [])` extracted | Maintainability + conciseness — named, stable, visible in DevTools |

### Known tech debt

| Item | Location | Upgrade path |
|---|---|---|
| `displayTraces` O(n) shallow copy on every hover | `SpiderPlot.jsx` | `Plotly.restyle()` imperative API for opacity updates |
| No unit test for `SpiderPlot` | — | Add Playwright test when E2E suite is introduced |
| AI filter error shown as inline text | `FilterPanel.jsx` | Replace with toast in a design-system phase |

---

## Bug log: plotly.js v3 + Vite integration (Phase 5 runtime)

Three consecutive browser errors appeared on first load of `/visualisation` after Phase 5 was implemented. Each was a different symptom of the same underlying problem: **`plotly.js` (the raw source package) was not designed to be consumed directly by Vite's ESM bundler.** The errors had to be resolved in sequence because each fix exposed the next layer of the same root cause.

All three errors required a **hard restart** (`rm -rf frontend/.vite && npm run dev`) to take effect. Hot Module Replacement only watches `src/` — it never re-runs Vite's dependency pre-bundler. Any change to `vite.config.js`, `package.json`, or which packages are in `optimizeDeps` only takes effect when the dev server restarts cold and esbuild re-processes the dependency cache in `frontend/.vite/deps/`.

---

### Error 1 — `Element type is invalid: expected a string or class/function but got: object`

**Where:** `SpiderPlot.jsx` render, `<Plot>` component.

**Cause:** `react-plotly.js`'s main bundle hardwires `require("plotly.js/dist/plotly")` internally — it reaches directly into Plotly's dist folder rather than going through the package root. In `plotly.js@3.x`, the export shape of `dist/plotly.js` changed. Vite's CJS interop wrapper received a module namespace object instead of the Plotly constructor and passed it through as-is. React tried to render that object as a component and threw.

**What not to do:** Downgrade `plotly.js` to `^2.35.2`. This makes the error go away but trades away v3's improvements (performance, active maintenance, new trace types) to paper over a wiring problem. The dependency version is not the bug.

**Fix applied:** The factory pattern — `react-plotly.js`'s documented escape hatch for exactly this situation:

```js
// Before
import Plot from 'react-plotly.js'

// After
import _createPlotlyComponent from 'react-plotly.js/factory'
import Plotly from 'plotly.js-dist-min'
const createPlotlyComponent = _createPlotlyComponent.default ?? _createPlotlyComponent
const Plot = createPlotlyComponent(Plotly)
```

`react-plotly.js/factory` exports `createPlotlyComponent(Plotly)` — you supply the Plotly instance yourself, bypassing the hardwired internal import entirely. The React component wrapper is built around your Plotly, not the one `react-plotly.js` would have fetched internally.

---

### Error 2 — `ReferenceError: global is not defined`

**Where:** Deep inside `plotly__js.js` (Vite's processed bundle of `plotly.js`).

**Cause:** `plotly.js` (the source package) was written for webpack/Node environments where `global` is a known runtime identifier. Vite is ESM-first and does not polyfill Node.js globals — `global` simply does not exist in the browser. Webpack shimmed this automatically for years, so many CJS libraries grew an implicit dependency on it.

**Intermediate fix considered:** `define: { global: 'globalThis' }` in `vite.config.js` — a compile-time text substitution that rewrites every `global` reference to `globalThis` before the browser sees it. This would have worked, but it revealed the next error immediately, which indicated a deeper problem with using `plotly.js` source directly in Vite.

**Root fix:** Switch from `plotly.js` to `plotly.js-dist-min`. See Error 3.

---

### Error 3 — `TypeError: Cannot read properties of undefined (reading 'prototype')`

**Where:** Deep inside `plotly__js.js`, multiple frames.

**Cause:** `plotly.js` (the source package) is a large CJS module with complex circular dependencies between its internal files. When Vite processes it through its own ESM transform pipeline, some of those circular dependencies resolve to `undefined` at module evaluation time — before the actual exports are populated. Accessing `.prototype` on `undefined` throws. This is not a Plotly bug or a Vite bug in isolation; it is a fundamental incompatibility between CJS circular-dependency patterns and ESM's static evaluation order.

**Fix applied:** Replace `plotly.js` with `plotly.js-dist-min` and add both packages to `optimizeDeps.include`:

```bash
npm install plotly.js-dist-min
```

```js
// vite.config.js
optimizeDeps: {
  include: ['react-plotly.js/factory', 'plotly.js-dist-min'],
},
```

**Why `plotly.js-dist-min` solves all three errors:**

Plotly ships three packages for different use cases:

| Package | What it is | Use case |
|---|---|---|
| `plotly.js` | Raw source, all traces | webpack / custom build pipelines |
| `plotly.js-dist` | Pre-built browser bundle, full | Vite / CDN / direct browser use |
| `plotly.js-dist-min` | Same, minified (~3.2 MB) | Same, production-optimised |

`plotly.js-dist-min` is already a finished browser bundle — esbuild has already run on it, all circular dependencies are resolved, `global` references are already handled, and the export is a clean Plotly object. Vite does not need to transform it, so none of the CJS→ESM conversion issues apply.

`optimizeDeps.include` forces Vite's pre-bundler to process both packages through esbuild at startup, which handles CJS interop (including the `__esModule` flag on `react-plotly.js/factory`) correctly and stably.

---

### Final import shape in `SpiderPlot.jsx`

```js
import _createPlotlyComponent from 'react-plotly.js/factory'
import Plotly from 'plotly.js-dist-min'

// .default fallback: Vite's CJS interop wraps the module differently depending
// on whether the subpath was pre-bundled; this handles both shapes safely.
const createPlotlyComponent = _createPlotlyComponent.default ?? _createPlotlyComponent
const Plot = createPlotlyComponent(Plotly)
```

### Final `vite.config.js` addition

```js
optimizeDeps: {
  include: ['react-plotly.js/factory', 'plotly.js-dist-min'],
},
```

### Why all three errors required a hard restart

Vite's dependency pre-bundler (`esbuild`) runs once at dev server startup and caches results in `frontend/.vite/deps/`. The browser loads from that cache, not from `node_modules`. HMR only watches `src/` — it never re-runs the pre-bundler. Any change to `vite.config.js`, installed packages, or `optimizeDeps` is invisible to a running server.

```bash
rm -rf frontend/.vite && npm run dev
```

Deleting `.vite/` forces a clean pre-bundle on next startup. Without this, Vite may detect no config change and serve the stale broken cache.

---

## Phase 7: AI Filter — `ai_filter.py`, `POST /ai-filter`, frontend fixes

**Goal:** Translate natural language queries ("Show only HNSCC patients in Arm B") into validated filter state that updates the dropdowns and chart. The frontend UI was already built in Phase 5 — this phase adds the backend that it was waiting for, plus two frontend bugfixes.

---

### The central design question: LLM or rule-based parser?

The honest senior dev answer is: **for this specific domain, a rule-based parser is objectively the correct engineering choice.**

The filter space is fully enumerable — 2 arms, 2 doses, 3 tumor types, 7 known values total. A regex parser covering all natural language variants is ~25 lines of Python:

```python
ARM_PATTERN   = re.compile(r'\barm\s+([AB])\b', re.IGNORECASE)
DOSE_PATTERN  = re.compile(r'\b(1800|3000)\s*mg\b', re.IGNORECASE)
TUMOR_PATTERN = re.compile(r'\b(sqNSCLC|nsNSCLC|HNSCC)\b', re.IGNORECASE)
```

This is zero latency, zero API cost, zero network dependency, fully deterministic, and trivially testable with no mocking required. The LLM version adds 1–3 seconds of latency, API cost, non-determinism, and all the complexity described in this section — for no functional gain on queries within this domain.

**Why LLM is used anyway — two justifications:**

1. **The assignment is explicitly testing AI integration capability.** Choosing rule-based is technically correct but misses the point of the exercise. The evaluation criteria are: clean interface design, validation before applying, error handling, and architectural decisions. A rule-based parser demonstrates none of those in an interesting way.

2. **The query space escapes enumeration at the boundary.** The assignment spec lists "Hide patients with tumor shrinkage greater than 30%" as a target query. That query cannot be expressed by the current 3-filter schema at all — rule-based or LLM. An LLM with the `unsupported: true` flag at least fails gracefully with a clear error. A rule-based parser would silently return all-all-all.

**The most important design insight:** The architecture does not bet the codebase on the LLM choice. The entire AI module is swappable — `parse_filter_query` accepts a `client` as a dependency injection parameter, and `validate_filters` is a pure deterministic function that runs regardless of how the dict was produced. Replace the LLM with a regex parser and nothing else changes.

---

### The mental model: LLM as structured extractor, not decision-maker

This is the clearest way to understand the architecture:

```
Natural language (unstructured, infinite input space)
        ↓
   LLM (parse_filter_query)    ← the only thing the LLM does
        ↓
JSON dict (structured, finite output space)
        ↓
Rule-based Python (validate_filters)   ← deterministic, no LLM
        ↓
Trusted filter state
```

**`validate_filters` is not an LLM call.** It is a pure deterministic Python function. It receives a plain dict and runs deterministic rules — strip whitespace, coerce dose type, check set membership, reject anything outside known values. No network call, no randomness, no Anthropic dependency. The LLM's output is treated exactly like user input off a form: untrusted until it passes validation.

The LLM's only job is **structured extraction** — convert free text into a known schema so the rule-based code does not have to handle every possible phrasing. "Show me the 1800mg cohort", "patients on lower dose", "1800 mg arm" all route to the same `{"dose": "1800"}` dict. The rule-based layer then validates that dict with the same determinism it would apply to a manually typed HTTP parameter.

---

### Architecture — four functions, one responsibility each

#### `build_system_prompt(valid_arms, valid_doses, valid_tumors) → str`

Generates the LLM instruction from the live valid sets. Not a hardcoded string.

**Why dynamic, not hardcoded:**
The roadmap's original draft hardcoded `"arm": "A"|"B"|"all"` in the prompt string. This creates three separate sources of truth that can drift independently:
1. `app.py` derives `VALID_ARMS/DOSES/TUMORS` from the DataFrame at startup
2. `ai_filter.py` would hardcode those same values as a static string
3. The system prompt would describe values the validator might reject

If the CSV gains a new tumor type, `app.py` auto-adapts. A hardcoded prompt still lists only the original three types — the model returns the new type, the validator rejects it, the user gets a 400 with no useful message.

**Why tested like code:** The system prompt is the most fragile part of the system. One removed sentence — the `"unsupported": true` instruction — silently breaks the unsupported-query detection mechanism. All other tests continue to pass. Because prompts are code, they must be tested like code: `test_system_prompt_contains_unsupported_instruction` asserts the key instruction is present; `test_system_prompt_injects_valid_values_not_hardcoded` asserts that passing `{'X', 'Y'}` produces `"X"` in the prompt and not `"A"`.

**Maintainability:** One function to update when the filter schema grows. The LLM's awareness of valid values is always in sync with the validator's awareness because they are derived from the same sets passed as arguments.

#### `parse_llm_response(raw: str) → dict`

Parses raw LLM text to a dict. Catches `json.JSONDecodeError` and re-raises as `ValueError`.

**Why this function exists as a standalone:**
`json.JSONDecodeError` is not a `ValueError`. The `/ai-filter` route catches `ValueError → 400` and `Exception → 500`. If `json.loads` throws `JSONDecodeError` without being caught and re-raised, the endpoint returns a 500 for what is actually a recoverable condition — the model returned prose instead of JSON. That is a 400 (bad LLM output, caused by the user's query) not a 500 (unexpected server failure).

Extracting this function makes the exception contract explicit and testable: `test_parse_llm_response_non_json_raises_valueerror_not_jsondecodeerror` asserts the specific exception type. Without this test, a refactor that catches `Exception` directly in the endpoint could silently swallow the wrong exception type and return the wrong status code.

**Conciseness:** Four lines. Its only job is the type boundary between raw text and structured data.

#### `validate_filters(parsed, valid_arms, valid_doses, valid_tumors) → dict`

Normalizes and validates a parsed dict. Pure Python, zero Anthropic dependency.

**Why normalization before validation:**
The HTTP layer in `app.py` is strict — `?arms=a` returns 400, because user-controlled parameters must have predictable contracts. The AI layer should be lenient — if the model returns `" A "` (whitespace) or `"a"` (lowercase), the intent is unambiguous. Rejecting it as invalid is the wrong call at this boundary.

```python
# Before validation: normalize
arm   = str(parsed['arm']).strip()
dose  = str(int(str(dose_raw).strip()))  # handles int 1800 or string "1800"
tumor = str(parsed['tumor_type']).strip()
```

The existing `test_api.py` tests `test_lowercase_arm_returns_400` — strict validation on HTTP parameters is correct for adversarial input. The AI layer tests `test_validate_filters_strips_whitespace_from_arm_and_tumor` — lenient normalization is correct for a model trying to help. Same concept, opposite policy, both correct for their context.

**Why standalone:**
The 11 validation cases — missing key, whitespace, int dose, unsupported flag, all-all-all, invalid arm, invalid dose, invalid tumor, non-numeric dose, dose string coercion, dose int coercion — are all testable with plain dict inputs and no Anthropic import. If validation were inside `parse_filter_query`, testing any of these would require setting up a mock LLM client. Extracting it means the test reads:

```python
result = validate_filters({'arm': ' A ', 'dose': 1800, ...}, VALID_ARMS, ...)
assert result['arm'] == 'A'
assert result['dose'] == '1800'
```

No mock, no network, no setup.

**Why `int(dose) not in valid_doses` with try/except:**
The roadmap's draft did `int(dose)` with no error handling. If the model returns `"1800mg"` or `null`, `int()` throws `TypeError` — not caught by the `except ValueError` in the endpoint, falls through to `except Exception`, returns 500. Wrapping in `try/except (ValueError, TypeError)` ensures non-numeric dose always produces a user-facing 400.

**The all-all-all case:**
If the model returns `{"arm": "all", "dose": "all", "tumor_type": "all"}` without the `unsupported` flag, it is ambiguous — "show all patients" and "I could not parse your query" produce identical output. The validator rejects this with a hint to use Reset All, which already handles the legitimate "show all" use case. The `unsupported: true` flag is the unambiguous signal for out-of-scope queries.

**Dose always returned as string:**
FilterPanel's `<select>` elements use string `value` attributes — `"1800"`, `"3000"`, `"all"`. The `validate_filters` function always returns dose as a string. This makes the type contract across the entire pipeline predictable: API rows have `dose` as int, filter state has `dose` as string, `parseInt(filters.dose)` is the one explicit conversion. Without this, `json.dose` could be `1800` (int) or `"1800"` (string) depending on the model's mood, and the `parseInt` conversion in `Visualisation.jsx` would hide intermittent mismatches.

#### `parse_filter_query(query, *, client, valid_arms, valid_doses, valid_tumors) → dict`

Orchestrates the pipeline: validate query → build prompt → call LLM → parse → validate.

**Why dependency injection (`client` as kwarg):**
A module-level `client = anthropic.Anthropic()` singleton is a hidden global dependency. To test `parse_filter_query`, a test must either call the real API (non-deterministic, costs money, requires credentials in CI) or monkeypatch the module-level variable (`monkeypatch.setattr(ai_filter, 'client', mock)`). Monkeypatching a module internal is brittle — renaming the variable silently breaks every test.

With DI, the test passes the mock directly:
```python
result = parse_filter_query("Show Arm A", client=make_mock_client('{"arm": "A", ...}'), ...)
```
No monkeypatching. No module state. The function is a pure transformation of its inputs. The caller (the Flask route) owns the client lifecycle.

**Timeout and retry calibration:**
```python
response = client.messages.create(..., timeout=5.0)
# Client created with: anthropic.Anthropic(max_retries=1)
```

The Anthropic SDK has `max_retries=2` by default. With `timeout=5.0`, worst-case backend time is `5s × (2+1) = 15s`. The frontend uses `AbortSignal.timeout(12000)` — 12 seconds. At 15s the browser cancels but the Flask worker is still blocked, tying up a thread for 3 extra seconds. Under load, this compounds.

`max_retries=1` gives worst-case `5s × 2 = 10s`, safely under 12s. The browser and server timeout windows stay aligned. This is a correctness property, not a performance optimisation — the distinction matters because it cannot be deferred.

**Why empty query is checked before the LLM call:**
`test_parse_filter_query_empty_query_raises_before_llm_call` asserts `client.messages.create.assert_not_called()`. The empty-query check fires first, raises `ValueError('Query cannot be empty')`, and returns without consuming any API credits or latency. This is the correct early-return pattern: validate cheap preconditions before expensive I/O.

---

### `POST /ai-filter` route in `app.py` — thin adapter only

The route is a facade. Its only job is HTTP concerns: parse body, call `parse_filter_query`, serialize response.

```python
@app.route('/ai-filter', methods=['POST'])
def ai_filter():
    body = request.get_json(silent=True)
    if not body or 'query' not in body:
        return jsonify({'error': 'Missing query'}), 400
    try:
        filters = parse_filter_query(query, client=_anthropic_client, ...)
        return jsonify(filters)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    except Exception:
        return jsonify({'error': 'AI filter unavailable. Please try again.'}), 500
```

**`ValueError → 400`, `Exception → 500`:**
`ValueError` is the single exception type `ai_filter.py` raises for all expected failure modes: empty query, non-JSON response, missing keys, invalid values, unsupported query. `Exception` catches truly unexpected failures — network timeout, SDK crash — without leaking a stack trace. The two-bucket split makes the contract readable: `ValueError` is "the caller caused this", `Exception` is "something unexpected broke".

**`_anthropic_client` created once at startup:**
`app.py` already owns all startup singletons — `df`, `VALID_ARMS/DOSES/TUMORS`. The Anthropic client belongs in the same category. Creating it per-request would re-validate the API key and re-initialise retry/timeout config on every call. `_anthropic_client = anthropic.Anthropic(max_retries=1)` runs once; the route passes it into `parse_filter_query` via DI.

**`load_dotenv` must be the first executable line in `app.py`:**
`anthropic.Anthropic()` reads `ANTHROPIC_API_KEY` at instantiation. If `load_dotenv` runs after the client is created, the key is `None` and the client initialises silently with no credentials — the `AuthenticationError` only surfaces on the first API call. `load_dotenv(Path(__file__).parent / '.env')` is called immediately after the stdlib imports, before Flask, before `from ai_filter import`, before `from data import load_data`.

---

### Two frontend bugs fixed in `Visualisation.jsx`

#### Bug 1: `res.ok` not checked before `.json()`

The original `handleAiFilter`:
```javascript
const json = await res.json()    // called unconditionally
if (json.error) { setAiError(json.error); return }
```

Flask in dev mode returns an HTML error page for any unhandled 500. Calling `.json()` on an HTML body throws `SyntaxError: Unexpected token '<'`. This falls into the outer `catch` which sets `"Could not connect to AI filter."` — the wrong error, pointing at the wrong layer. The connection succeeded; the server crashed. The fix:

```javascript
if (!res.ok) {
  let msg = 'AI filter failed.'
  try { const e = await res.json(); if (e.error) msg = e.error } catch {}
  setAiError(msg)
  return
}
const json = await res.json()
```

**Maintainability:** The two cases — HTTP failure and JSON parse failure — now have explicit branches. A developer debugging a 500 sees "AI filter failed." not "Could not connect." The diagnosis is correct.

#### Bug 2: stale `aiError` after manual dropdown change

`aiError` lives in `Visualisation.jsx` and is displayed in `FilterPanel.jsx`. When the user gets an AI error and then manually changes a dropdown, the error stays visible indefinitely — `setSelectedArm` does not clear `aiError`. `handleReset` already calls `setAiError(null)`. The manual handlers need the same treatment:

```jsx
// Before
onArmChange={setSelectedArm}

// After
onArmChange={v => { setAiError(null); setSelectedArm(v) }}
```

**Maintainability:** The rule is now consistent and visible in JSX: any action that supersedes the AI result clears the error. Reset All clears it (already did). Manual dropdown change clears it (now does). The user is never looking at an error message that no longer describes the current state of the UI.

---

### Test strategy — why zero real API calls

The test suite for `ai_filter.py` has four concern groups:

| Group | What it tests | LLM involved? |
|---|---|---|
| 1. `validate_filters` | Normalization, type coercion, set membership, all 11 error cases | No |
| 2. `parse_llm_response` | JSON parsing, JSONDecodeError → ValueError contract | No |
| 2b. `build_system_prompt` | Valid values injected, unsupported instruction present | No |
| 3. `parse_filter_query` | Orchestration wiring, empty-query guard, dose normalization | Mock only |
| 4. `POST /ai-filter` | HTTP layer — 400 on missing body, 400 on bad LLM JSON, 200 on valid | Mock only |

**Why no real API calls:** Non-determinism means the same query can return different JSON twice. A test asserting `result['arm'] == 'A'` for "Show Arm A patients" will pass 95% of the time and fail 5%. A flaky test is worse than no test — it trains the team to ignore failures. Real API tests also require `ANTHROPIC_API_KEY` in CI and add 1–3 seconds per call.

**What actually tests the real LLM:** The Step 3 curl verification and a manual eval table:

```python
EVAL_CASES = [
    ("Show Arm A patients only",             {"arm": "A",   "dose": "all",  "tumor_type": "all"}),
    ("Display only HNSCC patients in Arm B", {"arm": "B",   "dose": "all",  "tumor_type": "HNSCC"}),
    ("1800mg dose patients",                 {"arm": "all", "dose": "1800", "tumor_type": "all"}),
    ("Hide patients with shrinkage > 30%",   "unsupported"),
    ("HNSCC only, exclude Arm B",            "unsupported"),  # negation — current schema can't express
]
```

These run manually against the real API before submission. The pass rate tells you whether the system prompt is good enough. This is the correct separation: unit tests verify code correctness; manual evals verify prompt quality.

**The `ai_client` fixture — why it yields only the client:**
An earlier draft yielded a tuple `(c, monkeypatch)`. `monkeypatch` is a built-in pytest fixture already injected into any test that declares it as a parameter. Threading it through a tuple serves no purpose and signals confusion about how pytest fixtures work. The fixture yields only what it owns — the Flask test client.

---

### Decisions summary

| Decision | Alternative | Why rejected | Impact |
|---|---|---|---|
| LLM for query parsing | Rule-based regex | Assignment evaluates AI integration; LLM handles compound phrasing and scope gracefully | Latency cost is the tradeoff |
| `validate_filters` is pure Python, not LLM | Validate inside LLM prompt | LLM output is untrusted — treat it like user input off the wire | Testable in isolation with no mock |
| DI: `client` as kwarg | Module-level `client = anthropic.Anthropic()` | Hidden global makes function untestable without monkeypatching | Clean test seam |
| Dynamic `build_system_prompt` | Hardcoded prompt string | Hardcoded values drift from CSV; three sources of truth | Single source: the DataFrame |
| Normalize before validate | Validate raw LLM output | `" A "` (whitespace) and `"a"` (lowercase) are unambiguous intent — rejecting them is wrong at this boundary | Lenient at AI boundary, strict at HTTP boundary |
| `max_retries=1, timeout=5.0` | SDK defaults (`max_retries=2`, no timeout) | Default worst-case = 15s, exceeds frontend's 12s timeout — thread leak | Backend and frontend timeouts stay aligned |
| Dose always string | Return int for numeric doses | FilterPanel `<select>` values are strings; one explicit `parseInt` bridge | Type contract is predictable end-to-end |
| `res.ok` check before `.json()` | Unconditional `.json()` | Flask 500 returns HTML; `.json()` throws SyntaxError, shows wrong error | Correct error message on server crash |
| `setAiError(null)` on dropdown change | Only clear on Reset All | Stale error persists after user manually overrides — UI lies about current state | Feedback loop is honest |

---

## Phase 8: Eval Suite — LLM Parsing Verification

### The problem with the original test strategy

The previous section documented "why zero real API calls" as a deliberate design decision. That was the right call for the unit test suite. It is the wrong call for the AI filter as a whole.

Here is what the mocked `parse_filter_query` tests actually do: `make_mock_client('{"arm": "A", ...}')` hardcodes the response, then the test asserts `result['arm'] == 'A'`. That is not testing the LLM. That is testing that `validate_filters` passes valid input through — which is already covered by the section-1 pure-function tests. Five tests, zero new signal. They survive prompt changes, model swaps, and refactors without ever failing. That is the definition of a lying test.

The product's actual risk — "will Claude correctly extract `sqNSCLC` from 'squamous lung cancer'?" — is completely unverified by the mocked suite. False confidence is worse than no tests because it suppresses the question.

The original manual eval table was the right instinct:

```python
EVAL_CASES = [
    ("Show Arm A patients only", {"arm": "A", "dose": "all", "tumor_type": "all"}),
    ...
]
```

This plan formalises that instinct into a parametrised, runnable, versioned eval suite.

---

### Architecture: data-driven parametrised eval

**Three files, three jobs, no overlap:**

```
eval_cases.json     — ground truth: query → expected output. No logic.
test_eval_llm.py    — dumb runner: reads JSON, calls real API, asserts. Never changes.
pytest.ini          — registers eval marker. One job.
```

**Why JSON and not inline `@pytest.mark.parametrize`:**
A Python parametrize list requires Python knowledge to edit. JSON does not. A clinician or QA engineer can add a case by editing one object. The runner never changes. Cases and runner change on completely independent schedules — that is the correct coupling.

The failure mode of inline parametrize: as the list grows past 30 entries, the test file becomes unreadable. Reviewers stop auditing individual cases. The dataset silently accumulates redundant or wrong cases nobody questions because they are buried in Python.

**Why a separate `test_eval_llm.py` and not appended to `test_ai_filter.py`:**
Unit tests are fast, offline, always-run, require no credentials. Eval tests are slow, live-API, manually-triggered, require `ANTHROPIC_API_KEY`. Mixing them in one file means anyone running `pytest tests/test_ai_filter.py` accidentally triggers live API calls and needs a key. The offline guarantee — "I can run the unit tests without any external dependency" — is a hard requirement for a usable test suite.

**Why `@pytest.mark.eval` and not a `make eval` target:**
The marker is pytest-native. It composes with `-m "not eval"` which is the standard CI pattern. `make eval` is build-tool coupling — it breaks on machines without Make, requires documentation, and does not integrate with pytest's output format. The marker costs one `pytest.ini` entry and works everywhere pytest works.

**Why not a `conftest.py` fixture for the real client:**
`conftest.py` is auto-imported by every test file in the directory. A `real_anthropic_client` fixture there implies any test could use a live API call — a scope mismatch. Also: `pytest.skip()` inside a `conftest` fixture fires at setup time, producing `ERROR` in the output instead of `SKIP`. Inside the test body it produces a clean `s`. The distinction matters when reading CI output at 2am.

---

### Defensive normalisation at the AI boundary

`validate_filters` originally had no case normalisation for arm or tumor:

```python
arm = str(parsed['arm']).strip()               # .strip() only
tumor = str(parsed['tumor_type']).strip()      # .strip() only
```

Claude returning `"a"` instead of `"A"` raised `ValueError: "a" is not a recognised arm`. The user typed a valid query. The rejection was caused by an internal casing assumption leaking out as a user-facing error.

**The fix and why each field is handled differently:**

```python
arm = str(parsed['arm']).strip().upper()
```
Arm values are single letters. `.upper()` is safe and total — there are no mixed-case arm codes.

```python
tumor_map = {t.lower(): t for t in valid_tumors}
tumor_raw = str(parsed['tumor_type']).strip().lower()
tumor = tumor_map.get(tumor_raw, tumor_raw)
```
Tumor codes have internal mixed case: `sqNSCLC`, `nsNSCLC`, `HNSCC`. `.upper()` produces `SQNSCLC` — not in the valid set, wrong rejection. The lookup map recovers canonical casing from the live valid set. If Claude returns something entirely unknown, `tumor_map.get(tumor_raw, tumor_raw)` falls through to the validation check and raises correctly. The fallback is the raw value, not a default — unknown input still fails, just cleanly.

**Dose is unchanged.** `str(int(str(dose_raw).strip()))` strips casing by converting to a number. Already correct.

**The design principle:** At the boundary between external system output (Claude) and internal application state, normalise aggressively. The HTTP boundary (`/data?arms=a`) is strict — a human sent that, wrong casing is a caller error worth a 400. The AI boundary is lenient — a model sent that, casing variation is a model behaviour worth normalising. Two different trust levels, two different contracts.

---

### Layer separation: where documentation belongs

The `eval_cases.json` fixture has a `notes` field on every `accept_any` case:

```json
{
  "id": "ambiguous-squamous-alone",
  "query": "squamous cancer patients",
  "accept_any": [
    {"arm": "all", "dose": "all", "tumor_type": "sqNSCLC"},
    {"arm": "all", "dose": "all", "tumor_type": "HNSCC"}
  ],
  "notes": "squamous maps to both sqNSCLC and HNSCC — model picks one consistently but choice is arbitrary"
}
```

`notes` is a plain string. It has no logic. It appears only when an `accept_any` assertion fails — printed in the failure output so the person debugging immediately understands why the case is structured the way it is.

**Why `notes` stays in the JSON and never propagates to production code:**

`notes` is metadata about a test case — it explains why a test is structured a certain way. That is a test-layer concern. Writing it into `ai_filter.py` or `app.py` would be explaining test decisions in production code.

The failure mode of propagating it: six months later someone reads `validate_filters` and sees a comment referencing "eval case ambiguous-squamous-alone." That comment is now coupled to a specific test case ID that may have been renamed or deleted. The production code has acquired a dependency on test naming conventions. That is backwards coupling — test infrastructure leaking upward into production code.

**The one marginal exception:** `build_system_prompt` is where the squamous ambiguity originates. There is an argument for:

```python
# "squamous" alone maps to both sqNSCLC and HNSCC — model picks one; accepted as known ambiguity
```

But even that is borderline. The ambiguity is a domain fact, not a code fact. A developer reading the CSV will see both squamous tumor types and understand. The comment adds noise without adding understanding the code does not already provide. The decision: no comment in production code. The `notes` field in the JSON is sufficient.

---

### Ambiguous cases: `accept_any` not `expect_error`

Four queries in the eval dataset cannot have a single correct answer:

| Query | Ambiguity |
|---|---|
| "squamous cancer patients" | Both sqNSCLC and HNSCC are squamous |
| "lung cancer patients" | Both sqNSCLC and nsNSCLC are lung cancer |
| "high dose patients" | Colloquially 3000mg but not explicit |
| "low dose patients" | Colloquially 1800mg but not explicit |

**Why `accept_any` and not `expect_error`:**

The `unsupported` flag was designed for queries that cannot be expressed as arm/dose/tumor at all — response rates, dates, numeric changes. "Squamous cancer" is a valid tumor-type query. Raising an error tells the user "I don't understand squamous cancer" — that is a lie. The system understands it; there are just two matches. Erroring on valid medical terminology to avoid ambiguity is a worse product decision than picking one.

`accept_any` is honest: it documents the ambiguity, passes either reasonable answer, and catches a completely wrong parse (kidney cancer, wrong field, empty output). It is a loose lower bound, not a precise assertion — and that is the right contract for ambiguous input.

**The failure mode of `accept_any`:** It passes silently when the model picks either answer. That looks like success. The user querying "squamous cancer" still does not know which patients they are seeing. `accept_any` documents the gap; it does not close it. The proper fix — a `"confidence": "high|low"` response field that triggers a clarification prompt — was evaluated and explicitly deferred. The valid value space is small enough that true ambiguity is rare. In production, this would be the first thing added.

---

### What the eval suite actually proves vs what it does not

**Proves:**
- The system prompt, as currently written, causes Claude to correctly parse the 25 non-ambiguous cases
- Synonym mapping works: plain English medical descriptions map to internal codes
- Case normalisation works: lowercase input from the model normalises before hitting the validator
- Combined extraction works: all three fields extracted correctly in a single query
- The `unsupported` flag fires on out-of-scope queries
- Model output casing variations do not cause false rejections

**Does not prove:**
- That a prompt change did not break something — the eval must be re-run manually after every prompt edit
- That a model upgrade does not degrade parsing — same, re-run required
- That the `unsupported` cases fail for the right reason — `expect_error: true` passes any `ValueError`, including the all-all-all guard firing when the model cannot parse a query instead of correctly flagging it unsupported. These are two different failures with one test shape.
- That latency is acceptable under load — the eval runs one call at a time sequentially

**Why the eval is still worth having despite these gaps:**
An eval that proves eight things and misses four is better than a mocked suite that proves nothing about the LLM while appearing to test it. The gaps are documented. The mocked tests were not — they just silently passed.

---

### Deleted tests and why

Four tests were deleted from `test_ai_filter.py`:

| Deleted | Reason |
|---|---|
| `test_parse_filter_query_arm_extracted` | Tests `validate_filters` through a wrapper. Already covered by `test_validate_filters_valid_arm_only`. |
| `test_parse_filter_query_dose_int_from_model_normalized` | Tests int coercion through a wrapper. Already covered by `test_validate_filters_dose_int_coerced_to_string`. |
| `test_parse_filter_query_bad_json_raises_valueerror` | Tests `parse_llm_response` through a wrapper. Already covered by `test_parse_llm_response_non_json_raises_valueerror_not_jsondecodeerror`. |
| `test_parse_filter_query_unsupported_raises_valueerror` | Tests unsupported flag through a wrapper. Already covered by `test_validate_filters_unsupported_flag_raises_valueerror`. |

**The one kept:**

```python
def test_parse_filter_query_empty_query_raises_before_llm_call():
    client = make_mock_client('{}')
    with pytest.raises(ValueError, match='empty'):
        parse_filter_query('', client=client, ...)
    client.messages.create.assert_not_called()   # ← the only reason this test exists
```

`assert_not_called()` is the only thing in the entire suite that guards the early-exit path. Delete this test and someone can remove the `if not query` guard with no failing test. The mock is not testing the LLM here — it is verifying that the LLM is never reached on empty input. That is a contract worth asserting.

**Test count after:**

| File | Before | After |
|---|---|---|
| `test_ai_filter.py` | 25 | 21 |
| `test_eval_llm.py` | 0 | 29 |
| **Total** | **25** | **50** |

Fewer unit tests that mean something. More eval tests that cover the actual product risk. The tradeoff is correct.

---

### Decisions summary — eval suite

| Decision | Alternative | Why rejected | Failure mode if wrong decision taken |
|---|---|---|---|
| Real API calls in eval | Mock client | Mocking validates the prompt was sent, not that Claude parsed it — the current broken state | Prompt regressions, model swaps, casing changes all invisible |
| JSON fixture | Inline parametrize | Python knowledge required to add cases; 50-entry parametrize list is unreadable | Dataset grows unaudited; wrong cases accumulate |
| Separate `test_eval_llm.py` | Append to `test_ai_filter.py` | Breaks offline guarantee; API key required for unit tests | CI fails without credentials; devs avoid running tests locally |
| `eval` marker | `make eval` target | Build-tool coupling; breaks on machines without Make | Eval never runs because the command is not portable |
| `notes` in JSON only | Comments in `ai_filter.py` | Backwards coupling — test naming conventions leak into production code | Comment references renamed test case; confusion about what is still true |
| `accept_any` for ambiguous | `expect_error` | Ambiguous queries are valid user intent; erroring on "squamous cancer" is dishonest | User gets 400 on a valid query; trust in the filter erodes |
| Arm `.upper()`, tumor lookup map | No normalisation | Claude casing varies by query and model version — validator rejects valid intent | Case-variant outputs cause 400s; users cannot explain why their query failed |
| Delete 4 mocked tests | Keep them | They add zero signal while consuming trust; a green lying test is worse than no test | Developers believe the LLM path is tested; prompt regressions go unnoticed |
