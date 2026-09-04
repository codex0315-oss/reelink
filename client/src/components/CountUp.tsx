import { useEffect, useRef, useState } from 'react'

/**
 * Counts a number up when it scrolls into view.
 *
 * Only the numeric part animates — the prefix and suffix are printed as given, so
 * "1080×1920" and "~60 sec" keep their exact shape and the row never reflows as the
 * digits grow. Landing on the wrong number for a fraction of a second is one thing;
 * shifting the layout underneath a reader is another.
 *
 * Reduced motion, a missing observer, or a value already on screen all render the final
 * figure immediately.
 */
export default function CountUp({
  to,
  prefix = '',
  suffix = '',
  duration = 900,
  className = '',
}: {
  to: number
  prefix?: string
  suffix?: string
  duration?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [value, setValue] = useState(to)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (typeof IntersectionObserver === 'undefined') return

    const rect = node.getBoundingClientRect()
    if (rect.top < window.innerHeight) return

    setValue(0)
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        observer.disconnect()

        const started = performance.now()
        let frame = 0
        const tick = (now: number) => {
          const progress = Math.min((now - started) / duration, 1)
          // Ease-out: fast at first, settling at the end, which reads as a figure
          // arriving rather than a stopwatch running.
          const eased = 1 - Math.pow(1 - progress, 3)
          setValue(Math.round(to * eased))
          if (progress < 1) frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
      },
      { threshold: 0.4 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [to, duration])

  return (
    <span ref={ref} className={className}>
      {prefix}
      {value.toLocaleString()}
      {suffix}
    </span>
  )
}
