import { useState } from 'react'

const ARM_OPTIONS = [
  { value: 'all', label: 'All Arms' },
  { value: 'A', label: 'Arm A' },
  { value: 'B', label: 'Arm B' },
]
const DOSE_OPTIONS = [
  { value: 'all', label: 'All Doses' },
  { value: '1800', label: '1800 mg' },
  { value: '3000', label: '3000 mg' },
]
const TUMOR_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'sqNSCLC', label: 'sqNSCLC' },
  { value: 'nsNSCLC', label: 'nsNSCLC' },
  { value: 'HNSCC', label: 'HNSCC' },
]

/**
 * Filter sidebar: AI query, dropdowns, SoC mPFS (blur-commit), reset.
 * All filter state is lifted; only local display state (aiQuery, inputValue) here.
 */
export default function FilterPanel({
  selectedArm,
  selectedDose,
  selectedTumor,
  socMpfsWeeks,
  maxWeeks,
  onArmChange,
  onDoseChange,
  onTumorChange,
  onSocMpfsChange,
  onReset,
  onAiFilter,
  aiError,
  aiLoading,
}) {
  const [aiQuery, setAiQuery] = useState('')
  const [inputValue, setInputValue] = useState(String(socMpfsWeeks))
  const [prevSoc, setPrevSoc] = useState(socMpfsWeeks)
  if (socMpfsWeeks !== prevSoc) {
    setPrevSoc(socMpfsWeeks)
    setInputValue(String(socMpfsWeeks))
  }

  function commitSocInput() {
    const parsed = Number(inputValue.trim())
    if (
      inputValue.trim() === '' ||
      Number.isNaN(parsed) ||
      parsed < 0 ||
      parsed > maxWeeks
    ) {
      setInputValue(String(socMpfsWeeks))
    } else {
      onSocMpfsChange(parsed)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-md border-l-[3px] bg-surface px-3 py-3" style={{ borderLeftColor: 'var(--color-brand)' }}>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand">
          Filter with AI
        </h3>
        <textarea
          className="w-full rounded border border-brand-border bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-brand"
          rows={2}
          placeholder='e.g. "show Arm A patients only"'
          value={aiQuery}
          onChange={e => setAiQuery(e.target.value)}
        />
        <button
          type="button"
          className="mt-2 w-full rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50 transition-colors"
          disabled={aiLoading || aiQuery.trim() === ''}
          onClick={() => onAiFilter(aiQuery)}
        >
          {aiLoading ? 'Filtering…' : 'Filter'}
        </button>
        {aiError && <p className="mt-1 text-xs text-red-600">{aiError}</p>}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-text">
          Data Filters
        </h3>
        <div className="space-y-3">
          <Select
            label="Treatment Arms"
            value={selectedArm}
            options={ARM_OPTIONS}
            onChange={onArmChange}
          />
          <Select
            label="Doses"
            value={selectedDose}
            options={DOSE_OPTIONS}
            onChange={onDoseChange}
          />
          <Select
            label="Tumor Types"
            value={selectedTumor}
            options={TUMOR_OPTIONS}
            onChange={onTumorChange}
          />
        </div>
        <button
          type="button"
          className="mt-3 w-full rounded-md border border-brand px-3 py-1.5 text-sm text-brand hover:bg-surface transition-colors"
          onClick={onReset}
        >
          Reset All
        </button>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-text">
          Chart References
        </h3>
        <label className="block text-sm text-brand-text">
          SoC mPFS (weeks)
          <input
            type="number"
            className="mt-1 w-full rounded border border-brand-border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onBlur={commitSocInput}
            onKeyDown={e => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            min={0}
          />
        </label>
      </section>
    </div>
  )
}

function Select({ label, value, options, onChange }) {
  return (
    <div>
      <label className="block text-xs text-brand-text mb-0.5">{label}</label>
      <select
        className="w-full rounded border border-brand-border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
