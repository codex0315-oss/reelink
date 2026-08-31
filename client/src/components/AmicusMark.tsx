import { useTheme } from '../context/ThemeContext'
import amicusDark from '../assets/amicus.png'
import amicusLight from '../assets/amicus-light.png'

/**
 * The stock mark is navy ink, which measures about 1.25:1 against the dark card —
 * effectively invisible. The light variant recolours the navy to near-white and
 * keeps the gold, so the mark reads the same in either theme.
 *
 * One component rather than a theme lookup at each of the call sites.
 */
export default function AmicusMark({
  className = '',
  alt = '',
  tone = 'auto',
}: {
  className?: string
  alt?: string
  /**
   * 'auto' follows the theme. Pin it when the mark sits on a surface that does not
   * change with the theme — a gold chip stays gold, so it always wants the navy mark.
   */
  tone?: 'auto' | 'dark' | 'light'
}) {
  const { isLight } = useTheme()
  const useDarkInk = tone === 'auto' ? isLight : tone === 'dark'
  return <img src={useDarkInk ? amicusDark : amicusLight} alt={alt} className={className} />
}
