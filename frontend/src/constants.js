// frontend/src/constants.js

/**
 * Maps the arm+dose combination key (as produced by buildPatientSeries)
 * to a Plotly line color.
 * Keys match patient.colorKey exactly — do not reconstruct this string elsewhere.
 *
 * @type {Record<string, string>}
 */
export const COLOR_MAP = {
  'ARM A 1800 mg': '#FFB3C1',
  'ARM A 3000 mg': '#C2185B',
  'ARM B 1800 mg': '#90CAF9',
  'ARM B 3000 mg': '#1565C0',
}
