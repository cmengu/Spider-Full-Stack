"""
Pure AI-filter functions. No Flask, no module-level state, no valid-set constants.

Design decisions:
- Dependency injection: client passed as kwarg so callers (and tests) control lifecycle.
- SRP decomposition: build_system_prompt / parse_llm_response / validate_filters are
  independently testable with zero Anthropic dependency.
- Single source of truth: valid sets come from the DataFrame in app.py, never redeclared here.
- Normalization before validation: strip whitespace, coerce dose type before set membership checks.
- Unsupported-query detection: LLM sets "unsupported": true when query is out of scope,
  preventing silent all-all-all no-ops.
"""

import json
import re
import anthropic


def build_system_prompt(
    valid_arms: set,
    valid_doses: set,
    valid_tumors: set,
) -> str:
    """
    Generate the system prompt dynamically from the live valid sets.
    Regenerated on each call so that CSV changes propagate without restart.
    """
    arm_opts = ' | '.join(f'"{a}"' for a in sorted(valid_arms)) + ' | "all"'
    dose_opts = ' | '.join(f'"{d}"' for d in sorted(str(d) for d in valid_doses)) + ' | "all"'
    tumor_opts = ' | '.join(f'"{t}"' for t in sorted(valid_tumors)) + ' | "all"'
    return (
        'You are a clinical trial data filter assistant.\n'
        'Return ONLY a JSON object with exactly these keys:\n'
        f'{{"arm": {arm_opts}, "dose": {dose_opts}, "tumor_type": {tumor_opts}}}\n'
        'Rules:\n'
        '- Use "all" for any filter the user did not mention.\n'
        '- If the user only gives a broad cancer description that could match more than one '
        'tumour type (e.g. "lung cancer" without squamous vs non-squamous detail), still pick '
        'one tumour_type from the allowed list and set arm and dose to "all" — do not set '
        'unsupported solely because the case is broad.\n'
        '- If the request cannot be expressed using arm, dose, or tumor type '
        '(e.g. filtering by numeric change values, response rates, or dates), '
        'set all three to "all" AND add "unsupported": true to the object.\n'
        '- Never invent arms, doses, or tumor types outside the lists above.\n'
        'Return JSON only — no prose, no markdown, no code fences.'
    )


def _strip_optional_json_fence(raw: str) -> str:
    """
    Extract JSON content from raw LLM text.
    Handles: plain JSON, ```json fences, ``` fences, multiline JSON bodies,
    trailing spaces on fence line. Falls back to raw stripped text so
    json.loads produces the error on genuinely invalid input.
    """
    text = raw.strip()
    if text.startswith('{'):
        return text
    m = re.search(r'```(?:json)?\s*\n?(.*?)\n?\s*```', text, re.DOTALL)
    if m:
        return m.group(1).strip()
    return text


def parse_llm_response(raw: str) -> dict:
    """
    Parse raw LLM text into a dict.
    Raises ValueError (not JSONDecodeError) so callers catch one exception type.
    Never leaks raw model output beyond a 120-char truncated snippet in the message.
    """
    text = _strip_optional_json_fence(raw)
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f'Model returned non-JSON output: {raw[:120]!r}'
        ) from exc


def validate_filters(
    parsed: dict,
    valid_arms: set,
    valid_doses: set,
    valid_tumors: set,
) -> dict:
    """
    Normalize and validate a parsed LLM response dict.

    Normalization (runs before validation):
    - Strip whitespace from string fields.
    - Coerce dose to string: int 1800 → "1800", str "1800" → "1800", "all" → "all".

    Raises ValueError with a user-friendly message (never leaking internal model output)
    for: missing keys, unsupported-flag, invalid values, non-numeric dose, all-all-all.
    """
    # Guard: all three keys must be present
    for key in ('arm', 'dose', 'tumor_type'):
        if key not in parsed:
            raise ValueError(
                f"Filter not applied: model response was missing required field '{key}'. "
                'Try rephrasing your query.'
            )

    # Unsupported query — model explicitly flagged it
    if parsed.get('unsupported'):
        raise ValueError(
            'That type of filter is not supported. '
            'Try filtering by arm (A or B), dose (1800mg or 3000mg), '
            'or tumor type (sqNSCLC, nsNSCLC, HNSCC).'
        )

    # Normalize — arm: uppercase single-letter arms; preserve literal "all" (any casing)
    _arm_raw = str(parsed['arm']).strip()
    arm = 'all' if _arm_raw.lower() == 'all' else _arm_raw.upper()

    dose_raw = parsed['dose']
    dose_str = str(dose_raw).strip().lower()
    if dose_str == 'all':
        dose = 'all'
    else:
        try:
            # Accepts int 1800 or string "1800" — rejects "1800mg", null, etc.
            dose = str(int(str(dose_raw).strip()))
        except (ValueError, TypeError):
            raise ValueError(
                'Filter not applied: dose must be a number or "all". '
                'Try rephrasing your query.'
            )

    tumor_map = {t.lower(): t for t in valid_tumors}
    tumor_raw = str(parsed['tumor_type']).strip().lower()
    tumor = tumor_map.get(tumor_raw, tumor_raw)

    # Validate against live sets
    if arm != 'all' and arm not in valid_arms:
        raise ValueError(
            f'Filter not applied: "{arm}" is not a recognised arm. '
            f'Valid arms: {sorted(valid_arms)}.'
        )
    if dose != 'all' and int(dose) not in valid_doses:
        raise ValueError(
            f'Filter not applied: {dose}mg is not a recognised dose. '
            f'Valid doses: {sorted(valid_doses)}mg.'
        )
    if tumor != 'all' and tumor not in valid_tumors:
        raise ValueError(
            f'Filter not applied: "{tumor}" is not a recognised tumor type. '
            f'Valid types: {sorted(valid_tumors)}.'
        )

    # All-all-all without unsupported flag = query was ambiguous or unparseable
    if arm == 'all' and dose == 'all' and tumor == 'all':
        raise ValueError(
            'Could not extract a specific filter from your query. '
            'To show all patients, use Reset All. '
            'Example queries: "Show Arm A patients", "1800mg dose only", "HNSCC patients in Arm B".'
        )

    return {'arm': arm, 'dose': dose, 'tumor_type': tumor}


def parse_filter_query(
    query: str,
    *,
    client: anthropic.Anthropic,
    valid_arms: set,
    valid_doses: set,
    valid_tumors: set,
) -> dict:
    """
    Translate a natural language query into a validated filter dict.

    Timeout/retry: timeout=5.0 per attempt, max_retries=1 on client (set in app.py).
    Worst-case backend time: 5s × 2 attempts = 10s < frontend AbortSignal.timeout(12000ms).

    Raises ValueError for: empty query, non-JSON response, missing keys,
                            unsupported query, invalid values, all-all-all.
    Never raises JSONDecodeError or TypeError — all exceptions are normalized to ValueError.
    """
    if not query or not query.strip():
        raise ValueError('Query cannot be empty')

    system_prompt = build_system_prompt(valid_arms, valid_doses, valid_tumors)

    response = client.messages.create(
        model='claude-haiku-4-5-20251001',
        max_tokens=256,
        system=system_prompt,
        messages=[{'role': 'user', 'content': query.strip()}],
        timeout=5.0,
    )
    raw = response.content[0].text.strip()
    parsed = parse_llm_response(raw)
    return validate_filters(parsed, valid_arms, valid_doses, valid_tumors)
