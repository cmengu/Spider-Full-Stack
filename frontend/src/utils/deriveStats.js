/** Aggregate landing-page stats from raw spider API rows (see `Landing.jsx`). */
export function deriveStats(rows) {
  const patients = new Set(rows.map(r => r.subject_id)).size
  const arms = [...new Set(rows.map(r => r.arm))].sort().join(', ')
  const doses = [...new Set(rows.map(r => Number(r.dose)))]
    .sort((a, b) => a - b)
    .map(d => `${d}mg`)
    .join(', ')
  return { patients, arms, doses }
}
