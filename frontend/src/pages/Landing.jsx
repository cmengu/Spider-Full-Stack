import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import SummaryCard from '../components/SummaryCard.jsx'

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
        <h1 className="mb-2">Clinical Trial Explorer</h1>
        <p className="text-gray-500">Loading…</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="px-8 py-12">
        <h1 className="mb-2">Clinical Trial Explorer</h1>
        <p className="text-sm text-red-600">Failed to load data: {error}</p>
      </main>
    )
  }

  return (
    <main className="px-8 py-12">
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
        className="inline-block rounded-md bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-700"
      >
        Explore Spider Plot →
      </Link>
    </main>
  )
}

export function deriveStats(rows) {
  const patients = new Set(rows.map(r => r.subject_id)).size
  const arms = [...new Set(rows.map(r => r.arm))].sort().join(', ')
  const doses = [...new Set(rows.map(r => Number(r.dose)))]
    .sort((a, b) => a - b)
    .map(d => `${d}mg`)
    .join(', ')
  return { patients, arms, doses }
}
