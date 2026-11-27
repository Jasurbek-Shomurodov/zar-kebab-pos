// Geometry shared by every chart: round axis ticks, bar shapes with rounded
// data ends and smooth lines that never overshoot their points. Pure, so the
// tests can check it without a DOM. Money values never change here: this only
// decides where things are drawn.

const NICE_STEPS = [1, 2, 2.5, 5, 10]

/** A round step near `raw` (1, 2, 2.5 or 5 times a power of ten). */
export function niceStep(raw) {
  if (!Number.isFinite(raw) || raw <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = NICE_STEPS.find(candidate => candidate * power >= raw) || 10
  return step * power
}

/**
 * Round ticks covering [min, max]: `count` is a target, not a promise. Zero is
 * always a tick when the range crosses it, so bars grow from a labelled line.
 * Returns { min, max, ticks } where min/max are the rounded ends of the axis.
 */
export function niceTicks(min, max, count = 4) {
  let low = Math.min(0, Number(min) || 0)
  let high = Math.max(0, Number(max) || 0)
  if (high === low) high = low + 1
  // Money never needs a tick finer than one sum.
  const step = Math.max(1, niceStep((high - low) / Math.max(1, count)))
  low = Math.floor(low / step) * step
  high = Math.ceil(high / step) * step
  const ticks = []
  for (let value = low; value <= high + step / 2; value += step) ticks.push(Math.round(value / step) * step)
  return { min: low, max: high, ticks }
}

/**
 * A column from `base` (the zero line) to `top`, with only the data end
 * rounded: the end away from zero. `top` above `base` grows up, below grows
 * down. `round` false draws a square segment (a stacked segment under the top).
 */
export function barPath(x, base, top, width, radius = 4, round = true) {
  const height = Math.abs(base - top)
  if (width <= 0 || height <= 0) return ''
  const r = round ? Math.max(0, Math.min(radius, width / 2, height)) : 0
  const right = x + width
  if (top <= base) {
    return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${right - r}Q${right},${top} ${right},${top + r}V${base}Z`
  }
  return `M${x},${base}V${top - r}Q${x},${top} ${x + r},${top}H${right - r}Q${right},${top} ${right},${top - r}V${base}Z`
}

/**
 * A smooth line through points [{x, y}] (monotone in x, Fritsch–Carlson), so
 * the curve never rises above a peak or dips below a trough between points.
 */
export function smoothPath(points) {
  const shown = (points || []).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
  if (!shown.length) return ''
  if (shown.length < 3) return shown.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join('')
  const n = shown.length
  const dx = []
  const slope = []
  for (let i = 0; i < n - 1; i += 1) {
    dx.push(shown[i + 1].x - shown[i].x)
    slope.push(dx[i] ? (shown[i + 1].y - shown[i].y) / dx[i] : 0)
  }
  const tangent = [slope[0]]
  for (let i = 1; i < n - 1; i += 1) {
    tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / slope[i - 1] + (dx[i] + 2 * dx[i - 1]) / slope[i]))
  }
  tangent.push(slope[n - 2])
  let path = `M${shown[0].x},${shown[0].y}`
  for (let i = 0; i < n - 1; i += 1) {
    const third = dx[i] / 3
    path += `C${shown[i].x + third},${shown[i].y + tangent[i] * third} ${shown[i + 1].x - third},${shown[i + 1].y - tangent[i + 1] * third} ${shown[i + 1].x},${shown[i + 1].y}`
  }
  return path
}

/** Show every n-th x label so labels about `minGap` px apart never collide. */
export function labelStride(count, plotWidth, minGap = 56) {
  if (!count || plotWidth <= 0) return 1
  return Math.max(1, Math.ceil(count / Math.max(1, Math.floor(plotWidth / minGap))))
}

/**
 * Where a tooltip of `tipWidth` sits beside an anchor at `x` in a box `width`
 * wide: to the right of the anchor, flipped to its left past the middle, and
 * always inside the box.
 */
export function tooltipLeft(x, tipWidth, width, gap = 14) {
  const flip = x > width / 2
  const left = flip ? x - gap - tipWidth : x + gap
  return Math.max(0, Math.min(left, Math.max(0, width - tipWidth)))
}
