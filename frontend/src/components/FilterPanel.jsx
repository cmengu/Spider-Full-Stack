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
  // When parent resets SoC (or AI updates filters), keep the input in sync without an effect.
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
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Filter with AI
        </h3>
        <textarea
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
          rows={2}
          placeholder='e.g. "show Arm A patients only"'
          value={aiQuery}
          onChange={e => setAiQuery(e.target.value)}
        />
        <button
          type="button"
          className="mt-2 w-full rounded bg-gray-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-600 disabled:opacity-50"
          disabled={aiLoading || aiQuery.trim() === ''}
          onClick={() => onAiFilter(aiQuery)}
        >
          {aiLoading ? 'Filtering…' : 'Filter'}
        </button>
        {aiError && <p className="mt-1 text-xs text-red-600">{aiError}</p>}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
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
          className="mt-3 w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          onClick={onReset}
        >
          Reset All
        </button>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Chart References
        </h3>
        <label className="block text-sm text-gray-700">
          SoC mPFS (weeks)
          <input
            type="number"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
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
      <label className="block text-xs text-gray-500 mb-0.5">{label}</label>
      <select
        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
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
