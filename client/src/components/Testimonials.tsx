import { useEffect, useRef, useState } from 'react'
import { Star, BadgeCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchTestimonials, type Testimonial } from '../lib/api'
import { assetUrl } from '../lib/config'

const ADVANCE_MS = 6000

/**
 * What agents say about Reelink, on the landing page.
 *
 * Renders nothing at all until there is something real to show. A testimonials
 * section with placeholder quotes is worse than no section: the one thing it has to
 * be is believable, and a visiting agent can tell.
 */
export default function Testimonials() {
  const [items, setItems] = useState<Testimonial[]>([])
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // No token: this runs for visitors who have no account, which is the point.
    // A failure here should cost the page nothing, so the section simply stays hidden.
    fetchTestimonials()
      .then(setItems)
      .catch(() => undefined)
  }, [])

  // Auto-advance, but not while someone is reading. Hovering, focusing a control, or
  // asking the OS for reduced motion all stop it — a quote that slides away mid
  // sentence is worse than one that never moved.
  useEffect(() => {
    if (paused || items.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const timer = setInterval(
      () => setIndex((i) => (i + 1) % items.length),
      ADVANCE_MS,
    )
    return () => clearInterval(timer)
  }, [paused, items.length])

  if (items.length === 0) return null

  const go = (next: number) =>
    setIndex(((next % items.length) + items.length) % items.length)

  return (
    <section className="py-20 lg:py-28 border-t border-line/10">
      <div className="max-w-4xl mx-auto px-5 sm:px-8">
        <div className="text-center mb-12">
          <span className="text-xs font-extrabold tracking-widest uppercase text-gold">
            From agents using it
          </span>
          <h2 className="font-heading text-3xl sm:text-4xl font-black tracking-tight mt-3">
            What Filipino agents say.
          </h2>
        </div>

        <div
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
        >
          {/* One strip translated sideways, rather than mounting and unmounting cards,
              so the movement is a slide and nothing reflows underneath it. */}
          <div className="overflow-hidden rounded-2xl">
            <div
              ref={trackRef}
              className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
              style={{ transform: `translateX(-${index * 100}%)` }}
            >
              {items.map((item) => (
                <figure
                  key={item.id}
                  className="w-full shrink-0 px-1"
                  // Cards out of view are skipped by the screen reader and the tab
                  // order, so a keyboard never lands on something invisible.
                  aria-hidden={items[index]?.id !== item.id}
                >
                  <div className="rounded-2xl bg-panel/70 backdrop-blur-sm border border-line/10 shadow-lg shadow-black/10 p-7 sm:p-9">
                    <div className="flex gap-0.5 mb-4" aria-label={`${item.rating} out of 5`}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          size={16}
                          className={
                            n <= item.rating ? 'text-gold fill-gold' : 'text-line/30'
                          }
                        />
                      ))}
                    </div>

                    <blockquote className="font-heading text-lg sm:text-xl leading-relaxed">
                      “{item.comment}”
                    </blockquote>

                    <figcaption className="flex items-center gap-3 mt-6">
                      {item.avatarUrl ? (
                        <img
                          src={assetUrl(item.avatarUrl)}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover border border-line/20"
                        />
                      ) : (
                        <span className="w-10 h-10 rounded-full bg-gold/15 text-gold flex items-center justify-center text-sm font-black">
                          {item.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5 text-sm font-bold">
                        {item.name}
                        {item.isVerified && (
                          <BadgeCheck size={15} className="text-gold" aria-label="Verified agent" />
                        )}
                      </span>
                    </figcaption>
                  </div>
                </figure>
              ))}
            </div>
          </div>

          {items.length > 1 && (
            <div className="flex items-center justify-center gap-4 mt-7">
              <button
                onClick={() => go(index - 1)}
                aria-label="Previous"
                className="w-9 h-9 rounded-full border border-line/15 flex items-center justify-center text-content/50 hover:text-content hover:border-line/30 transition-all"
              >
                <ChevronLeft size={16} />
              </button>

              <div className="flex items-center gap-2">
                {items.map((item, i) => (
                  <button
                    key={item.id}
                    onClick={() => go(i)}
                    aria-label={`Show testimonial ${i + 1}`}
                    aria-current={i === index}
                    className={`h-1.5 rounded-full transition-all ${
                      i === index ? 'w-6 bg-gold' : 'w-1.5 bg-line/25 hover:bg-line/40'
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={() => go(index + 1)}
                aria-label="Next"
                className="w-9 h-9 rounded-full border border-line/15 flex items-center justify-center text-content/50 hover:text-content hover:border-line/30 transition-all"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
