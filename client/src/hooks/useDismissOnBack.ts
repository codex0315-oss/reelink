import { useEffect, useRef } from 'react'

/**
 * Makes the device Back button close an overlay instead of leaving the page.
 *
 * Modals here are React state, not routes, so the browser has no idea one is open.
 * On a phone that is actively misleading: opening "Create listing" and pressing Back
 * pops the history entry for the dashboard itself, landing the user on whatever came
 * before — usually the login page, which reads as having been signed out.
 *
 * Pushing a throwaway history entry when the overlay opens gives Back something to
 * consume. The entry is removed again if the overlay is closed by its own button, so
 * Back never needs pressing twice to leave a page the user is actually finished with.
 *
 * The rewind is deferred by a tick, and that is load-bearing. In development React
 * runs every effect twice — mount, cleanup, mount again — and an immediate
 * `history.back()` in that cleanup fired a `popstate` that the second mount's listener
 * then took for a real Back press, closing every modal the instant it opened. Deferring
 * the rewind lets the re-mount cancel it and keep the entry it already has.
 */
export function useDismissOnBack(open: boolean, onClose: () => void) {
  // Handlers are bound once per open, so the latest onClose has to be reachable
  // through a ref rather than captured.
  const close = useRef(onClose)
  close.current = onClose

  // A rewind scheduled by cleanup, so a re-mount can call it off. Refs survive the
  // development double-invoke; a local in the effect would not.
  const pendingRewind = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return

    if (pendingRewind.current !== null) {
      // The cleanup a moment ago was about to pop our entry. It is still on the stack,
      // so keep it rather than push a second one on top.
      window.clearTimeout(pendingRewind.current)
      pendingRewind.current = null
    } else {
      // Marked so the cleanup can tell our entry apart from a real navigation.
      window.history.pushState({ reelinkOverlay: true }, '')
    }

    let dismissedByBack = false
    const onPop = () => {
      dismissedByBack = true
      close.current()
    }

    window.addEventListener('popstate', onPop)

    return () => {
      window.removeEventListener('popstate', onPop)

      // Closed by its own button or the Escape key: the entry we pushed is still on the
      // stack, and leaving it there would mean the next Back press appears to do
      // nothing. Only rewind when the entry is still ours — after a real navigation it
      // belongs to someone else, and going back would undo that instead.
      if (!dismissedByBack && window.history.state?.reelinkOverlay) {
        pendingRewind.current = window.setTimeout(() => {
          pendingRewind.current = null
          if (window.history.state?.reelinkOverlay) window.history.back()
        }, 0)
      }
    }
  }, [open])
}
