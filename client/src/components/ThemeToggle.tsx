import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

/**
 * Compact icon switch for page headers. The theme itself lives in ThemeProvider, so
 * every toggle in the app shows the same state and applies to every page.
 */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme()

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
      className={`w-9 h-9 rounded-xl border border-line/15 text-content/60 flex items-center justify-center hover:text-gold hover:border-gold/40 transition-all active:scale-95 ${className}`}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
