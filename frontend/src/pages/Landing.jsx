import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import SummaryCard from '../components/SummaryCard.jsx'

export default function Landing() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/spider')
      .then(r => {
        if (!r.ok) throw new Error(`API error ${r.status}`)
        return r.json()
      })
      .then(data => setRows(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const stats = deriveStats(rows)

  return (
    <main className="px-8 py-12">
      <h1 className="mb-2">Clinical Trial Explorer</h1>
      <p className="mb-10 text-gray-500">
        Tumour size change from baseline — spider plot dashboard
      </p>

      {error && (
        <p className="mb-6 text-sm text-red-600">
          Failed to load data: {error}
        </p>
      )}

      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          title="Unique Patients"
          value={loading ? '…' : String(stats.patients)}
        />
        <SummaryCard
          title="Treatment Arms"
          value={loading ? '…' : stats.arms}
        />
        <SummaryCard
          title="Dose Levels"
          value={loading ? '…' : stats.doses}
        />
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

function deriveStats(rows) {
  const patients = new Set(rows.map(r => r.subject_id)).size
  const arms = [...new Set(rows.map(r => r.arm))].sort().join(', ')
  const doses = [...new Set(rows.map(r => Number(r.dose)))]
    .sort((a, b) => a - b)
    .map(d => `${d}mg`)
    .join(', ')
  return { patients, arms, doses }
}
