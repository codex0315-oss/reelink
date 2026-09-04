import { useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'

/**
 * The four reel templates, playing the reels they actually produce.
 *
 * public/templates holds a real render of each one, so this is the product rather than
 * a picture of it — switching plays the same property through a different template,
 * which is the comparison an agent is actually making.
 *
 * Names, descriptions and seconds-per-photo are the values from reel-templates.ts on
 * the server, so what is promised here is what the renderer does.
 */
const TEMPLATES = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Full-bleed photo with centred text. Clean and readable.',
    seconds: 3,
  },
  {
    id: 'luxury',
    name: 'Luxury',
    description: 'Gallery frame with wide margins and slow drift. For premium listings.',
    seconds: 4.5,
  },
  {
    id: 'quicktour',
    name: 'Quick Tour',
    description: 'Fast cuts over a solid info band, with a photo counter.',
    seconds: 1.6,
  },
  {
    id: 'bold',
    name: 'Bold',
    description: 'Photo above a solid gold block. Built to stop the scroll.',
    seconds: 2.5,
  },
] as const

/** What the end card adds on top of the per-photo time, matching the renderer. */
const END_CARD_SECONDS = 1.8

export default function TemplateShowcase({
  heading,
}: {
  /**
   * The section's own title, rendered at the top of the left column.
   *
   * It belongs inside the component rather than above it because of how the columns
   * balance. The phone is around 480px tall and the picker alone barely 300, so
   * centring the two left the heading stranded above an empty band and pushed the
   * controls into the middle of the page. Folded into the same column, the sides are
   * comparable heights and the block centres as one.
   */
  heading?: React.ReactNode
}) {
  const [active, setActive] = useState(0)
  const [muted, setMuted] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)
  const template = TEMPLATES[active]

  // Restart on switch. Without this the new template picks up wherever the last one
  // happened to be, and two templates compared from different points in the reel is
  // not a comparison of the templates.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = 0
    void video.play().catch(() => undefined)
  }, [active])

  return (
    <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
      <div>
        {heading}

        <div className="flex flex-wrap gap-2 mb-6">
          {TEMPLATES.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setActive(i)}
              aria-pressed={i === active}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                i === active
                  ? 'bg-gold text-navy-dark shadow-lg shadow-gold/20'
                  : 'bg-line/5 border border-line/12 text-content/60 hover:text-content hover:border-line/30'
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>

        <h3 className="font-heading text-xl sm:text-2xl font-black tracking-tight">
          {template.name}
        </h3>
        <p className="mt-2.5 text-sm text-content/55 leading-relaxed max-w-md">
          {template.description}
        </p>

        <div className="flex gap-8 mt-6 pt-5 border-t border-line/10">
          <div>
            <div className="font-heading text-2xl font-black text-gold">{template.seconds}s</div>
            <div className="text-[11px] text-content/45 font-semibold mt-1">Per photo</div>
          </div>
          <div>
            <div className="font-heading text-2xl font-black">
              {(template.seconds * 5 + END_CARD_SECONDS).toFixed(1)}s
            </div>
            <div className="text-[11px] text-content/45 font-semibold mt-1">
              Reel from 5 photos
            </div>
          </div>
        </div>

        <p className="text-[11px] text-content/35 mt-5 leading-relaxed max-w-md">
          Every template renders at 1080×1920 with captions burned in, so it is ready to
          post without editing.
        </p>
      </div>

      {/* One frame that restyles, rather than four videos swapping places — the point
          is that it is the same property each time.
          Sized so the whole phone fits a laptop viewport alongside the text; at 270px
          the 9:16 frame ran past the fold and the section could not be seen at once. */}
      <div className="flex justify-center lg:justify-end">
        <div className="relative w-[220px] sm:w-[240px] aspect-[9/16] rounded-[1.75rem] bg-black border-[5px] border-line/15 shadow-2xl shadow-black/40 overflow-hidden">
          <video
            ref={videoRef}
            key={template.id}
            src={`/templates/${template.id}.mp4`}
            className="w-full h-full object-cover"
            autoPlay
            loop
            muted={muted}
            playsInline
            preload="metadata"
          />
          <button
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-black/55 backdrop-blur border border-white/20 text-white flex items-center justify-center hover:bg-black/75 transition-all active:scale-95"
          >
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
        </div>
      </div>
    </div>
  )
}
