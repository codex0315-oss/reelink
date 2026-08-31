import { Composition, registerRoot } from 'remotion';
import { PropertyReel, type TemplateVisual, type EndCard } from './PropertyReel';

const FPS = 30;

// Sensible stand-in used only when the Studio opens the composition with no props;
// every real render passes a full template from the server.
const FALLBACK_TEMPLATE: TemplateVisual = {
  layout: 'fullbleed',
  secondsPerPhoto: 3,
  transitionFrames: 15,
  zoom: [1, 1.15],
  accent: '#F0A93B',
  ink: '#FFFFFF',
  surface: '#070D1B',
  blocks: [],
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="PropertyReel"
      component={PropertyReel}
      durationInFrames={FPS * 15}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{
        photos: [] as string[],
        template: FALLBACK_TEMPLATE,
        endCard: null as EndCard | null,
        audioSrc: null as string | null,
      }}
      // Pacing is per-template and the closing card adds its own time, so the length
      // has to be derived from the props rather than fixed.
      calculateMetadata={({ props }) => {
        const template = props.template ?? FALLBACK_TEMPLATE;
        const photos = Math.max(props.photos?.length ?? 0, 1);
        const endSeconds = props.endCard?.seconds ?? 0;
        return {
          durationInFrames: Math.round(
            FPS * (template.secondsPerPhoto * photos + endSeconds),
          ),
        };
      }}
    />
  );
};

registerRoot(RemotionRoot);
