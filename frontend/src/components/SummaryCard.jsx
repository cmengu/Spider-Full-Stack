/**
 * @param {{ title: string, value: string }} props
 */
export default function SummaryCard({ title, value }) {
  return (
    <div
      className="rounded-lg border border-brand-border bg-white p-6 text-left"
      style={{ borderLeft: '3px solid var(--color-brand)' }}
    >
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-text">{title}</p>
      <p className="text-2xl font-semibold text-brand-heading tabular-nums">{value}</p>
    </div>
  )
}
