import { useMemo } from 'react';
import {
  AbsoluteFill,
  Img,
  Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

/**
 * The renderer is driven entirely by the template config the server sends, so adding
 * or tuning a template never requires touching this file.
 *
 * Templates differ by LAYOUT, not just colour and type — that was the flaw in the
 * first pass, where four templates all shared the same silhouette.
 */
export type Layout = 'fullbleed' | 'inset' | 'band' | 'split';

export type TemplateBlock = {
  text: string;
  slot: 'top' | 'bottom';
  size: number;
  color: string;
  weight?: number;
  letterSpacing?: string;
  lineHeight?: number;
  /** Renders on its own line with extra room — used for the price. */
  emphasis?: boolean;
};

export type TemplateVisual = {
  layout: Layout;
  secondsPerPhoto: number;
  transitionFrames: number;
  zoom: [number, number];
  /** Each photo takes the next move in this list, so the motion never repeats. */
  moves?: Array<'in' | 'out' | 'left' | 'right' | 'up'>;
  accent: string;
  ink: string;
  /** Canvas behind an inset photo, and the fill for band/split furniture. */
  surface: string;
  vignette?: number;
  showCounter?: boolean;
  showProgress?: boolean;
  blocks: TemplateBlock[];
};

export type EndCard = {
  logoSrc?: string | null;
  headline: string;
  price: string;
  agentName?: string | null;
  agentPhone?: string | null;
  seconds: number;
};

type Props = {
  photos: string[];
  template: TemplateVisual;
  endCard?: EndCard | null;
  audioSrc?: string | null;
  /**
   * An AI-animated version of the first photo, when the agent asked for a cinematic
   * open. Null is the normal case and simply renders the still as before — generation
   * is paid, optional, and allowed to fail without taking the reel down with it.
   */
  heroClip?: string | null;
  /** The template's backing track. Null until a file is added for it. */
  musicSrc?: string | null;
  /** The narration script, shown as captions whether or not it is also spoken. */
  script?: string | null;
};

export function PropertyReel({
  photos,
  template,
  endCard,
  audioSrc,
  heroClip,
  musicSrc,
  script,
}: Props) {
  const { fps, durationInFrames } = useVideoConfig();
  const framesPerPhoto = Math.round(template.secondsPerPhoto * fps);
  const photoFrames = framesPerPhoto * Math.max(photos.length, 1);

  return (
    <AbsoluteFill style={{ backgroundColor: template.surface }}>
      {photos.map((photo, i) => (
        <Sequence
          key={i}
          from={i * framesPerPhoto}
          durationInFrames={framesPerPhoto + template.transitionFrames}
        >
          <Scene
            src={photo}
            // Only the opening shot is animated: it is where the motion earns its cost,
            // and one clip per reel is what keeps generation affordable.
            videoSrc={i === 0 ? (heroClip ?? null) : null}
            index={i}
            total={photos.length}
            template={template}
            framesPerPhoto={framesPerPhoto}
            isFirst={i === 0}
          />
        </Sequence>
      ))}

      {endCard && (
        <Sequence from={photoFrames} durationInFrames={Math.round(endCard.seconds * fps)}>
          <EndCardScene card={endCard} template={template} />
        </Sequence>
      )}

      {/* Captions sit above the progress bar and the platform's own UI. */}
      {script && (
        <Captions script={script} totalFrames={photoFrames} template={template} />
      )}

      {template.showProgress && <ProgressBar total={durationInFrames} accent={template.accent} />}

      {audioSrc && <Audio src={audioSrc} />}

      {/* Ducked hard under narration so the voice stays intelligible, and left quiet
          even alone — this is a bed under an estate agent's listing, not a music video.
          The last second fades out so the reel ends rather than being cut off. */}
      {musicSrc && (
        <Audio
          src={musicSrc}
          volume={(f) => {
            const base = audioSrc ? 0.12 : 0.35;
            const fadeStart = durationInFrames - fps;
            if (f < fps / 2) return base * (f / (fps / 2)); // brief fade in
            if (f > fadeStart) {
              return base * Math.max(0, 1 - (f - fadeStart) / fps);
            }
            return base;
          }}
        />
      )}
    </AbsoluteFill>
  );
}

/**
 * Burned-in captions.
 *
 * Most social video is watched with the sound off, so these do the work the voiceover
 * would — and they show up even with text-to-speech disabled, which is the current
 * state. Timing is proportional to phrase length rather than real speech timestamps:
 * without word-level timings from a TTS provider that is the honest approximation, and
 * it tracks a spoken delivery closely enough to read naturally.
 *
 * Height is chosen to clear two different things. Instagram and Facebook overlay their
 * own controls across roughly the bottom 15% of a reel, and the template's own price and
 * status block sits just above that — a first pass at 22% landed on top of it and left
 * both unreadable. 38% clears the furniture in every layout, including `split`, whose
 * accent panel occupies the bottom 36%.
 */
function Captions({
  script,
  totalFrames,
  template,
}: {
  script: string;
  totalFrames: number;
  template: TemplateVisual;
}) {
  const frame = useCurrentFrame();

  // Split on sentence ends, then break anything still too long to read at a glance.
  const phrases = useMemo(() => {
    // Written without flatMap: this folder is excluded from the server's tsconfig, so it
    // compiles against whatever lib the bundler assumes rather than the project's.
    const pieces: string[] = [];
    for (const sentence of script.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/)) {
      const parts = sentence.length > 60 ? sentence.split(/,\s+/) : [sentence];
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed) pieces.push(trimmed);
      }
    }

    // Splitting on commas can leave a fragment a word or two long, which flashes up as
    // a caption reading just "furnished" and looks like a glitch. Anything under this
    // is folded into the line before it.
    const MIN_CAPTION_CHARS = 22;
    const out: string[] = [];
    for (const piece of pieces) {
      if (out.length && piece.length < MIN_CAPTION_CHARS) {
        out[out.length - 1] += `, ${piece}`;
      } else {
        out.push(piece);
      }
    }

    return out.length ? out : [script.trim()];
  }, [script]);

  // Longer phrases hold the screen longer, which is what makes this read as speech
  // rather than as a metronome.
  const totalChars = phrases.reduce((n, p) => n + p.length, 0) || 1;
  let cursor = 0;
  const timed = phrases.map((text) => {
    const span = Math.max(1, Math.round((text.length / totalChars) * totalFrames));
    const start = cursor;
    cursor += span;
    return { text, start, end: start + span };
  });

  const active = timed.find((p) => frame >= p.start && frame < p.end);
  if (!active) return null;

  // A short rise on entry, so each line arrives rather than blinking into place.
  const age = frame - active.start;
  const enter = Math.min(1, age / 6);

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: '42%',
        paddingLeft: 90,
        paddingRight: 90,
      }}
    >
      <div
        style={{
          opacity: enter,
          transform: `translateY(${(1 - enter) * 12}px)`,
          textAlign: 'center',
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 800,
          fontSize: 42,
          lineHeight: 1.25,
          color: '#FFFFFF',
          // A dark outline rather than a solid bar: the photo stays visible, and the
          // text stays readable over a bright sky or a white wall either way.
          textShadow:
            '0 2px 12px rgba(0,0,0,0.85), 0 0 3px rgba(0,0,0,0.9), 0 0 1px rgba(0,0,0,1)',
          WebkitTextStroke: `1px ${template.surface}`,
        }}
      >
        {active.text}
      </div>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------- scene */

function Scene({
  src,
  videoSrc,
  index,
  total,
  template,
  framesPerPhoto,
  isFirst,
}: {
  src: string;
  videoSrc?: string | null;
  index: number;
  total: number;
  template: TemplateVisual;
  framesPerPhoto: number;
  isFirst: boolean;
}) {
  const frame = useCurrentFrame();
  const { transitionFrames } = template;

  const fadeIn =
    isFirst || transitionFrames === 0
      ? 1
      : interpolate(frame, [0, transitionFrames], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      <PhotoFrame
        src={src}
        videoSrc={videoSrc}
        index={index}
        template={template}
        framesPerPhoto={framesPerPhoto}
      />

      {/* Text re-enters on every photo change instead of sitting static. */}
      <Overlays template={template} index={index} total={total} />
    </AbsoluteFill>
  );
}

function PhotoFrame({
  src,
  videoSrc,
  index,
  template,
  framesPerPhoto,
}: {
  src: string;
  videoSrc?: string | null;
  index: number;
  template: TemplateVisual;
  framesPerPhoto: number;
}) {
  const frame = useCurrentFrame();
  const { layout, zoom, moves, vignette } = template;

  // Alternating moves are what stop a photo sequence reading as a slideshow.
  const move = moves?.length ? moves[index % moves.length] : 'in';
  const t = (from: number, to: number) =>
    interpolate(frame, [0, framesPerPhoto], [from, to], { extrapolateRight: 'clamp' });

  const scale = move === 'out' ? t(zoom[1], zoom[0]) : t(zoom[0], zoom[1]);
  const x = move === 'left' ? t(2, -2) : move === 'right' ? t(-2, 2) : 0;
  const y = move === 'up' ? t(2, -2) : 0;

  // The AI clip already carries its own camera move, so it deliberately skips the Ken
  // Burns transform below — stacking a generated push-in on top of a scripted one reads
  // as a drift, not a shot. OffthreadVideo rather than Video: it decodes frame-exactly
  // during a render instead of relying on playback timing.
  const img = videoSrc ? (
    <OffthreadVideo
      src={videoSrc}
      muted
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  ) : (
    <Img
      src={src}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        transform: `scale(${scale}) translate(${x}%, ${y}%)`,
      }}
    />
  );

  // Each layout frames the photo differently — this is the main visual difference
  // between templates.
  if (layout === 'inset') {
    return (
      <AbsoluteFill style={{ padding: '150px 70px 430px' }}>
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
          {img}
          {vignette ? <Vignette strength={vignette} /> : null}
        </div>
      </AbsoluteFill>
    );
  }

  if (layout === 'split') {
    return (
      <AbsoluteFill>
        <div style={{ position: 'relative', width: '100%', height: '64%', overflow: 'hidden' }}>
          {img}
          {vignette ? <Vignette strength={vignette} /> : null}
        </div>
        <div style={{ width: '100%', height: '36%', backgroundColor: template.accent }} />
      </AbsoluteFill>
    );
  }

  // fullbleed and band both fill the frame; band adds furniture in Overlays.
  return (
    <AbsoluteFill>
      {img}
      {vignette ? <Vignette strength={vignette} /> : null}
    </AbsoluteFill>
  );
}

function Vignette({ strength }: { strength: number }) {
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(to bottom, rgba(0,0,0,${strength}) 0%, rgba(0,0,0,0) 28%, rgba(0,0,0,0) 55%, rgba(0,0,0,${strength * 1.5}) 100%)`,
      }}
    />
  );
}

/* ---------------------------------------------------------------- overlays */

function Overlays({
  template,
  index,
  total,
}: {
  template: TemplateVisual;
  index: number;
  total: number;
}) {
  const { layout, blocks, accent, ink, surface } = template;
  const top = blocks.filter((b) => b.slot === 'top');
  const bottom = blocks.filter((b) => b.slot === 'bottom');

  const alignment =
    layout === 'fullbleed' ? 'center' : layout === 'split' ? 'center' : 'flex-start';
  const textAlign = alignment === 'center' ? 'center' : 'left';

  return (
    <AbsoluteFill>
      {/* Solid band behind the lower text, which is what makes Quick Tour distinct */}
      {layout === 'band' && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 520,
            backgroundColor: surface,
          }}
        />
      )}

      {/* Hairline rules above and below the inset photo */}
      {layout === 'inset' && (
        <>
          <Rule y={100} color={accent} />
          <Rule y={1560} color={accent} />
        </>
      )}

      <div
        style={{
          position: 'absolute',
          top: layout === 'inset' ? 40 : 120,
          left: 70,
          right: 70,
          display: 'flex',
          flexDirection: 'column',
          alignItems: alignment,
          gap: 12,
        }}
      >
        {top.map((b, i) => (
          <Block key={i} block={b} delay={i * 4} textAlign={textAlign} />
        ))}
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: layout === 'split' ? 90 : layout === 'band' ? 90 : 140,
          left: 70,
          right: 70,
          display: 'flex',
          flexDirection: 'column',
          alignItems: alignment,
          gap: 10,
        }}
      >
        {bottom.map((b, i) => (
          <Block key={i} block={b} delay={i * 4} textAlign={textAlign} />
        ))}
      </div>

      {template.showCounter && (
        <div
          style={{
            position: 'absolute',
            top: 60,
            right: 70,
            color: ink,
            opacity: 0.75,
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: '2px',
          }}
        >
          {index + 1} / {total}
        </div>
      )}
    </AbsoluteFill>
  );
}

function Rule({ y, color }: { y: number; color: string }) {
  const frame = useCurrentFrame();
  const width = interpolate(frame, [0, 20], [0, 100], { extrapolateRight: 'clamp' });
  return (
    <div
      style={{
        position: 'absolute',
        top: y,
        left: 70,
        width: `${width}%`,
        maxWidth: 'calc(100% - 140px)',
        height: 2,
        backgroundColor: color,
        opacity: 0.7,
      }}
    />
  );
}

function Block({
  block,
  delay,
  textAlign,
}: {
  block: TemplateBlock;
  delay: number;
  textAlign: 'center' | 'left';
}) {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [delay, delay + 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        color: block.color,
        fontSize: block.size,
        fontWeight: block.weight ?? 700,
        lineHeight: block.lineHeight ?? 1.15,
        letterSpacing: block.letterSpacing,
        textAlign,
        width: '100%',
        opacity: progress,
        transform: `translateY(${(1 - progress) * 26}px)`,
        textShadow: block.emphasis ? 'none' : '0 4px 22px rgba(0,0,0,0.5)',
      }}
    >
      {block.text}
    </div>
  );
}

/* ---------------------------------------------------------------- end card */

function EndCardScene({ card, template }: { card: EndCard; template: TemplateVisual }) {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: template.surface,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 90,
        opacity: enter,
      }}
    >
      {card.logoSrc && (
        <Img src={card.logoSrc} style={{ width: 420, objectFit: 'contain', marginBottom: 60 }} />
      )}

      <div
        style={{
          color: template.accent,
          fontSize: 78,
          fontWeight: 900,
          textAlign: 'center',
          transform: `translateY(${(1 - enter) * 20}px)`,
        }}
      >
        {card.price}
      </div>

      <div
        style={{
          color: template.ink,
          fontSize: 38,
          fontWeight: 500,
          textAlign: 'center',
          marginTop: 14,
          opacity: 0.85,
        }}
      >
        {card.headline}
      </div>

      {(card.agentName || card.agentPhone) && (
        <div style={{ marginTop: 70, textAlign: 'center' }}>
          <div style={{ width: 90, height: 2, backgroundColor: template.accent, margin: '0 auto 28px' }} />
          {card.agentName && (
            <div style={{ color: template.ink, fontSize: 40, fontWeight: 700 }}>
              {card.agentName}
            </div>
          )}
          {card.agentPhone && (
            <div style={{ color: template.ink, fontSize: 34, opacity: 0.7, marginTop: 8 }}>
              {card.agentPhone}
            </div>
          )}
        </div>
      )}
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------- progress bar */

function ProgressBar({ total, accent }: { total: number; accent: string }) {
  const frame = useCurrentFrame();
  const pct = interpolate(frame, [0, total], [0, 100], { extrapolateRight: 'clamp' });
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        height: 6,
        width: `${pct}%`,
        backgroundColor: accent,
      }}
    />
  );
}
