/**
 * A tiny inline trend line.
 *
 * Hand-rolled rather than pulled from a chart library: Recharts would add well over
 * 100 KB to a bundle that already ships 203 KB gzipped, and this needs one polyline and
 * a fill. On a phone that difference is a second of load time for a graphic 40 pixels
 * tall.
 *
 * Scales to its container via viewBox, so it stays sharp at any width without measuring
 * anything or listening for resizes.
 */
export default function Sparkline({
  points,
  className = '',
  ariaLabel,
}: {
  points: number[]
  className?: string
  ariaLabel?: string
}) {
  if (points.length < 2) return null

  const W = 100
  const H = 28
  /** Keeps the end dot inside the box: drawn at x=W it painted past the right edge, and
   *  paint that escapes a scrolling ancestor becomes scrollable overflow. */
  const PAD = 2
  const max = Math.max(...points, 1)

  // A flat run of zeroes should sit on the floor, not halfway up the box.
  const coords = points.map((value, i) => {
    const x = PAD + (i / (points.length - 1)) * (W - PAD * 2)
    const y = H - (value / max) * (H - 2) - 1
    return [x, y] as const
  })

  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `0,${H} ${line} ${W},${H}`
  const [lastX, lastY] = coords[coords.length - 1]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={`w-full h-7 ${className}`}
      role={ariaLabel ? 'img' : 'presentation'}
      aria-label={ariaLabel}
    >
      {/* currentColor throughout, so the caller sets the colour and both themes work
          without this component knowing anything about them. */}
      <polygon points={area} fill="currentColor" opacity={0.12} />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Marks today, so the eye lands on the end of the line rather than its middle. */}
      <circle cx={lastX} cy={lastY} r={2} fill="currentColor" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
