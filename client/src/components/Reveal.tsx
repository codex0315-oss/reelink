import { useEffect, useRef, useState } from 'react'

/**
 * Fades and lifts its children in when they scroll into view.
 *
 * Starts visible and is hidden only once the observer is confirmed working, so the
 * failure mode is a page with no animation rather than a page with no content. That
 * ordering matters more than it looks: a reveal that hides first and animates second
 * shows a blank marketing page to anyone whose JavaScript is slow, blocked, or absent.
 *
 * Fires once. Content that fades out again when scrolled past is a distraction on a
 * page someone is reading, and it makes going back up feel broken.
 */
export default function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode
  /** Milliseconds, for staggering a row of cards. */
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(true)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    // Someone who asked for less motion gets none, and stays visible.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (typeof IntersectionObserver === 'undefined') return

    // Anything already on screen at load stays put. Animating the hero out and back in
    // on first paint is a flicker, not an entrance.
    const rect = node.getBoundingClientRect()
    if (rect.top < window.innerHeight * 0.9) return

    setShown(false)
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          window.setTimeout(() => setShown(true), delay)
          observer.disconnect()
        })
      },
      // A little before the edge, so the movement finishes as it arrives rather than
      // starting once the reader is already looking at it.
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [delay])

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none ${
        shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      } ${className}`}
    >
      {children}
    </div>
  )
}
