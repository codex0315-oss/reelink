import { useEffect, useRef, useState } from 'react'

/**
 * True once a request has been running long enough that the server is probably asleep.
 *
 * The API is on a free Render instance, which spins down after fifteen minutes of
 * inactivity and takes roughly fifty seconds to come back. That first request is not
 * failing — it is queued behind a container starting up — but with no feedback it looks
 * identical to a dead site, and people press the button again.
 *
 * The delay before speaking up matters: a warm server answers in well under a second,
 * so announcing "waking up" immediately would be wrong almost every time. Waiting a
 * few seconds means the message only ever appears when it is actually true.
 */
const SPEAK_UP_AFTER_MS = 3000

export function useWakingServer(active: boolean) {
  const [waking, setWaking] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!active) {
      if (timer.current) window.clearTimeout(timer.current)
      setWaking(false)
      return
    }

    timer.current = window.setTimeout(() => setWaking(true), SPEAK_UP_AFTER_MS)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [active])

  return waking
}
