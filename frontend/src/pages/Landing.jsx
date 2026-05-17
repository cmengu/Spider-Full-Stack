import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import SummaryCard from '../components/SummaryCard.jsx'
import Spinner from '../components/Spinner.jsx'
import { deriveStats } from '../utils/deriveStats.js'

const STUDY_LABEL = 'Phase II Oncology Study'

export default function Landing() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/spider', { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`API error ${r.status}`)
        return r.json()
      })
      .then(data => {
        setRows(data)
        setLoading(false)
      })
      .catch(err => {
        if (err.name === 'AbortError') return
        setError(err.message)
        setLoading(false)
      })

    return () => controller.abort()
  }, [])

  const stats = useMemo(() => deriveStats(rows), [rows])

  if (loading) {
    return (
      <main className="px-8 py-12">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-brand">{STUDY_LABEL}</p>
        <h1 className="mb-2">Clinical Trial Explorer</h1>
        <Spinner />
      </main>
    )
  }

  if (error) {
    return (
      <main className="px-8 py-12">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-brand">{STUDY_LABEL}</p>
        <h1 className="mb-2">Clinical Trial Explorer</h1>
        <p className="text-sm text-red-600">Failed to load data: {error}</p>
      </main>
    )
  }

  return (
    <main className="px-8 py-12">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-brand">{STUDY_LABEL}</p>
      <h1 className="mb-2">Clinical Trial Explorer</h1>
      <p className="mb-10 text-gray-500">
        Tumour size change from baseline — spider plot dashboard
      </p>

      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard title="Unique Patients" value={String(stats.patients)} />
        <SummaryCard title="Treatment Arms" value={stats.arms} />
        <SummaryCard title="Dose Levels" value={stats.doses} />
      </div>

      <Link
        to="/visualisation"
        className="inline-block rounded-md bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand-dark transition-colors"
      >
        Explore Spider Plot →
      </Link>
    </main>
  )
}
