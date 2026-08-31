import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { connectSocket } from '../lib/socket'

export type ReelProgress = {
  reelId: string
  phase: 'script' | 'narration' | 'prepare' | 'render' | 'done'
  label: string
  percent: number
}

export type ReelDone = {
  reelId: string
  title: string
  videoUrl?: string
}

type ReelProgressContextType = {
  /** Keyed by reel id — several can render in sequence. */
  progress: Record<string, ReelProgress>
  /** The most recent finished reel, until it is dismissed. */
  finished: ReelDone | null
  dismissFinished: () => void
  /** Fired when a reel finishes, so the page holding the list can refresh it. */
  onFinish: (handler: () => void) => () => void
}

const ReelProgressContext = createContext<ReelProgressContextType | undefined>(undefined)

/**
 * Live reel-render progress, held app-wide.
 *
 * It lives here rather than on the Reels screen because the point of the feature is
 * that you can go and do something else while a reel renders — progress has to keep
 * arriving on any tab, and the completion toast has to fire wherever you are.
 *
 * Nothing is persisted: a percentage is meaningless once the render ends, and the
 * server already fails any reel orphaned by a restart.
 */
export function ReelProgressProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const [progress, setProgress] = useState<Record<string, ReelProgress>>({})
  const [finished, setFinished] = useState<ReelDone | null>(null)
  const [handlers] = useState(() => new Set<() => void>())

  const onFinish = useCallback(
    (handler: () => void) => {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
    [handlers],
  )

  useEffect(() => {
    if (!token) {
      setProgress({})
      setFinished(null)
      return
    }
    const socket = connectSocket(token)

    const onProgress = (p: ReelProgress) =>
      setProgress((prev) => ({ ...prev, [p.reelId]: p }))

    const onDone = (done: ReelDone) => {
      setProgress((prev) => {
        const next = { ...prev }
        delete next[done.reelId]
        return next
      })
      setFinished(done)
      // Let the Reels list refetch so the finished video is actually there when the
      // user clicks through from the toast.
      handlers.forEach((h) => h())
    }

    const onFailed = ({ reelId }: { reelId: string }) => {
      setProgress((prev) => {
        const next = { ...prev }
        delete next[reelId]
        return next
      })
      handlers.forEach((h) => h())
    }

    socket.on('reel:progress', onProgress)
    socket.on('reel:done', onDone)
    socket.on('reel:failed', onFailed)

    return () => {
      socket.off('reel:progress', onProgress)
      socket.off('reel:done', onDone)
      socket.off('reel:failed', onFailed)
    }
  }, [token, handlers])

  return (
    <ReelProgressContext.Provider
      value={{
        progress,
        finished,
        dismissFinished: () => setFinished(null),
        onFinish,
      }}
    >
      {children}
    </ReelProgressContext.Provider>
  )
}

export function useReelProgress() {
  const ctx = useContext(ReelProgressContext)
  if (!ctx) throw new Error('useReelProgress must be used inside ReelProgressProvider')
  return ctx
}
