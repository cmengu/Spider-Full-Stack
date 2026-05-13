// frontend/src/utils/transformData.js

/**
 * @typedef {Object} DataPoint
 * @property {number} weeks  - Days converted to weeks (days / 7)
 * @property {number} change - Tumour size % change from baseline
 */

/**
 * @typedef {Object} PatientSeries
 * @property {string}      subject_id - e.g. '08-201'
 * @property {string}      arm        - e.g. 'A' or 'B'
 * @property {number}      dose       - e.g. 1800 or 3000 (integer mg)
 * @property {string}      tumor_type - e.g. 'HNSCC'
 * @property {string}      colorKey   - e.g. 'ARM A 1800 mg' — matches keys in constants.js (Plotly colors)
 * @property {DataPoint[]} points     - sorted ascending by weeks, always starts at {weeks:0, change:0}
 */

/**
 * Transforms flat API rows into per-patient series ready for Plotly.
 *
 * Steps applied (three sequential O(n) passes):
 *   1. Build a Set of subject IDs that have a real day-0 row
 *   2. Group rows by subject_id, convert days→weeks, coerce dose to number
 *   3. Inject synthetic baseline {weeks:0, change:0} for patients without one, then sort
 *
 * @param {Object[]|null|undefined} rows - Raw rows from GET /spider
 * @returns {PatientSeries[]}
 */
export function buildPatientSeries(rows) {
  if (!rows || rows.length === 0) return []

  const dayZeroSubjects = new Set(
    rows
      .filter(r => Number(r.days) === 0)
      .map(r => r.subject_id),
  )

  const grouped = {}

  rows.forEach(row => {
    const key = row.subject_id
    if (!grouped[key]) {
      const dose = Number(row.dose)
      grouped[key] = {
        subject_id: row.subject_id,
        arm: row.arm,
        dose,
        tumor_type: row.tumor_type,
        colorKey: `ARM ${row.arm} ${dose} mg`,
        points: [],
      }
    }
    grouped[key].points.push({
      weeks: Number(row.days) / 7,
      change: row.change,
    })
  })

  Object.values(grouped).forEach(patient => {
    patient.points.sort((a, b) => a.weeks - b.weeks)
    if (!dayZeroSubjects.has(patient.subject_id)) {
      patient.points.unshift({ weeks: 0, change: 0 })
    }
  })

  return Object.values(grouped).sort(
    (a, b) => a.arm.localeCompare(b.arm) || a.dose - b.dose,
  )
}
