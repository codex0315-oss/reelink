/**
 * Space at the end of a scrolling page for the floating Amicus bubble to sit over.
 *
 * The bubble is `fixed`, so it is not in any page's layout — it simply covers whatever
 * ends up beneath it, which on a phone is usually the last row of actions. Reserving the
 * space here lets that row scroll clear instead, the same way a Material FAB requires
 * bottom padding on the list it floats above.
 *
 * A spacer element rather than padding on <main>: the shell also hosts full-height views
 * (Messages, Browse, Reels) that size themselves to the viewport, and padding there would
 * push them into overflow. Only the pages that actually scroll opt in.
 *
 * Heights track the bubble's own offsets — 5rem + 4rem on phones, 1.5rem + 4rem from sm:
 * up — plus a little breathing room.
 */
export default function BubbleClearance() {
  return <div aria-hidden className="h-36 sm:h-24" />
}
