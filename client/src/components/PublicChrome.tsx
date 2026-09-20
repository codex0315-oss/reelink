import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import logoLight from '../assets/logo-light.png'
import logoDark from '../assets/logo-cropped.png'
import ThemeToggle from './ThemeToggle'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'

/**
 * The header and footer every signed-out page shares.
 *
 * Extracted once browsing and property pages joined the landing page outside the login.
 * Three copies of a header drift apart — one gains a link, another keeps an old label —
 * and a visitor moving between them notices the furniture changing under them.
 *
 * It knows whether someone is signed in, so an agent who already has an account is
 * offered their dashboard rather than being invited to register again.
 */
/**
 * The header's height, as the padding a hero must add to its top when it runs under
 * the header. One constant shared both ways so the two cannot drift apart.
 */
export const HEADER_OFFSET = 'pt-16'

export default function PublicChrome({
  children,
  overlayHero = false,
}: {
  children: React.ReactNode
  /**
   * Lets the page's first section extend up behind the header, which is transparent
   * until the page scrolls. At the top of the page the bar then reads as part of the
   * hero — logo and links sitting on the grid — rather than a strip bolted above it.
   * The page must pad its hero with HEADER_OFFSET, or its content starts underneath.
   */
  overlayHero?: boolean
}) {
  const { isLight } = useTheme()
  const { token } = useAuth()
  const logo = isLight ? logoDark : logoLight
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Transparent only while overlaying and unscrolled; the moment the page moves the
  // bar has content passing beneath it and needs a surface again.
  const solid = scrolled || !overlayHero

  return (
    <div className="min-h-screen bg-surface text-content font-body">
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${overlayHero ? '-mb-16' : ''} ${
          scrolled
            ? 'bg-surface/90 backdrop-blur-xl border-b border-line/10 shadow-lg shadow-black/5'
            : solid
              ? 'bg-surface border-b border-line/10'
              : 'bg-transparent border-b border-transparent'
        }`}
      >
        {/* A fixed row height, so the -mb-16 above is exact rather than a guess. */}
        <nav className="relative max-w-site mx-auto px-5 sm:px-8">
          <div className="h-16 flex items-center justify-between gap-4">
            <Link to="/" className="flex items-center shrink-0">
              <img src={logo} alt="Reelink" className="h-7 sm:h-8 w-auto object-contain" />
            </Link>

            {/* One link, kept with the actions rather than floating alone mid-bar. The
                agent pitch is reached through "List your property" and the footer, so
                the header stays about the one thing a visitor is here to do. */}
            <div className="hidden md:flex items-center gap-2 shrink-0">
              <Link
                to="/browse"
                className="text-sm font-semibold text-content/60 hover:text-gold transition-colors px-4 mr-2"
              >
                Browse properties
              </Link>
              <ThemeToggle />
              {token ? (
                <Link
                  to="/dashboard"
                  className="inline-flex items-center px-5 py-2.5 rounded-xl bg-gold text-navy-dark text-sm font-extrabold shadow-lg shadow-gold/20 hover:bg-gold-dark transition-all active:scale-95"
                >
                  Go to dashboard
                </Link>
              ) : (
                <>
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
                    List your property
                  </Link>
                </>
              )}
            </div>

            <div className="flex md:hidden items-center gap-2">
              <ThemeToggle />
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Toggle menu"
                aria-expanded={menuOpen}
                className="p-2 rounded-lg text-content hover:bg-line/10"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Absolutely positioned so opening it never changes the header's height —
              the hero's top padding is sized to that height, and a menu that grew the
              bar would push the whole page down each time it opened. */}
          {menuOpen && (
            <div className="md:hidden absolute left-5 right-5 top-full mt-1 p-4 rounded-2xl bg-panel border border-line/10 shadow-xl shadow-black/15 flex flex-col gap-2">
              <Link
                to="/browse"
                onClick={() => setMenuOpen(false)}
                className="text-sm font-semibold py-2 text-content/80"
              >
                Browse properties
              </Link>
              {token ? (
                <Link
                  to="/dashboard"
                  className="text-sm font-extrabold text-center py-3 rounded-xl bg-gold text-navy-dark mt-1"
                >
                  Go to dashboard
                </Link>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="text-sm font-bold text-center py-2.5 rounded-xl border border-line/15 mt-1"
                  >
                    Log in
                  </Link>
                  <Link
                    to="/register"
                    className="text-sm font-extrabold text-center py-3 rounded-xl bg-gold text-navy-dark"
                  >
                    List your property
                  </Link>
                </>
              )}
            </div>
          )}
        </nav>
      </header>

      <main>{children}</main>

      <footer className="border-t border-line/10 mt-16">
        <div className="max-w-site mx-auto px-5 sm:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <img src={logo} alt="Reelink" className="h-6 w-auto object-contain opacity-70" />
          <p className="text-xs text-content/40">
            © {new Date().getFullYear()} Reelink · List. Create. Reel. Connect.
          </p>
          <div className="flex items-center gap-5 text-xs font-semibold text-content/50">
            <Link to="/browse" className="hover:text-gold transition-colors">
              Browse
            </Link>
            <Link to="/for-agents" className="hover:text-gold transition-colors">
              For agents
            </Link>
            <Link to="/login" className="hover:text-gold transition-colors">
              Log in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
