export default function SummaryCard({ title, value }) {
  return (
    <div className="rounded-lg border border-gray-200 p-6 text-left">
      <p className="mb-1 text-sm text-gray-500">{title}</p>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  )
}
