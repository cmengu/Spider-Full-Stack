import { useState, useEffect, useMemo, useRef } from 'react'
import SpiderPlot from '../components/SpiderPlot.jsx'
import FilterPanel from '../components/FilterPanel.jsx'
import { buildPatientSeries } from '../utils/transformData'

const DEFAULT_SOC = 10.5

function buildParams(arm, dose, tumor) {
  const p = new URLSearchParams()
  if (arm !== 'all') p.set('arms', arm)
  if (dose !== 'all') p.set('doses', dose)
  if (tumor !== 'all') p.set('tumor_types', tumor)
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** Route coordinator: fetches `/api/spider`, owns filter + SoC state, composes chart and sidebar. */
export default function Visualisation() {
  const [rows, setRows] = useState([])
  const [totalPatients, setTotalPatients] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [selectedArm, setSelectedArm] = useState('all')
  const [selectedDose, setSelectedDose] = useState('all')
  const [selectedTumor, setSelectedTumor] = useState('all')
  const [socMpfsWeeks, setSocMpfsWeeks] = useState(DEFAULT_SOC)

  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(null)

  const hasCapturedTotal = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    const params = buildParams(selectedArm, selectedDose, selectedTumor)
    let cancelled = false

    ;(async () => {
      // Defer setState so it is not synchronous in the effect body (eslint react-hooks/set-state-in-effect).
      await Promise.resolve()
      if (cancelled) return
      setLoading(true)
      setError(null)
      try {
        const r = await fetch(`/api/spider${params}`, {
          signal: controller.signal,
        })
        if (!r.ok) throw new Error(`API error ${r.status}`)
        const data = await r.json()
        if (cancelled) return
        setRows(data)
        if (!hasCapturedTotal.current) {
          setTotalPatients(buildPatientSeries(data).length)
          hasCapturedTotal.current = true
        }
        setLoading(false)
      } catch (err) {
        if (cancelled || err.name === 'AbortError') return
        setError(err.message)
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [selectedArm, selectedDose, selectedTumor])

  const series = useMemo(() => buildPatientSeries(rows), [rows])

  const maxWeeks = useMemo(
    () =>
      series.length === 0
        ? Infinity
        : series.reduce(
            (m, p) =>
              p.points.reduce(
                (mm, pt) => (pt.weeks > mm ? pt.weeks : mm),
                m,
              ),
            0,
          ),
    [series],
  )

  async function handleAiFilter(query) {
    setAiLoading(true)
    setAiError(null)
    try {
      const res = await fetch('/api/ai-filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(12000),
      })
      const json = await res.json()
      if (json.error) {
        setAiError(json.error)
        return
      }
      setSelectedArm(json.arm === 'all' ? 'all' : String(json.arm))
      setSelectedDose(json.dose === 'all' ? 'all' : String(json.dose))
      setSelectedTumor(
        json.tumor_type === 'all' ? 'all' : json.tumor_type,
      )
    } catch {
      setAiError('Could not connect to AI filter.')
    } finally {
      setAiLoading(false)
    }
  }

  function handleReset() {
    setSelectedArm('all')
    setSelectedDose('all')
    setSelectedTumor('all')
    setSocMpfsWeeks(DEFAULT_SOC)
    setAiError(null)
  }

  return (
    <div className="flex gap-6 px-8 py-6">
      <aside className="w-56 shrink-0">
        <FilterPanel
          selectedArm={selectedArm}
          selectedDose={selectedDose}
          selectedTumor={selectedTumor}
          socMpfsWeeks={socMpfsWeeks}
          maxWeeks={maxWeeks}
          onArmChange={setSelectedArm}
          onDoseChange={setSelectedDose}
          onTumorChange={setSelectedTumor}
          onSocMpfsChange={setSocMpfsWeeks}
          onReset={handleReset}
          onAiFilter={handleAiFilter}
          aiError={aiError}
          aiLoading={aiLoading}
        />
      </aside>

      <main className="flex-1 min-w-0">
        <p className="mb-3 text-sm text-gray-500">
          Showing {series.length} of {totalPatients} patients
        </p>

        {loading && <p className="text-gray-400 text-sm">Loading…</p>}

        {!loading && error && (
          <p className="text-sm text-red-600">Failed to load data: {error}</p>
        )}

        {!loading && !error && series.length === 0 && (
          <p className="text-gray-400 text-sm">
            No patients match the current filters.
          </p>
        )}

        {!loading && !error && series.length > 0 && (
          <SpiderPlot series={series} socMpfsWeeks={socMpfsWeeks} />
        )}
      </main>
    </div>
  )
}
