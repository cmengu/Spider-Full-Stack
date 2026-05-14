import { describe, it, expect } from 'vitest'
import { deriveStats } from '../utils/deriveStats.js'

const ROWS = [
  { subject_id: '08-201', arm: 'A', dose: 1800, tumor_type: 'sqNSCLC', days: '47',  change: -1.62 },
  { subject_id: '08-201', arm: 'A', dose: 1800, tumor_type: 'sqNSCLC', days: '101', change:  6.12 },
  { subject_id: '08-203', arm: 'B', dose: 3000, tumor_type: 'HNSCC',   days: '43',  change: -2.17 },
]

describe('deriveStats', () => {
  it('counts unique patients by subject_id', () => {
    expect(deriveStats(ROWS).patients).toBe(2)
  })

  it('returns sorted comma-separated arm labels', () => {
    expect(deriveStats(ROWS).arms).toBe('A, B')
  })

  it('returns sorted dose strings with mg suffix', () => {
    expect(deriveStats(ROWS).doses).toBe('1800mg, 3000mg')
  })

  it('deduplicates dose "1800" string and 1800 number as the same entry', () => {
    const mixed = [
      { subject_id: 'p1', arm: 'A', dose: '1800' },
      { subject_id: 'p2', arm: 'A', dose: 1800 },
    ]
    expect(deriveStats(mixed).doses).toBe('1800mg')
  })

  it('returns safe zero-values for empty input', () => {
    const s = deriveStats([])
    expect(s.patients).toBe(0)
    expect(s.arms).toBe('')
    expect(s.doses).toBe('')
  })
})
