import { ReelSource } from './reel-source.type';

/**
 * Reel templates.
 *
 * The first version of this file varied only colour, type and pacing, which made all
 * four templates share one silhouette. Each template now owns a distinct LAYOUT —
 * how the photo is framed and where the text is anchored — so they are told apart at
 * a glance in the picker.
 */

export const CANVAS = { width: 1080, height: 1920 };
export const FPS = 30;
export const END_CARD_SECONDS = 1.8;

export type TemplateId = 'classic' | 'luxury' | 'quicktour' | 'bold';
export type Layout = 'fullbleed' | 'inset' | 'band' | 'split';

const NAVY = '#0B2952';
const NAVY_DEEP = '#070D1B';
const GOLD = '#F0A93B';
const WHITE = '#FFFFFF';

type Block = {
  text: string;
  slot: 'top' | 'bottom';
  size: number;
  color: string;
  weight?: number;
  letterSpacing?: string;
  lineHeight?: number;
  emphasis?: boolean;
};

export type ReelTemplate = {
  id: TemplateId;
  name: string;
  description: string;
  previewUrl: string;
  layout: Layout;
  secondsPerPhoto: number;
  transitionSeconds: number;
  zoom: [number, number];
  moves: Array<'in' | 'out' | 'left' | 'right' | 'up'>;
  accent: string;
  ink: string;
  surface: string;
  vignette?: number;
  /**
   * Filename under uploads/music. Absent, or missing from disk, renders silently —
   * music is an enhancement, never a prerequisite for producing a reel.
   */
  music?: string;
  showCounter?: boolean;
  showProgress?: boolean;
  build: (source: ReelSource, hook: string) => Block[];
};

const peso = (price: number) => `₱${Number(price).toLocaleString()}`;
const forLabel = (t: string) => (t === 'rent' ? 'FOR RENT' : 'FOR SALE');
const statusLabel = (s: string) => s.replace('-', ' ').toUpperCase();

export const REEL_TEMPLATES: Record<TemplateId, ReelTemplate> = {
  /* --------------------------------------------------------------- classic
     Full-bleed photo, everything centred. The safe, readable default. */
  classic: {
    id: 'classic',
    music: 'classic.mp3',
    name: 'Classic',
    description: 'Full-bleed photo with centred text. Clean and readable.',
    previewUrl: '/templates/classic.mp4',
    layout: 'fullbleed',
    secondsPerPhoto: 3,
    transitionSeconds: 0.5,
    zoom: [1, 1.14],
    moves: ['in', 'out', 'left', 'in', 'right'],
    accent: GOLD,
    ink: WHITE,
    surface: NAVY_DEEP,
    vignette: 0.55,
    showProgress: true,
    build: (s, hook) => [
      { text: hook.toUpperCase(), slot: 'top', size: 60, color: GOLD, weight: 800, lineHeight: 1.15 },
      { text: forLabel(s.listingType), slot: 'bottom', size: 32, color: GOLD, weight: 700, letterSpacing: '5px' },
      { text: peso(s.price), slot: 'bottom', size: 86, color: WHITE, weight: 900, emphasis: true },
      { text: s.title, slot: 'bottom', size: 40, color: WHITE, weight: 600 },
      { text: statusLabel(s.status), slot: 'bottom', size: 27, color: '#FFFFFFB3', weight: 500, letterSpacing: '3px' },
    ],
  },

  /* ---------------------------------------------------------------- luxury
     Photo inset inside a dark gallery frame, gold hairlines, left-aligned. */
  luxury: {
    id: 'luxury',
    music: 'luxury.mp3',
    name: 'Luxury',
    description: 'Gallery frame with wide margins and slow drift. For premium listings.',
    previewUrl: '/templates/luxury.mp4',
    layout: 'inset',
    secondsPerPhoto: 4.5,
    transitionSeconds: 1,
    zoom: [1, 1.18],
    moves: ['in', 'up', 'out', 'left'],
    accent: GOLD,
    ink: WHITE,
    surface: NAVY_DEEP,
    vignette: 0.25,
    build: (s, hook) => [
      { text: forLabel(s.listingType), slot: 'top', size: 26, color: GOLD, weight: 600, letterSpacing: '12px' },
      { text: hook, slot: 'bottom', size: 44, color: '#FFFFFFCC', weight: 300, lineHeight: 1.35 },
      { text: s.title.toUpperCase(), slot: 'bottom', size: 46, color: WHITE, weight: 400, letterSpacing: '3px', lineHeight: 1.3 },
      { text: peso(s.price), slot: 'bottom', size: 72, color: GOLD, weight: 700, emphasis: true },
    ],
  },

  /* ------------------------------------------------------------- quicktour
     Full-bleed photo over a solid navy band, with a photo counter. */
  quicktour: {
    id: 'quicktour',
    music: 'quicktour.mp3',
    name: 'Quick Tour',
    description: 'Fast cuts over a solid info band, with a photo counter.',
    previewUrl: '/templates/quicktour.mp4',
    layout: 'band',
    secondsPerPhoto: 1.6,
    transitionSeconds: 0.2,
    zoom: [1.12, 1],
    moves: ['out', 'left', 'right', 'in', 'up'],
    accent: GOLD,
    ink: WHITE,
    surface: NAVY,
    showCounter: true,
    showProgress: true,
    build: (s, hook) => [
      { text: hook.toUpperCase(), slot: 'top', size: 54, color: WHITE, weight: 900, lineHeight: 1.1 },
      { text: forLabel(s.listingType), slot: 'bottom', size: 26, color: GOLD, weight: 800, letterSpacing: '6px' },
      { text: peso(s.price), slot: 'bottom', size: 76, color: WHITE, weight: 900, emphasis: true },
      { text: `${s.title} · ${statusLabel(s.status)}`, slot: 'bottom', size: 28, color: '#FFFFFFB3', weight: 500 },
    ],
  },

  /* ------------------------------------------------------------------ bold
     Photo on top, a solid gold block beneath carrying the price. */
  bold: {
    id: 'bold',
    music: 'bold.mp3',
    name: 'Bold',
    description: 'Photo above a solid gold block. Built to stop the scroll.',
    previewUrl: '/templates/bold.mp4',
    layout: 'split',
    secondsPerPhoto: 2.5,
    transitionSeconds: 0.3,
    zoom: [1, 1.1],
    moves: ['left', 'in', 'right', 'out'],
    accent: GOLD,
    ink: WHITE,
    surface: NAVY_DEEP,
    vignette: 0.35,
    showProgress: true,
    build: (s, hook) => [
      { text: hook.toUpperCase(), slot: 'top', size: 56, color: WHITE, weight: 900, lineHeight: 1.1 },
      // These sit on the gold block, so they are inked in navy.
      { text: forLabel(s.listingType), slot: 'bottom', size: 28, color: NAVY_DEEP, weight: 800, letterSpacing: '7px' },
      { text: peso(s.price), slot: 'bottom', size: 104, color: NAVY_DEEP, weight: 900, emphasis: true, lineHeight: 1 },
      { text: `${s.title} · ${statusLabel(s.status)}`, slot: 'bottom', size: 28, color: '#070D1BB3', weight: 600 },
    ],
  },
};

export const DEFAULT_TEMPLATE: TemplateId = 'classic';

export function resolveTemplate(id?: string | null): ReelTemplate {
  return REEL_TEMPLATES[(id as TemplateId) ?? DEFAULT_TEMPLATE] ?? REEL_TEMPLATES[DEFAULT_TEMPLATE];
}

export function listTemplates() {
  return Object.values(REEL_TEMPLATES).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    previewUrl: t.previewUrl,
    secondsPerPhoto: t.secondsPerPhoto,
  }));
}

/** Everything the Remotion composition needs, so remotion/ holds no template knowledge. */
export function toRemotionProps(
  template: ReelTemplate,
  source: ReelSource,
  hook: string,
  agent?: { name?: string | null; phone?: string | null },
  logoSrc?: string | null,
) {
  return {
    template: {
      layout: template.layout,
      secondsPerPhoto: template.secondsPerPhoto,
      transitionFrames: Math.round(template.transitionSeconds * FPS),
      zoom: template.zoom,
      moves: template.moves,
      accent: template.accent,
      ink: template.ink,
      surface: template.surface,
      vignette: template.vignette,
      showCounter: template.showCounter,
      showProgress: template.showProgress,
      blocks: template.build(source, hook),
    },
    endCard: {
      logoSrc: logoSrc ?? null,
      headline: source.title,
      price: peso(source.price),
      agentName: agent?.name ?? null,
      agentPhone: agent?.phone ?? null,
      seconds: END_CARD_SECONDS,
    },
  };
}

/** Total render length: every photo, plus the closing card. */
export function totalSeconds(template: ReelTemplate, photoCount: number) {
  return Math.max(photoCount, 1) * template.secondsPerPhoto + END_CARD_SECONDS;
}
