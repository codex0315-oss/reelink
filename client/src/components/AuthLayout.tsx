import { Link } from 'react-router-dom'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import logoLight from '../assets/logo-light.png'
import logoDark from '../assets/logo-cropped.png'
import ThemeToggle from './ThemeToggle'
import { useTheme } from '../context/ThemeContext'

type Props = {
  title: string
  subtitle: string
  children: React.ReactNode
  /** Sign-up / log-in cross link shown under the form. */
  footer: React.ReactNode
}

export default function AuthLayout({ title, subtitle, children, footer }: Props) {
  // Only used to pick the right logo file; ThemeProvider owns the actual switching.
  const { isLight } = useTheme()
  const logo = isLight ? logoDark : logoLight

  return (
    <div className="min-h-screen relative flex flex-col bg-surface text-content overflow-hidden">
      {/* The landing page's blueprint grid, so signing in feels like the same product. */}
      <div className="pointer-events-none absolute inset-0 grid-texture grid-fade opacity-60" />
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[820px] h-[820px] rounded-full bg-gold/[0.06] blur-[140px] ambient-glow" />

      {/* ------------------------------------------------------------- header */}
      <header className="relative flex items-center justify-between gap-4 px-5 sm:px-10 py-4">
        <Link to="/" className="shrink-0">
          <img src={logo} alt="Reelink" className="h-8 sm:h-9 w-auto object-contain" />
        </Link>

        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-content/45 hover:text-gold transition-colors"
          >
            <ArrowLeft size={14} />
            <span className="hidden sm:inline">Back to home</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* --------------------------------------------------------- form column */}
      <main className="relative flex-1 flex flex-col items-center justify-center px-5 py-3">
        <div className="w-full max-w-md">
          <div className="text-center">
            <h1 className="font-heading text-3xl sm:text-4xl font-black tracking-tight">
              {title}
            </h1>
            {/* Small gold rule instead of a boxed card — keeps the grid visible
                behind the form, which is the look this page is going for. */}
            <span className="block w-10 h-1 rounded-full bg-gold mx-auto mt-4" />
            <p className="text-content/50 text-sm mt-3">{subtitle}</p>
          </div>

          <div className="mt-6">{children}</div>

          <p className="text-center text-sm text-content/45 mt-5">{footer}</p>
        </div>
      </main>

      {/* ------------------------------------------------------------- footer */}
      {/* One line rather than two stacked: the register form is the tallest thing on
          this layout, and every row here costs it space. */}
      <footer className="relative px-5 pb-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-content/35">
        <span className="flex items-center gap-1.5">
          <ShieldCheck size={13} />
          Passwords are hashed with bcrypt — never stored in plain text.
        </span>
        <span className="hidden sm:inline text-content/15">•</span>
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-content/20">
          List. Create. Reel. Connect.
        </span>
      </footer>
    </div>
  )
}
