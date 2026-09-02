/**
 * Progress model for a reel render.
 *
 * Only the render phase can report a true number — Remotion counts frames. The
 * earlier phases are remote calls we can only wait on, so each is given a share of
 * the bar proportional to how long it actually takes, measured on this machine:
 *
 *   script     ~3s     AI headline and voiceover text
 *   narration  20-60s  cloud TTS render, polled until ready
 *   prepare    1-5s    webpack bundle + Chrome (both cached after the first run)
 *   render     30-70s  the frames themselves
 *
 * The label alongside the bar names the running phase, so the number is never asked
 * to imply more precision than it has.
 */
export type ReelPhase =
  | 'script'
  | 'cinematic'
  | 'narration'
  | 'prepare'
  | 'render'
  | 'done';

type PhaseSpan = { from: number; to: number; label: string };

export const PHASES: Record<ReelPhase, PhaseSpan> = {
  // Starts above zero deliberately. This phase parks at its own start while the model
  // writes, and a bar reading exactly 0% for several seconds is the thing users read as
  // frozen — the work has begun, so the bar should say so.
  script: { from: 5, to: 12, label: 'Writing the headline' },
  // Only runs for cinematic reels, and it is the longest remote wait in the chain —
  // a queued generation polled until it lands. It borrows its slice from narration
  // rather than lengthening the bar, so a standard reel's pacing is unchanged.
  cinematic: { from: 10, to: 30, label: 'Filming the opening shot' },
  narration: { from: 30, to: 45, label: 'Recording the voiceover' },
  prepare: { from: 45, to: 55, label: 'Preparing the render' },
  render: { from: 55, to: 99, label: 'Rendering video' },
  // 100 is only ever reached once the file is on disk and the row says 'done'.
  done: { from: 100, to: 100, label: 'Ready' },
};

export type ReelProgress = {
  reelId: string;
  phase: ReelPhase;
  label: string;
  percent: number;
};

/**
 * Maps a fraction within a phase onto its slice of the overall bar.
 * `within` is 0..1 and is only meaningful for the render phase; the others pass 0
 * on entry, which parks the bar at the start of their slice rather than faking motion.
 */
export function percentFor(phase: ReelPhase, within = 0): number {
  const span = PHASES[phase];
  const clamped = Math.min(Math.max(within, 0), 1);
  return Math.round(span.from + (span.to - span.from) * clamped);
}

/**
 * `label` overrides the phase's own wording. The cloud renderer reports what it is
 * doing as it goes — "rendering scenes", then "concatenating scenes" — and saying that
 * is better than a generic "Rendering video" held for the whole wait.
 */
export function progressFor(
  reelId: string,
  phase: ReelPhase,
  within = 0,
  label?: string,
): ReelProgress {
  return {
    reelId,
    phase,
    label: label?.trim() || PHASES[phase].label,
    percent: percentFor(phase, within),
  };
}
