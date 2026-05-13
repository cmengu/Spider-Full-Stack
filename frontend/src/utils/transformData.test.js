// frontend/src/utils/transformData.test.js
import { describe, it, expect } from 'vitest'
import { buildPatientSeries } from './transformData'
import { COLOR_MAP } from '../constants'

const S1      = '08-201'  // arm A, dose 1800, sqNSCLC — primary test patient
const PATIENT_B  = '08-203'  // arm B, dose 3000, HNSCC
const PATIENT_A2 = '08-202'  // arm A, dose 3000, sqNSCLC — used for multi-dose sort test

const BASE_ROWS = [
  { subject_id: S1, arm: 'A', dose: 1800, days: '47', change: -1.62, tumor_type: 'sqNSCLC' },
  { subject_id: S1, arm: 'A', dose: 1800, days: '101', change: 6.12, tumor_type: 'sqNSCLC' },
  { subject_id: PATIENT_B, arm: 'B', dose: 3000, days: '43', change: -2.17, tumor_type: 'HNSCC' },
]

describe('buildPatientSeries', () => {
  it('groups flat rows into per-patient series with correct structure', () => {
    const result = buildPatientSeries(BASE_ROWS)
    expect(result).toHaveLength(2)
    const p = result.find(r => r.subject_id === S1)
    expect(p).toMatchObject({
      subject_id: S1,
      arm: 'A',
      dose: 1800,
      tumor_type: 'sqNSCLC',
      colorKey: 'ARM A 1800 mg',
    })
    expect(Array.isArray(p.points)).toBe(true)
  })

  it('carries metadata fields correctly for each patient', () => {
    const result = buildPatientSeries(BASE_ROWS)
    const p2 = result.find(r => r.subject_id === PATIENT_B)
    expect(p2.arm).toBe('B')
    expect(p2.dose).toBe(3000)
    expect(p2.tumor_type).toBe('HNSCC')
  })

  it('coerces dose to a number even if received as a string', () => {
    const withStringDose = [
      { subject_id: S1, arm: 'A', dose: '1800', days: '47', change: -1.62, tumor_type: 'sqNSCLC' },
    ]
    const result = buildPatientSeries(withStringDose)
    expect(typeof result[0].dose).toBe('number')
    expect(result[0].dose).toBe(1800)
  })

  it('injects synthetic baseline {weeks:0, change:0} as first point', () => {
    const result = buildPatientSeries(BASE_ROWS)
    const patient = result.find(p => p.subject_id === S1)
    expect(patient.points[0]).toEqual({ weeks: 0, change: 0 })
  })

  it('converts days to weeks correctly', () => {
    const result = buildPatientSeries(BASE_ROWS)
    const patient = result.find(p => p.subject_id === S1)
    expect(patient.points[1].weeks).toBeCloseTo(47 / 7)
    expect(patient.points[2].weeks).toBeCloseTo(101 / 7)
  })

  it('sorts each patient points ascending by weeks', () => {
    const shuffled = [
      { subject_id: S1, arm: 'A', dose: 1800, days: '101', change: 6.12, tumor_type: 'sqNSCLC' },
      { subject_id: S1, arm: 'A', dose: 1800, days: '47', change: -1.62, tumor_type: 'sqNSCLC' },
    ]
    const result = buildPatientSeries(shuffled)
    const weeks = result[0].points.map(p => p.weeks)
    expect(weeks[0]).toBe(0)
    expect(weeks[1]).toBeCloseTo(47 / 7)
    expect(weeks[2]).toBeCloseTo(101 / 7)
  })

  it('does not double-inject baseline if a day-0 row exists in the data', () => {
    const withDayZero = [
      { subject_id: S1, arm: 'A', dose: 1800, days: '0', change: 0, tumor_type: 'sqNSCLC' },
      { subject_id: S1, arm: 'A', dose: 1800, days: '47', change: -1.62, tumor_type: 'sqNSCLC' },
    ]
    const result = buildPatientSeries(withDayZero)
    const zeroPoints = result[0].points.filter(p => p.weeks === 0)
    expect(zeroPoints).toHaveLength(1)
  })

  it('returns empty array for empty input', () => {
    expect(buildPatientSeries([])).toEqual([])
    expect(buildPatientSeries(null)).toEqual([])
  })

  it('returns empty array for undefined input', () => {
    expect(buildPatientSeries(undefined)).toEqual([])
  })

  it('sorts patients by arm then by dose ascending within arm', () => {
    const multiDoseRows = [
      { subject_id: PATIENT_A2, arm: 'A', dose: 3000, days: '50', change: 1.0, tumor_type: 'sqNSCLC' },
      { subject_id: PATIENT_B, arm: 'B', dose: 3000, days: '43', change: -2.17, tumor_type: 'HNSCC' },
      { subject_id: S1, arm: 'A', dose: 1800, days: '47', change: -1.62, tumor_type: 'sqNSCLC' },
    ]
    const result = buildPatientSeries(multiDoseRows)
    expect(result[0].arm).toBe('A')
    expect(result[2].arm).toBe('B')
    expect(result[0].dose).toBe(1800)
    expect(result[1].dose).toBe(3000)
  })

  it('handles a patient with only one timepoint (baseline + that point)', () => {
    const singlePoint = [
      { subject_id: S1, arm: 'A', dose: 1800, days: '47', change: -1.62, tumor_type: 'sqNSCLC' },
    ]
    const result = buildPatientSeries(singlePoint)
    expect(result).toHaveLength(1)
    expect(result[0].points).toHaveLength(2)
    expect(result[0].points[0]).toEqual({ weeks: 0, change: 0 })
  })

  it('attaches a colorKey that matches a COLOR_MAP entry', () => {
    const result = buildPatientSeries(BASE_ROWS)
    result.forEach(patient => {
      expect(COLOR_MAP[patient.colorKey]).toBeDefined()
    })
  })

  it('colorKey format is "ARM {arm} {dose} mg"', () => {
    const result = buildPatientSeries(BASE_ROWS)
    const p1 = result.find(p => p.subject_id === S1)
    expect(p1.colorKey).toBe('ARM A 1800 mg')
    const p2 = result.find(p => p.subject_id === PATIENT_B)
    expect(p2.colorKey).toBe('ARM B 3000 mg')
  })
})
