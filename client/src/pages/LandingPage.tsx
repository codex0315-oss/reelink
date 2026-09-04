import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
// The stock logo.png is a 500x500 canvas that is ~80% transparent padding, so at any
// sensible height the wordmark renders tiny. Both variants below are cropped to the
// same 431x108 bounding box - one recoloured white for dark backgrounds, one keeping
// the original navy-and-gold ink for light ones - so the logo is identical in size
// whichever theme is active.
import logoLight from '../assets/logo-light.png'
import logoDark from '../assets/logo-cropped.png'
import {
  Sparkles,
  Clapperboard,
  Download,
  ListPlus,
  Share2,
  MessageSquare,
  ChevronDown,
  Check,
  Volume2,
  VolumeX,
  Compass,
  TrendingUp,
  MapPin,
  BadgeCheck,
} from 'lucide-react'
import ThemeToggle from '../components/ThemeToggle'
import Testimonials from '../components/Testimonials'
import Reveal from '../components/Reveal'
import CountUp from '../components/CountUp'
import HeroDemo from '../components/HeroDemo'
import TemplateShowcase from '../components/TemplateShowcase'
import { useTheme } from '../context/ThemeContext'

/**
 * Reels shown in the showcase. These are real files rendered by the reel engine and
 * copied into /public, so the marketing page never depends on the API being up.
 */
const SHOWCASE_REELS = [
  {
    src: '/sample-reel.mp4',
    title: 'House in Cebu City',
    price: '₱23,000,000',
    note: 'Generated from 5 listing photos',
  },
]

const STEPS = [
  {
    icon: ListPlus,
    title: 'List the property once',
    body: 'Photos, price, location on the map, amenities — plus optional 360° shots for a walkthrough buyers can look around in.',
  },
  {
    icon: Sparkles,
    title: 'Amicus AI writes the copy',
    body: 'A full listing description and a punchy hook, written from your property details in seconds.',
  },
  {
    icon: Clapperboard,
    title: 'Your reel renders itself',
    body: 'Photos become a 1080×1920 vertical video with motion, on-screen captions, and price and status overlays. Four templates to pick from.',
  },
  {
    icon: Download,
    title: 'Post it, and get replies',
    body: 'Export the MP4 for Facebook Reels. Your listing is also live on Reelink, where buyers can tour it and message you directly.',
  },
]

const FAQS = [
  {
    q: 'Do I need any video editing skills?',
    a: 'None. You upload photos and fill in the property details. Reelink handles the motion, the captions, the text overlays and the export — there is no timeline to edit.',
  },
  {
    q: 'What is a 360° virtual tour, and do I need special equipment?',
    a: 'It is a photo buyers can look around inside, instead of scrolling through flat images. Your phone can shoot one: use Panorama mode, stand in the middle of the room and turn slowly. One per room is plenty. It is optional — listings without them work normally.',
  },
  {
    q: 'Can buyers message me directly?',
    a: 'Yes. Every listing has a Message button, and replies arrive in Reelink with read receipts so you know they landed. Buyers need a free account to start a conversation, which keeps the enquiries real.',
  },
  {
    q: 'Can I tell whether anyone is looking at my listings?',
    a: 'Your dashboard shows how many people opened each property and whether that is rising or falling week to week. Your own visits are not counted, so the number means genuine interest.',
  },
  {
    q: 'How long does one reel take?',
    a: 'About a minute from clicking Generate to a finished video. You can keep working while it renders — a notification tells you when it is ready.',
  },
  {
    q: 'Can I use the videos anywhere besides Facebook?',
    a: 'Yes. Every reel exports as a standard 1080×1920 MP4, which is the same vertical format used by Facebook Reels, Instagram Reels and TikTok.',
  },
  {
    q: 'Does it post to Facebook for me?',
    a: 'Not yet. Today you export the finished video and post it yourself. Direct publishing and automatic comment-to-lead tracking are the next features we are building.',
  },
  {
    q: 'Do I need to be a licensed broker to sign up?',
    a: 'No. Anyone can create an account, browse properties and publish listings. If you are licensed, you can submit your PRC or DHSUD number from Settings and get a verified badge once our team has checked it — buyers see it on your listings.',
  },
  {
    q: 'What does it cost?',
    a: 'Creating an account and generating your first reels is free while Reelink is in early access. Pricing for higher volumes will be announced before anything changes.',
  },
]

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [muted, setMuted] = useState(true)
  // Only used to pick the right logo file; ThemeProvider owns the actual switching.
  const { isLight } = useTheme()
  const logo = isLight ? logoDark : logoLight

  // At the very top the header sits flush on the hero, so a border there just draws a
  // faint line across the background. It only earns its background and border once
  // content is actually scrolling underneath it.
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="min-h-screen bg-surface text-content font-body relative overflow-x-clip">
      {/* Ambient brand glow behind the fold */}
      <div className="ambient-glow pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[1200px] h-[700px] rounded-full bg-gradient-to-br from-navy/70 via-gold/20 to-transparent blur-[160px]" />
      <div className="ambient-glow pointer-events-none absolute top-[45%] -right-40 w-[600px] h-[600px] rounded-full bg-gold/10 blur-[150px]" />
      <div className="ambient-glow pointer-events-none absolute top-[80%] -left-52 w-[520px] h-[520px] rounded-full bg-navy/50 blur-[150px]" />

      {/* ---------------------------------------------------------------- header */}
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-surface/85 backdrop-blur-xl border-b border-line/10 shadow-lg shadow-black/5'
            : 'bg-transparent border-b border-transparent'
        }`}
      >
        <nav className="max-w-7xl mx-auto px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center">
              <img src={logo} alt="Reelink" className="h-7 sm:h-8 w-auto object-contain" />
            </Link>

            <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-content/60">
              <a href="#how-it-works" className="hover:text-gold transition-colors">How It Works</a>
              <a href="#showcase" className="hover:text-gold transition-colors">See a Reel</a>
              <a href="#features" className="hover:text-gold transition-colors">Features</a>
              <a href="#faq" className="hover:text-gold transition-colors">FAQ</a>
            </div>

            <div className="hidden md:flex items-center gap-2">
              <ThemeToggle />
              <Link
                to="/login"
                className="text-sm font-bold text-content/70 hover:text-content px-4 py-2.5 rounded-xl hover:bg-line/5 transition-all"
              >
                Log in
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center px-5 py-2.5 rounded-xl bg-gold text-navy-dark text-sm font-extrabold shadow-lg shadow-gold/20 hover:bg-gold-dark transition-all active:scale-95"
              >
                Start for Free
              </Link>
            </div>

            <div className="flex md:hidden items-center gap-2">
              <ThemeToggle />
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle menu"
                className="p-2 rounded-lg text-content hover:bg-line/10"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden mt-3 p-4 rounded-2xl bg-panel border border-line/10 flex flex-col gap-2">
              <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="text-sm font-semibold py-2 text-content/80">How It Works</a>
              <a href="#showcase" onClick={() => setMobileMenuOpen(false)} className="text-sm font-semibold py-2 text-content/80">See a Reel</a>
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="text-sm font-semibold py-2 text-content/80">Features</a>
              <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="text-sm font-semibold py-2 text-content/80">FAQ</a>
              <Link to="/login" className="text-sm font-bold text-center py-2.5 rounded-xl border border-line/15 mt-1">Log in</Link>
              <Link to="/register" className="text-sm font-extrabold text-center py-3 rounded-xl bg-gold text-navy-dark">Start for Free</Link>
            </div>
          )}
        </nav>
      </header>

      <main className="relative">
        {/* ------------------------------------------------------------- hero */}
        <section className="relative flex items-center lg:min-h-[calc(100vh-4rem)] pt-8 pb-16 lg:pt-6 lg:pb-20">
          <div className="pointer-events-none absolute inset-0 grid-texture grid-fade opacity-60" />
          <div className="relative w-full max-w-7xl mx-auto px-6 lg:px-8">
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
              <div className="lg:col-span-6">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-line/5 border border-line/10 text-xs font-bold uppercase tracking-widest text-content/70 mb-5">
                  <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
                  AI Marketing for Philippine Real Estate
                </div>

                <h1 className="font-heading text-4xl sm:text-5xl lg:text-[3.25rem] font-black tracking-tight leading-[1.05]">
                  List it once.
                  <br />
                  <span className="bg-gradient-to-r from-gold via-gold to-gold-dark bg-clip-text text-transparent">
                    Get a reel that sells it.
                  </span>
                </h1>

                <p className="mt-5 text-base text-content/60 leading-relaxed max-w-xl">
                  Reelink turns your property photos into a captioned vertical video and writes the
                  listing copy for you — so posting to Facebook takes minutes instead of an evening
                  with Canva, CapCut and a blank caption box.
                </p>

                <div className="flex flex-col sm:flex-row gap-3.5 mt-7">
                  <Link
                    to="/register"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 sm:px-7 py-4 rounded-xl bg-gold text-navy-dark font-extrabold text-sm shadow-xl shadow-gold/25 hover:bg-gold-dark sm:hover:-translate-y-0.5 transition-all active:scale-95"
                  >
                    <Sparkles size={17} />
                    Create your first reel free
                  </Link>
                  <a
                    href="#showcase"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 sm:px-6 py-4 rounded-xl bg-line/5 border border-line/15 text-content font-bold text-sm hover:bg-line/10 transition-all"
                  >
                    See a real reel
                  </a>
                </div>

                {/* Concrete, checkable product facts - not invented metrics */}
                <div className="grid grid-cols-3 gap-3 sm:gap-6 mt-8 pt-6 border-t border-line/10 max-w-lg">
                  <div>
                    <div className="font-heading text-base sm:text-2xl font-black">1080×1920</div>
                    <div className="text-xs text-content/50 font-semibold mt-1">Reels-ready vertical</div>
                  </div>
                  <div>
                    <div className="font-heading text-base sm:text-2xl font-black text-gold">
                      <CountUp to={60} prefix="~" suffix=" sec" />
                    </div>
                    <div className="text-xs text-content/50 font-semibold mt-1">To render a reel</div>
                  </div>
                  <div>
                    <div className="font-heading text-base sm:text-2xl font-black">
                      <CountUp to={360} suffix="°" />
                    </div>
                    <div className="text-xs text-content/50 font-semibold mt-1">Virtual tours</div>
                  </div>
                </div>
              </div>

              {/* Mac window holding a real generated reel */}
              <div className="lg:col-span-6">
                <div className="relative">
                  <div className="ambient-glow pointer-events-none absolute -inset-10 bg-gradient-to-tr from-gold/25 via-navy/50 to-transparent blur-3xl rounded-full" />

                  <div className="relative rounded-2xl bg-panel border border-line/12 mac-window-shadow shadow-2xl shadow-black/40 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-line/[0.04] border-b border-line/10">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-[#FF5F57]" />
                        <span className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
                        <span className="w-3 h-3 rounded-full bg-[#28C840]" />
                      </div>
                      <span className="text-[10px] font-bold tracking-widest uppercase px-2.5 py-0.5 rounded-full bg-line/5 text-content/50 border border-line/10">
                        Reel Preview
                      </span>
                    </div>

                    <div className="flex gap-5 p-5">
                      <div className="relative shrink-0 w-[150px] sm:w-[168px] rounded-xl overflow-hidden bg-black border border-line/10">
                        <video
                          src={SHOWCASE_REELS[0].src}
                          className="w-full aspect-[9/16] object-cover"
                          autoPlay
                          loop
                          muted={muted}
                          playsInline
                        />
                        <button
                          onClick={() => setMuted((m) => !m)}
                          aria-label={muted ? 'Unmute' : 'Mute'}
                          className="absolute bottom-2.5 right-2.5 w-9 h-9 rounded-full bg-black/55 backdrop-blur border border-white/20 text-white flex items-center justify-center hover:bg-black/75 transition-all active:scale-95"
                        >
                          {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                        </button>
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Render complete
                        </div>

                        <h3 className="font-heading font-bold text-base mt-2 truncate">
                          {SHOWCASE_REELS[0].title}
                        </h3>
                        <div className="font-heading font-black text-gold text-lg">
                          {SHOWCASE_REELS[0].price}
                        </div>

                        <div className="mt-4 space-y-2">
                          {['1080×1920 vertical', 'AI hook + captions', 'Price & status overlay'].map(
                            (line) => (
                              <div key={line} className="flex items-center gap-2 text-[11px] text-content/55">
                                <Check size={12} className="text-gold shrink-0" />
                                {line}
                              </div>
                            ),
                          )}
                        </div>

                        <div className="mt-auto pt-4">
                          <span className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gold text-navy-dark text-[11px] font-extrabold">
                            <Download size={13} />
                            Export MP4
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 text-center text-xs text-content/40 font-medium">
                    Tap the speaker — this reel was generated by Reelink
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------- live demo */}
        {/* Sits between the promise and the explanation. The hero shows a finished
            reel, the steps below describe the process — this is the part in the
            middle that neither of them shows: the listing becoming the copy. */}
        <section className="relative py-20 lg:py-24 border-t border-line/10">
          <div className="max-w-5xl mx-auto px-6 lg:px-8">
            <Reveal>
              <div className="text-center max-w-2xl mx-auto mb-10">
                <span className="text-xs font-extrabold tracking-widest uppercase text-gold">
                  Watch it happen
                </span>
                <h2 className="font-heading text-3xl sm:text-4xl font-black tracking-tight mt-3">
                  You fill in the property. Reelink writes the rest.
                </h2>
                <p className="mt-4 text-content/50 text-sm leading-relaxed">
                  The caption, the hook and the video come from the details you already
                  have — no blank page, no editing timeline.
                </p>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <HeroDemo />
            </Reveal>
          </div>
        </section>

        {/* ----------------------------------------------------- how it works */}
        <section
          id="how-it-works"
          className="relative py-20 lg:py-28 border-t border-line/10 bg-gradient-to-b from-panel/80 via-surface to-surface"
        >
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="h-px w-40 gold-rule mb-12" />
            <Reveal>
              <div className="max-w-2xl mb-14">
                <span className="text-xs font-extrabold tracking-widest uppercase text-gold">
                  How it works
                </span>
                <h2 className="font-heading text-3xl sm:text-4xl font-black tracking-tight mt-3">
                  Four steps from photos to a finished reel.
                </h2>
              </div>
            </Reveal>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {STEPS.map((step, i) => {
                const Icon = step.icon
                // Staggered by index, so the row assembles rather than arriving at once.
                return (
                  <Reveal key={step.title} delay={i * 90} className="h-full">
                    <div className="relative h-full p-6 rounded-2xl bg-panel/70 backdrop-blur-sm border border-line/10 shadow-xl shadow-black/10 hover:border-gold/40 hover:-translate-y-1 transition-all group">
                      <div className="flex items-center justify-between mb-5">
                        <div className="w-11 h-11 rounded-xl bg-gold/15 border border-gold/25 flex items-center justify-center text-gold-dark group-hover:bg-gold group-hover:text-navy-dark transition-all">
                          <Icon size={20} />
                        </div>
                        <span className="font-heading text-3xl font-black text-content/10">
                          0{i + 1}
                        </span>
                      </div>
                      <h3 className="font-heading font-bold text-base">{step.title}</h3>
                      <p className="mt-2 text-sm text-content/50 leading-relaxed">{step.body}</p>
                    </div>
                  </Reveal>
                )
              })}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- showcase */}
        <section id="showcase" className="relative py-20 lg:py-28 border-t border-line/10">
          <div className="ambient-glow pointer-events-none absolute top-0 right-0 w-[700px] h-[500px] bg-gold/[0.07] blur-[130px] rounded-full" />
          <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
              <div className="lg:col-span-5">
                <span className="text-xs font-extrabold tracking-widest uppercase text-gold">Real output</span>
                <h2 className="font-heading text-3xl sm:text-4xl font-black tracking-tight mt-3">
                  This is not a mockup.
                </h2>
                <p className="mt-5 text-base text-content/60 leading-relaxed">
                  Every reel on this page came out of the same engine you get when you sign up. Upload
                  the photos, fill in the price and location, and this is what lands in your Reels tab
                  about a minute later — captions and overlays included.
                </p>

                <ul className="mt-8 space-y-3">
                  {[
                    'Vertical 1080×1920, the native Facebook Reels size',
                    'AI-written hook, burned in as on-screen captions',
                    'Price, status and title burned into the video',
                    'Downloads as a standard MP4 you own',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-content/70">
                      <span className="mt-0.5 w-5 h-5 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center shrink-0">
                        <Check size={12} className="text-gold-dark" />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Bigger reel paired with a spec panel, so the right half carries content */}
              <div className="lg:col-span-7">
                <div className="rounded-2xl bg-panel/70 border border-line/10 shadow-2xl shadow-black/20 p-6 sm:p-8">
                  <div className="flex flex-col sm:flex-row gap-7 items-center sm:items-stretch">
                    <div className="relative shrink-0 w-[220px] sm:w-[250px] rounded-xl overflow-hidden bg-black">
                      <video
                        src={SHOWCASE_REELS[0].src}
                        className="w-full aspect-[9/16] object-cover"
                        controls
                        loop
                        playsInline
                        preload="metadata"
                      />
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center text-center sm:text-left">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-content/35">
                        Rendered by Reelink
                      </div>
                      <h3 className="font-heading text-2xl font-black mt-2">
                        {SHOWCASE_REELS[0].title}
                      </h3>
                      <div className="font-heading text-xl font-black text-gold">
                        {SHOWCASE_REELS[0].price}
                      </div>
                      <p className="text-xs text-content/40 mt-1">{SHOWCASE_REELS[0].note}</p>

                      <div className="grid grid-cols-2 gap-3 mt-6">
                        {[
                          ['Format', '1080×1920'],
                          ['Length', '12 sec'],
                          ['Templates', 'Four styles'],
                          ['Output', 'MP4'],
                        ].map(([k, v]) => (
                          <div
                            key={k}
                            className="p-3 rounded-xl bg-line/5 border border-line/10 text-left"
                          >
                            <div className="text-[10px] uppercase tracking-wide text-content/35 font-bold">
                              {k}
                            </div>
                            <div className="text-sm font-bold mt-0.5">{v}</div>
                          </div>
                        ))}
                      </div>

                      <Link
                        to="/register"
                        className="mt-6 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gold text-navy-dark text-sm font-extrabold hover:bg-gold-dark transition-all active:scale-95"
                      >
                        <Sparkles size={15} />
                        Make one like this
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------- templates */}
        {/* Real renders of each template, from public/templates — the same property
            through four styles, which is the comparison an agent actually makes. */}
        <section className="relative py-20 lg:py-28 border-t border-line/10">
          <div className="max-w-6xl mx-auto px-6 lg:px-8">
            <Reveal>
              <div className="max-w-2xl mb-12">
                <span className="text-xs font-extrabold tracking-widest uppercase text-gold">
                  Four templates
                </span>
                <h2 className="font-heading text-3xl sm:text-4xl font-black tracking-tight mt-3">
                  Same property. Pick the style that fits it.
                </h2>
                <p className="mt-4 text-content/50 text-sm leading-relaxed">
                  A ₱2M starter unit and a ₱40M house should not look identical. Switch
                  between them and watch the same listing change character.
                </p>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <TemplateShowcase />
            </Reveal>
          </div>
        </section>

        {/* -------------------------------------------------------- features */}
        <section
          id="features"
          className="relative py-20 lg:py-28 border-t border-line/10 bg-gradient-to-b from-panel/70 to-surface"
        >
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="max-w-2xl mb-14">
              <span className="text-xs font-extrabold tracking-widest uppercase text-gold">What you get</span>
              <h2 className="font-heading text-3xl sm:text-4xl font-black tracking-tight mt-3">
                Working today — and what comes next.
              </h2>
              <p className="mt-4 text-content/50 text-sm">
                We label the roadmap honestly, so you always know what you are signing up for.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-5">
              {[
                {
                  icon: Compass,
                  title: '360° virtual tours',
                  body: 'Add panorama shots and buyers can look around the room instead of scrolling photos. Taken on a phone, no special camera.',
                },
                {
                  icon: MessageSquare,
                  title: 'Buyers message you directly',
                  body: 'Enquiries land in Reelink, not lost in a comment thread. You see when they are online, typing, and when your reply was read.',
                },
                {
                  icon: Clapperboard,
                  title: 'AI video reels',
                  body: 'Photos become a vertical video with motion, captions and branded overlays, in one of four templates. No editor required.',
                },
                {
                  icon: Sparkles,
                  title: 'AI listing descriptions',
                  body: 'Amicus AI writes a polished property description from your details, ready to paste into any post.',
                },
                {
                  icon: TrendingUp,
                  title: 'See who is looking',
                  body: 'View counts per property, and whether interest is rising or falling week to week. Your own visits are not counted.',
                },
                {
                  icon: Download,
                  title: 'One-tap export',
                  body: 'Download the finished MP4 from your Reels feed and post it wherever you like.',
                },
              ].map((f) => {
                const Icon = f.icon
                return (
                  <div
                    key={f.title}
                    className="p-7 rounded-2xl bg-panel/70 backdrop-blur-sm border border-line/10 shadow-xl shadow-black/10 hover:border-gold/30 transition-all"
                  >
                    <div className="w-11 h-11 rounded-xl bg-gold/15 border border-gold/25 flex items-center justify-center text-gold-dark mb-5">
                      <Icon size={20} />
                    </div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-heading font-bold">{f.title}</h3>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide bg-emerald-500/15 text-emerald-600 border border-emerald-500/25">
                        Live
                      </span>
                    </div>
                    <p className="mt-2.5 text-sm text-content/50 leading-relaxed">{f.body}</p>
                  </div>
                )
              })}
            </div>

            <div className="grid md:grid-cols-2 gap-5 mt-5">
              {[
                {
                  icon: Share2,
                  title: 'One-click Facebook publishing',
                  body: 'Push the reel and caption straight to your Page without leaving Reelink.',
                },
                {
                  icon: MessageSquare,
                  title: 'Comments become tracked leads',
                  body: 'Buyer comments on your post sync back automatically as leads you can follow up on.',
                },
              ].map((f) => {
                const Icon = f.icon
                return (
                  <div
                    key={f.title}
                    className="p-7 rounded-2xl bg-transparent border border-dashed border-line/20"
                  >
                    <div className="w-11 h-11 rounded-xl bg-line/5 border border-line/10 flex items-center justify-center text-content/40 mb-5">
                      <Icon size={20} />
                    </div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-heading font-bold text-content/70">{f.title}</h3>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide bg-gold/15 text-gold-dark border border-gold/25">
                        Coming soon
                      </span>
                    </div>
                    <p className="mt-2.5 text-sm text-content/40 leading-relaxed">{f.body}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------- the buyer side
            Reelink is two-sided now: a reel is only worth making if it lands
            somewhere a buyer can act. The page still sells to agents — they are who
            signs up — so this is framed as what *their* buyers get. */}
        <section className="py-20 lg:py-28 border-t border-line/10">
          <div className="max-w-6xl mx-auto px-5 sm:px-8">
            <div className="max-w-2xl mb-14">
              <span className="text-xs font-extrabold tracking-widest uppercase text-gold">
                For your buyers
              </span>
              <h2 className="font-heading text-3xl sm:text-4xl font-black tracking-tight mt-3">
                Your listing does not stop at the video.
              </h2>
              <p className="mt-4 text-content/50 text-sm">
                Every property you publish gets a page on Reelink where buyers can explore
                it and reach you — so a reel that gets attention has somewhere to send it.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-5">
              {[
                {
                  icon: MapPin,
                  title: 'Browse by map',
                  body: 'Buyers filter by price, type and furnishing, and see exactly where each property sits before they ask for a viewing.',
                },
                {
                  icon: Compass,
                  title: 'Walk through it',
                  body: 'Where you have added 360° shots, buyers look around each room from their phone — the closest thing to a viewing before the viewing.',
                },
                {
                  icon: BadgeCheck,
                  title: 'Know who they are talking to',
                  body: 'Your profile, photo and verified badge sit beside every listing, so an enquiry starts with trust rather than a cold message.',
                },
              ].map((f) => {
                const Icon = f.icon
                return (
                  <div
                    key={f.title}
                    className="p-7 rounded-2xl bg-panel/70 backdrop-blur-sm border border-line/10 shadow-xl shadow-black/10 hover:border-gold/30 transition-all"
                  >
                    <div className="w-11 h-11 rounded-xl bg-gold/15 border border-gold/25 flex items-center justify-center text-gold-dark mb-5">
                      <Icon size={20} />
                    </div>
                    <h3 className="font-heading font-bold">{f.title}</h3>
                    <p className="mt-2.5 text-sm text-content/50 leading-relaxed">{f.body}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- testimonials */}
        {/* Sits before the FAQ on purpose: proof that other agents use this answers
            the doubt, and the FAQ then answers the questions that follow it. Renders
            nothing until real feedback exists, so the page reads normally until then. */}
        <Testimonials />

        {/* ------------------------------------------------------------- faq */}
        <section id="faq" className="py-20 lg:py-28 border-t border-line/10">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-12">
              <span className="text-xs font-extrabold tracking-widest uppercase text-gold">FAQ</span>
              <h2 className="font-heading text-3xl sm:text-4xl font-black tracking-tight mt-3">
                Questions agents ask us.
              </h2>
            </div>

            {/* Two columns so the questions fill the row instead of a narrow centre strip */}
            <div className="grid md:grid-cols-2 gap-4 items-start">
              {FAQS.map((faq, i) => {
                const open = openFaq === i
                return (
                  <div
                    key={faq.q}
                    className="rounded-2xl bg-panel/70 backdrop-blur-sm border border-line/10 shadow-lg shadow-black/10 overflow-hidden"
                  >
                    <button
                      onClick={() => setOpenFaq(open ? null : i)}
                      aria-expanded={open}
                      className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left hover:bg-line/[0.03] transition-colors"
                    >
                      <span className="font-heading font-bold text-sm">{faq.q}</span>
                      <ChevronDown
                        size={18}
                        className={`shrink-0 text-gold transition-transform ${open ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {open && (
                      <div className="px-6 pb-5 -mt-1 text-sm text-content/55 leading-relaxed">{faq.a}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- cta */}
        <section className="py-20 lg:py-28 border-t border-line/10">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            {/* Full-width band: message left, action right */}
            <div className="relative rounded-3xl border border-gold/25 bg-gradient-to-br from-navy via-navy-dark to-navy p-10 sm:p-12 overflow-hidden">
              <div className="pointer-events-none absolute -top-24 left-1/3 w-[500px] h-[300px] bg-gold/20 blur-[110px]" />
              <div className="relative flex flex-col lg:flex-row lg:items-center gap-8 justify-between">
                <div className="max-w-xl">
                  <h2 className="font-heading text-3xl sm:text-4xl font-black tracking-tight text-white">
                    Your next listing could be a reel tonight.
                  </h2>
                  <p className="mt-4 text-white/60">
                    Create an account, add one property, and watch Reelink write the copy and render
                    the video for you.
                  </p>
                </div>

                <div className="shrink-0 flex flex-col items-start lg:items-end gap-3">
                  <Link
                    to="/register"
                    className="inline-flex items-center justify-center gap-2 px-9 py-4 rounded-xl bg-gold text-navy-dark font-extrabold text-sm shadow-xl shadow-gold/25 hover:bg-gold-dark hover:-translate-y-0.5 transition-all active:scale-95"
                  >
                    <Sparkles size={17} />
                    Start for free
                  </Link>
                  <p className="text-xs text-white/35 font-medium">
                    Free to start. No credit card required.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ---------------------------------------------------------------- footer */}
      <footer className="relative border-t border-line/10 bg-gradient-to-b from-panel/60 to-surface">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-14">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
            <div className="lg:col-span-2">
              <img src={logo} alt="Reelink" className="h-8 w-auto" />
              <p className="mt-4 text-sm text-content/45 max-w-sm leading-relaxed">
                AI-powered marketing for Philippine real estate. List once, create the reel, and reach
                buyers where they already are.
              </p>
              <p className="mt-5 text-xs font-bold tracking-widest uppercase text-gold/70">
                List. Create. Reel. Connect.
              </p>
            </div>

            <div>
              <h4 className="font-heading font-bold text-sm mb-4">Product</h4>
              <ul className="space-y-2.5 text-sm text-content/45">
                <li><a href="#how-it-works" className="hover:text-gold transition-colors">How It Works</a></li>
                <li><a href="#showcase" className="hover:text-gold transition-colors">See a Reel</a></li>
                <li><a href="#features" className="hover:text-gold transition-colors">Features</a></li>
                <li><a href="#faq" className="hover:text-gold transition-colors">FAQ</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-heading font-bold text-sm mb-4">Get started</h4>
              <ul className="space-y-2.5 text-sm text-content/45">
                <li><Link to="/register" className="hover:text-gold transition-colors">Create an account</Link></li>
                <li><Link to="/login" className="hover:text-gold transition-colors">Log in</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-6 border-t border-line/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-content/35">
            <span>© {new Date().getFullYear()} Reelink. Built for real estate professionals.</span>
            <span>Made in Cebu, Philippines</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
