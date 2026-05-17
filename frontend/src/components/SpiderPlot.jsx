import { useMemo, useCallback, useRef } from 'react'
import _createPlotlyComponent from 'react-plotly.js/factory'
import Plotly from 'plotly.js-dist-min'
import { COLOR_MAP, BRAND_ACTION_COLOR } from '../constants'

// .default fallback: Vite's CJS interop wraps the module differently depending
// on whether the subpath was pre-bundled; this handles both shapes safely.
const createPlotlyComponent = _createPlotlyComponent.default ?? _createPlotlyComponent
const Plot = createPlotlyComponent(Plotly)

const MODEBARBUTTONS_TO_REMOVE = ['select2d', 'lasso2d', 'autoScale2d']
const CHART_MARGIN_RIGHT = 160
const PD_THRESHOLD = 20
const PR_THRESHOLD = -30
const TICK_INTERVAL = 6
const HOVER_TEMPLATE = [
  'Patient: %{customdata[0]}',
  'Arm %{customdata[1]} | %{customdata[2]} mg | %{customdata[3]}',
  'Week: %{x:.1f}',
  'Change: %{y:.2f}%',
  '<extra></extra>',
].join('<br>')
const PLOT_CONFIG = {
  displaylogo: false,
  modeBarButtonsToRemove: MODEBARBUTTONS_TO_REMOVE,
}

function makeHLine(y, dash) {
  return {
    type: 'line',
    xref: 'paper',
    yref: 'y',
    x0: 0,
    x1: 1,
    y0: y,
    y1: y,
    line: { color: 'black', width: 1.5, dash },
  }
}

function makeVLine(x) {
  return {
    type: 'line',
    xref: 'x',
    yref: 'paper',
    x0: x,
    x1: x,
    y0: 0,
    y1: 1,
    line: { color: BRAND_ACTION_COLOR, width: 1.5, dash: 'dash' },
  }
}

function makeRightAnnotation(y, text) {
  return {
    xref: 'paper',
    yref: 'y',
    x: 1.01,
    y,
    text,
    xanchor: 'left',
    showarrow: false,
    font: { size: 11, color: '#6b6375' },
  }
}

function makeTopAnnotation(x, text) {
  return {
    xref: 'x',
    yref: 'paper',
    x,
    y: 1.04,
    text,
    xanchor: 'center',
    yanchor: 'bottom',
    showarrow: false,
    font: { size: 11, color: BRAND_ACTION_COLOR },
  }
}

/**
 * Spider / line chart: one trace per patient, reference lines, legend dedup by colorKey.
 * @param {{ series: import('../utils/transformData').PatientSeries[], socMpfsWeeks: number }} props
 */
export default function SpiderPlot({ series, socMpfsWeeks }) {
  const graphDivRef = useRef(null)

  const traces = useMemo(() => {
    const seen = new Set()
    return series.map(patient => {
      const isFirst = !seen.has(patient.colorKey)
      seen.add(patient.colorKey)
      const meta = [
        patient.subject_id,
        patient.arm,
        patient.dose,
        patient.tumor_type,
      ]
      return {
        x: patient.points.map(p => p.weeks),
        y: patient.points.map(p => p.change),
        mode: 'lines+markers',
        marker: { size: 6 },
        line: { color: COLOR_MAP[patient.colorKey] ?? '#888' },
        name: patient.colorKey,
        legendgroup: patient.colorKey,
        showlegend: isFirst,
        customdata: patient.points.map(() => meta),
        hovertemplate: HOVER_TEMPLATE,
      }
    })
  }, [series])

  const seriesBounds = useMemo(() => {
    let maxWeeks = 0
    let minChange = 0
    let maxChange = 0
    series.forEach(p =>
      p.points.forEach(pt => {
        if (pt.weeks > maxWeeks) maxWeeks = pt.weeks
        if (pt.change < minChange) minChange = pt.change
        if (pt.change > maxChange) maxChange = pt.change
      }),
    )
    return { maxWeeks, minChange, maxChange }
  }, [series])

  const layout = useMemo(() => {
    const { maxWeeks, minChange, maxChange } = seriesBounds
    const xAxisMax =
      Math.ceil(maxWeeks / TICK_INTERVAL) * TICK_INTERVAL + TICK_INTERVAL

    return {
      shapes: [
        makeHLine(0, 'solid'),
        makeHLine(PD_THRESHOLD, 'dash'),
        makeHLine(PR_THRESHOLD, 'dash'),
        makeVLine(socMpfsWeeks),
      ],
      annotations: [
        makeRightAnnotation(PD_THRESHOLD, 'PD ≥20%'),
        makeRightAnnotation(PR_THRESHOLD, 'PR ≤-30%'),
        makeTopAnnotation(socMpfsWeeks, 'SoC mPFS'),
      ],
      xaxis: {
        title: { text: 'Weeks on Treatment', font: { size: 13 } },
        dtick: TICK_INTERVAL,
        tick0: 0,
        range: [0, xAxisMax],
        zeroline: false,
      },
      yaxis: {
        title: { text: '% Change in Tumour Size', font: { size: 13 } },
        range: [Math.min(-100, minChange - 10), Math.max(100, maxChange + 10)],
        zeroline: false,
      },
      legend: { x: 1.08, y: 1, xanchor: 'left' },
      margin: { r: CHART_MARGIN_RIGHT, t: 40, b: 60, l: 70 },
      hovermode: 'closest',
      plot_bgcolor: 'white',
      paper_bgcolor: 'var(--color-surface)',
    }
  }, [seriesBounds, socMpfsWeeks])

  const handleHover = useCallback(e => {
    const c = e.points?.[0]?.curveNumber
    if (c == null || !graphDivRef.current) return
    const opacities = traces.map((_, i) => (i === c ? 1 : 0.2))
    Plotly.restyle(graphDivRef.current, { opacity: opacities })
  }, [traces])

  const handleUnhover = useCallback(() => {
    if (!graphDivRef.current) return
    Plotly.restyle(graphDivRef.current, { opacity: Array(traces.length).fill(1) })
  }, [traces])

  if (series.length === 0) return null

  return (
    <div className="h-[600px] w-full">
      <Plot
        data={traces}
        layout={layout}
        config={PLOT_CONFIG}
        useResizeHandler
        style={{ width: '100%', height: '100%' }}
        onInitialized={(_, gd) => { graphDivRef.current = gd }}
        onUpdate={(_, gd) => { graphDivRef.current = gd }}
        onHover={handleHover}
        onUnhover={handleUnhover}
      />
    </div>
  )
}
