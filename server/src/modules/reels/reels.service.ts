import {
  Injectable,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { NotificationsService } from '../notifications/notifications.service';
import { QuickReelDto } from './dto/quick-reel.dto';
import { Json2VideoService } from './json2video.service';
import { HiggsfieldService } from './higgsfield.service';
import { StorageService } from '../storage/storage.service';
import { ReelSource } from './reel-source.type';
import { progressFor, type ReelPhase } from './reel-progress';
import {
  ReelTemplate,
  resolveTemplate,
  toRemotionProps,
  totalSeconds,
} from './reel-templates';
import { bundle } from '@remotion/bundler';
import {
  renderMedia,
  selectComposition,
  openBrowser,
  type HeadlessBrowser,
} from '@remotion/renderer';
import * as path from 'path';
import { readFile, unlink, writeFile } from 'fs/promises';
import { existsSync, watch } from 'fs';
import { execFile } from 'child_process';

/**
 * Pulls the audio track out of a rendered clip, using the ffmpeg binary Remotion
 * already ships so this adds no dependency.
 */
function extractAudio(input: string, output: string) {
  const ffmpeg = path.join(
    process.cwd(),
    'node_modules',
    '@remotion',
    `compositor-${process.platform}-${process.arch}-msvc`,
    'ffmpeg.exe',
  );
  const binary = existsSync(ffmpeg) ? ffmpeg : 'ffmpeg';

  return new Promise<void>((resolve, reject) => {
    execFile(
      binary,
      ['-y', '-loglevel', 'error', '-i', input, '-vn', '-acodec', 'libmp3lame', output],
      (err) => (err ? reject(err) : resolve()),
    );
  });
}


// Remotion serves the bundle from its own HTTP server, scanning up from port 3000.
// On Windows that scan can wrongly consider 3000 free while Nest holds it (Nest binds
// '::', Remotion only tests '0.0.0.0'/'127.0.0.1'/'::1'), so Chrome ends up loading the
// API instead of the bundle. Pin it to a port the API never uses.
const REMOTION_PORT = Number(process.env.REMOTION_PORT ?? 3999);

// Chrome fetches the listing photos back over HTTP while rendering, so it needs an
// absolute URL pointing at this API.
const SELF_URL = process.env.SELF_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

/**
 * Photos may be a relative `/uploads/...` path or an absolute object-storage URL
 * depending on the backend, and Chrome needs an absolute one either way.
 */
const absolute = (url: string) => (url.startsWith('http') ? url : `${SELF_URL}${url}`);

// 'remotion' renders locally: free and watermark-free, but it needs real CPU and RAM
// on this machine. 'json2video' renders in the cloud and adds an AI voiceover, at the
// cost of credits per second of video.
const REEL_RENDERER = process.env.REEL_RENDERER ?? 'remotion';


// Encoding settings, chosen by benchmarking a 360-frame reel on a 4-core box:
//   default settings ......... 108s, 9.5 MB
//   these settings ...........  55s, 2.4 MB   <- same 1080x1920, 2x faster, 4x smaller
// Remotion defaults to crf 18 (near-lossless), which is far more than Facebook needs
// since it re-encodes on upload anyway. concurrency stays low because each parallel
// tab is a full Chrome renderer and RAM, not CPU, is the binding constraint here.
const REEL_CRF = Number(process.env.REEL_CRF ?? 23);
const REEL_CONCURRENCY = Number(process.env.REEL_CONCURRENCY ?? 2);
// 1 = 1080x1920 (Reels spec). 0.667 renders 720x1280: ~32s instead of ~55s.
const REEL_SCALE = Number(process.env.REEL_SCALE ?? 1);
/** One screenful of feed is plenty; paging can come when there is enough to page. */
const FEED_PAGE_SIZE = 50;

/**
 * How many reels one account may render.
 *
 * Sized to what the machine can actually deliver, not just to what stops abuse: a
 * render pins headless Chrome for about a minute at concurrency 1, so the whole box
 * manages roughly 60 an hour across every user. Three per hour stops one account
 * monopolising the renderer; ten a day still covers the realistic burst of an agent
 * onboarding with a full portfolio.
 *
 * When plans arrive these become a per-plan lookup — the call site does not change.
 */
const RENDERS_PER_HOUR = 3;
const RENDERS_PER_DAY = 10;
/**
 * Cinematic reels are billed per clip by Higgsfield (~$0.41 on DoP Turbo), so this cap
 * exists for cost, not fairness. At 2 a day the worst case per user is under a dollar;
 * the free tier's 10 a day would have been roughly $4 a user a day for the same work.
 */
const AI_RENDERS_PER_DAY = 2;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// bundle() runs a full webpack build; without caching it re-bundles on every reel.
let bundlePromise: Promise<string> | null = null;

/**
 * Drops the cached bundle when a template file changes.
 *
 * Two things conspire without this. The bundle is cached for the life of the process,
 * and `remotion/` is excluded from tsconfig — so `nest start --watch` does not restart
 * on those files either. Editing a template therefore had no effect at all until the
 * server was killed by hand, which is a very slow way to discover that your change did
 * not apply. Development only; in production the files never change under a running
 * process.
 */
if (process.env.NODE_ENV !== 'production') {
  try {
    const templateDir = path.join(process.cwd(), 'remotion');
    if (existsSync(templateDir)) {
      watch(templateDir, { recursive: true }, () => {
        if (bundlePromise) {
          console.log('Reels: template changed, rebuilding the Remotion bundle');
          bundlePromise = null;
        }
      }).unref(); // never hold the process open on this alone
    }
  } catch {
    // Recursive watch is not supported everywhere; a restart still works.
  }
}

function getBundle() {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: path.join(process.cwd(), 'remotion', 'index.tsx'),
    }).catch((err) => {
      bundlePromise = null; // don't cache a failed build
      throw err;
    });
  }
  return bundlePromise;
}

// Launching Chrome per reel costs 2s idle and was measured at 44s under memory
// pressure. Keep one instance warm and reuse it across renders.
let browserPromise: Promise<HeadlessBrowser> | null = null;

function getBrowser(): Promise<HeadlessBrowser> {
  if (!browserPromise) {
    browserPromise = openBrowser('chrome').catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

/**
 * Remotion serves each render from a fixed port and drives a shared Chrome instance,
 * so two renders at once collide on that port. Three parallel Chrome renderers would
 * also exhaust memory on a small box. Renders are therefore queued and run one at a
 * time; callers still return immediately because the whole chain is detached.
 */
let renderQueue: Promise<unknown> = Promise.resolve();

function enqueueRender<T>(job: () => Promise<T>): Promise<T> {
  const result = renderQueue.then(job, job);
  // Keep the chain alive even when a job rejects, so one failure can't stall the queue.
  renderQueue = result.catch(() => undefined);
  return result;
}

// Called whenever a render fails: the shared browser may have crashed or run out of
// memory, and a dead instance would otherwise poison every subsequent reel.
function discardBrowser() {
  const dying = browserPromise;
  browserPromise = null;
  void dying
    ?.then((b) => b.close({ silent: true }))
    .catch(() => undefined);
}

@Injectable()
export class ReelsService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
    private notificationsService: NotificationsService,
    private json2VideoService: Json2VideoService,
    private higgsfield: HiggsfieldService,
    private storage: StorageService,
  ) {}

  /**
   * Moves a finished render out of the container and returns the URL to record.
   *
   * The local file is deleted once it is safely in the bucket — it is a render artefact,
   * not the copy anyone plays. On local disk there is nothing to move: the renderer
   * already wrote it where it is served from.
   */
  private async publishRender(
    outputLocation: string,
    outputFileName: string,
  ): Promise<string> {
    if (!this.storage.isRemote) return `/uploads/reels/${outputFileName}`;

    const url = await this.storage.saveBuffer(
      'reels',
      outputFileName,
      await readFile(outputLocation),
      'video/mp4',
    );
    await unlink(outputLocation).catch(() => undefined);
    return url;
  }

  /**
   * Renders run in this process and are not resumable, so any reel still marked
   * 'processing' at startup was orphaned by a crash or restart. Left alone it spins
   * in the UI forever, so fail it here and let the user retry.
   */
  async onModuleInit() {
    // .env is only read at boot, so surface which renderer is actually live.
    console.log(
      REEL_RENDERER === 'json2video'
        ? 'Reels: rendering via JSON2Video (cloud, narrated)'
        : `Reels: rendering via Remotion (local, narrated, concurrency ${REEL_CONCURRENCY})`,
    );

    const { count } = await this.prisma.reel.updateMany({
      where: { status: 'processing' },
      data: { status: 'failed' },
    });
    if (count > 0) {
      console.warn(`Marked ${count} interrupted reel render(s) as failed`);
    }
  }

  /**
   * Releases the warm Chrome instance before the process exits.
   *
   * Without this, `nest start --watch` tries to tree-kill a process whose children
   * include Chrome's sandbox helpers, and taskkill refuses them with "The operation
   * attempted is not supported" — which crashes the watcher itself rather than
   * restarting it. Closing the browser through Remotion leaves nothing to kill.
   */
  async onModuleDestroy() {
    const dying = browserPromise;
    browserPromise = null;
    if (!dying) return;

    try {
      const browser = await dying;
      await browser.close({ silent: true });
    } catch {
      // already gone, or never opened cleanly — nothing useful to do on the way out
    }
  }

  /**
   * Checks the render allowance and records the attempt.
   *
   * Counts render *attempts*, so a regenerate costs the same as a new reel — they
   * cost the machine the same. Both windows are checked against the same table, so
   * the three entry points share one allowance rather than getting one each.
   */
  /**
   * What this account has left today.
   *
   * Read from the same ReelRender rows the quota check counts, so the number the UI
   * shows and the number the server enforces can never drift apart.
   */
  async quotaFor(userId: string) {
    const now = Date.now();

    const [aiUsedToday, usedToday, usedThisHour] = await Promise.all([
      this.prisma.reelRender.count({
        where: { userId, usedAi: true, createdAt: { gte: new Date(now - DAY_MS) } },
      }),
      this.prisma.reelRender.count({
        where: { userId, createdAt: { gte: new Date(now - DAY_MS) } },
      }),
      this.prisma.reelRender.count({
        where: { userId, createdAt: { gte: new Date(now - HOUR_MS) } },
      }),
    ]);

    return {
      cinematic: {
        used: aiUsedToday,
        limit: AI_RENDERS_PER_DAY,
        remaining: Math.max(0, AI_RENDERS_PER_DAY - aiUsedToday),
        /** False once the cap is reached, so the toggle can disable itself. */
        available: aiUsedToday < AI_RENDERS_PER_DAY && this.higgsfield.isConfigured,
      },
      reels: {
        usedToday,
        limitPerDay: RENDERS_PER_DAY,
        usedThisHour,
        limitPerHour: RENDERS_PER_HOUR,
      },
    };
  }

  private async claimRenderSlot(userId: string, reelId?: string, useAi = false) {
    const now = Date.now();

    // The AI allowance is checked first and is far smaller, because these renders cost
    // real money per clip rather than CPU time. Failing here before the free-tier
    // counters keeps the message specific to what the user actually ran out of.
    if (useAi) {
      const aiToday = await this.prisma.reelRender.count({
        where: { userId, usedAi: true, createdAt: { gte: new Date(now - DAY_MS) } },
      });
      if (aiToday >= AI_RENDERS_PER_DAY) {
        throw new HttpException(
          `You've used all ${AI_RENDERS_PER_DAY} cinematic reels for today. ` +
            `You can still generate standard reels, or try again tomorrow.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    const [lastHour, lastDay] = await Promise.all([
      this.prisma.reelRender.count({
        where: { userId, createdAt: { gte: new Date(now - HOUR_MS) } },
      }),
      this.prisma.reelRender.count({
        where: { userId, createdAt: { gte: new Date(now - DAY_MS) } },
      }),
    ]);

    if (lastDay >= RENDERS_PER_DAY) {
      throw new HttpException(
        `You've generated ${RENDERS_PER_DAY} reels today, which is the daily limit. ` +
          `You can generate more tomorrow.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (lastHour >= RENDERS_PER_HOUR) {
      // Telling them when the slot frees up beats a bare "try again later".
      const oldest = await this.prisma.reelRender.findFirst({
        where: { userId, createdAt: { gte: new Date(now - HOUR_MS) } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });
      const minutes = oldest
        ? Math.max(1, Math.ceil((oldest.createdAt.getTime() + HOUR_MS - now) / 60_000))
        : 60;

      throw new HttpException(
        `You can generate ${RENDERS_PER_HOUR} reels an hour. Try again in ${minutes} minute${
          minutes === 1 ? '' : 's'
        }.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.prisma.reelRender.create({ data: { userId, reelId, usedAi: useAi } });
  }

  async generateReel(
    userId: string,
    listingId: string,
    templateId?: string,
    cinematic = false,
  ) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.userId !== userId) throw new NotFoundException('Listing not found');
    if (!listing.photoUrls || listing.photoUrls.length === 0) {
      throw new NotFoundException('Listing has no photos to generate a reel from');
    }

    // Asking for cinematic when the keys are absent is not an error — it just renders
    // the way it always has, so a missing key never blocks a reel.
    const useAi = cinematic && this.higgsfield.isConfigured;
    await this.claimRenderSlot(userId, undefined, useAi);

    const reel = await this.prisma.reel.create({
      data: {
        listingId: listing.id,
        userId,
        status: 'processing',
        template: resolveTemplate(templateId).id,
      },
    });

    this.startRender(reel.id, userId, {
      title: listing.title,
      price: listing.price,
      status: listing.status,
      listingType: listing.listingType,
      amenities: listing.amenities,
      photoUrls: listing.photoUrls,
    }, templateId, useAi);

    return reel;
  }

  // Reel built straight from typed-in details + uploaded photos, with no saved listing.
  async generateQuickReel(userId: string, dto: QuickReelDto, photoUrls: string[]) {
    if (photoUrls.length === 0) {
      throw new BadRequestException('At least one photo is required to generate a reel');
    }

    await this.claimRenderSlot(userId);

    const reel = await this.prisma.reel.create({
      data: {
        userId,
        status: 'processing',
        title: dto.title,
        price: dto.price,
        propertyStatus: dto.status,
        listingType: dto.listingType,
        amenities: dto.amenities ?? [],
        photoUrls,
        template: resolveTemplate(dto.template).id,
      },
    });

    this.startRender(reel.id, userId, {
      title: dto.title,
      price: dto.price,
      status: dto.status,
      listingType: dto.listingType,
      amenities: dto.amenities ?? [],
      photoUrls,
    }, dto.template);

    return reel;
  }

  private startRender(
    reelId: string,
    userId: string,
    source: ReelSource,
    templateId?: string | null,
    useAi = false,
  ) {
    void enqueueRender(() =>
      this.renderInBackground(reelId, userId, source, templateId, useAi),
    ).catch((err) => this.handleRenderFailure(reelId, userId, source.title, err));
  }

  /**
   * Re-renders an existing reel in place, so it keeps its position in the feed and
   * simply gets a fresh AI hook, voiceover and video.
   */
  async regenerate(userId: string, reelId: string) {
    const reel = await this.prisma.reel.findUnique({
      where: { id: reelId },
      include: { listing: true },
    });
    if (!reel || reel.userId !== userId) throw new NotFoundException('Reel not found');
    if (reel.status === 'processing') {
      throw new BadRequestException('This reel is already being generated');
    }

    // Re-rendering costs the machine exactly what a new reel costs, so it is charged
    // against the same allowance.
    await this.claimRenderSlot(userId, reel.id);

    // A listing-backed reel re-reads the listing, so edits since the last render
    // are picked up. A standalone reel re-uses the details captured at creation.
    const source: ReelSource = reel.listing
      ? {
          title: reel.listing.title,
          price: reel.listing.price,
          status: reel.listing.status,
          listingType: reel.listing.listingType,
          amenities: reel.listing.amenities,
          photoUrls: reel.listing.photoUrls,
        }
      : {
          title: reel.title ?? 'Property',
          price: reel.price ?? 0,
          status: reel.propertyStatus ?? 'bare',
          listingType: reel.listingType ?? 'sale',
          amenities: reel.amenities,
          photoUrls: reel.photoUrls,
        };

    if (source.photoUrls.length === 0) {
      throw new BadRequestException('This reel has no photos to render from');
    }

    // Drop the old file now; a fresh one is written under a new name.
    if (reel.videoUrl) await this.storage.remove(reel.videoUrl);

    await this.prisma.reel.update({
      where: { id: reelId },
      data: { status: 'processing', videoUrl: null },
    });

    this.startRender(reelId, userId, source, reel.template);
    return { id: reelId, status: 'processing' };
  }

  async remove(userId: string, reelId: string) {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel || reel.userId !== userId) throw new NotFoundException('Reel not found');

    await this.prisma.reel.delete({ where: { id: reelId } });

    if (reel.videoUrl) await this.storage.remove(reel.videoUrl);
    // Only a standalone reel owns its photos; a listing's photos belong to the listing.
    if (!reel.listingId && reel.photoUrls.length > 0) {
      await Promise.all(reel.photoUrls.map((url) => this.storage.remove(url)));
    }

    return { deleted: true };
  }

  async findOneOwned(userId: string, reelId: string) {
    const reel = await this.prisma.reel.findUnique({
      where: { id: reelId },
      include: { listing: { select: { title: true } } },
    });
    if (!reel || reel.userId !== userId) throw new NotFoundException('Reel not found');
    return reel;
  }

  // Runs detached from any request, so anything thrown here becomes an unhandled
  // rejection and takes the whole server down. Everything must be swallowed.
  private async handleRenderFailure(
    reelId: string,
    userId: string,
    listingTitle: string,
    err: unknown,
  ) {
    console.error('Reel render failed', err);
    discardBrowser();
    try {
      // updateMany, not update: the listing (and its reels) may have been deleted
      // mid-render, and update() would throw P2025 on a missing row.
      const { count } = await this.prisma.reel.updateMany({
        where: { id: reelId },
        data: { status: 'failed' },
      });
      if (count === 0) return; // reel was deleted; nobody to notify

      // Clears the progress bar, so a failed render never leaves it stuck at 71%.
      this.notificationsService.push(userId, 'reel:failed', { reelId });

      await this.notificationsService.createForOwner(
        userId,
        'reel',
        'Reel generation failed',
        `Something went wrong generating a reel for "${listingTitle}".`,
        reelId,
      );
    } catch (cleanupErr) {
      console.error('Could not record reel failure', cleanupErr);
    }
  }

  /** Live-only: progress is meaningless after the render, so it is never persisted. */
  private emitProgress(userId: string, reelId: string, phase: ReelPhase, within = 0) {
    this.notificationsService.push(
      userId,
      'reel:progress',
      progressFor(reelId, phase, within),
    );
  }

  private async renderInBackground(
    reelId: string,
    userId: string,
    listing: ReelSource,
    templateId?: string | null,
    useAi = false,
  ) {
    this.emitProgress(userId, reelId, 'script');

    const { hook } = await this.aiService.generateReelScript({
      title: listing.title,
      price: listing.price,
      status: listing.status,
      listingType: listing.listingType,
      amenities: listing.amenities,
    });

    const template = resolveTemplate(templateId);
    const outputFileName = `${Date.now()}-${reelId}.mp4`;
    const outputLocation = path.join(process.cwd(), 'uploads', 'reels', outputFileName);

    // The opening shot, animated. Returns null on any failure — including an empty
    // Higgsfield balance — and the reel then renders from stills exactly as before.
    let heroClip: string | null = null;
    if (useAi && listing.photoUrls.length > 0) {
      this.emitProgress(userId, reelId, 'cinematic');
      const source = listing.photoUrls[0];
      const buffer = await this.storage.read(source);
      if (buffer) {
        heroClip = await this.higgsfield.generateHeroClip({
          buffer,
          name: path.basename(source),
        });
      }
    }

    if (REEL_RENDERER === 'json2video') {
      await this.renderViaJson2Video(listing, hook, outputLocation, template.id);
    } else {
      await this.renderViaRemotion(
        listing,
        hook,
        outputLocation,
        template,
        userId,
        reelId,
        heroClip,
      );
    }

    // Both renderers write to the local filesystem, so the finished file is moved into
    // storage here rather than at the point of render. On a container host that local
    // copy disappears with the next restart, which would leave a 'done' reel whose
    // video 404s.
    const videoUrl = await this.publishRender(outputLocation, outputFileName);

    const { count } = await this.prisma.reel.updateMany({
      where: { id: reelId },
      data: { status: 'done', videoUrl, hook },
    });
    if (count === 0) return; // reel was deleted mid-render

    // reel:done is the completion signal on its own. Emitting a 'done' progress event
    // after it re-added the entry the client had just cleared, which is what left the
    // indicator stuck reading "Ready… 100%" after the reel was already playable.
    this.notificationsService.push(userId, 'reel:done', {
      reelId,
      title: listing.title,
      videoUrl,
    });

    await this.notificationsService.createForOwner(
      userId,
      'reel',
      'Your reel is ready!',
      `The AI-generated reel for "${listing.title}" is ready to view.`,
      reelId,
    );

    // Everyone else who opted in hears that a new reel went live.
    void this.notificationsService
      .broadcast(
        userId,
        'notifyNewReels',
        'reel',
        'New reel published',
        `A new reel for "${listing.title}" was just created on Reelink.`,
        reelId,
      )
      .catch((err) => console.error('Could not broadcast new reel', err));
  }

  // Cloud render, which also narrates the reel. Only this path costs credits.
  private async renderViaJson2Video(
    listing: ReelSource,
    hook: string,
    outputLocation: string,
    templateId: string,
  ) {
    const template = resolveTemplate(templateId);
    const seconds = Math.max(listing.photoUrls.length, 1) * template.secondsPerPhoto;
    const { voiceover } = await this.aiService.generateVoiceover({
      title: listing.title,
      price: listing.price,
      status: listing.status,
      listingType: listing.listingType,
      amenities: listing.amenities,
      seconds,
    });

    await this.json2VideoService.render(
      listing,
      hook,
      voiceover,
      outputLocation,
      templateId,
    );
  }

  /**
   * Writes a narration track for the Remotion renderer and returns a URL it can load.
   * Returns null on any failure — a reel without narration is far better than no reel,
   * and Groq's TTS model needs a one-time terms acceptance before it will respond.
   */
  /** The template's backing track, or null when that file has not been added yet. */
  private resolveMusic(template: ReelTemplate): string | null {
    if (!template.music) return null;
    const file = path.join(process.cwd(), 'uploads', 'music', path.basename(template.music));
    if (!existsSync(file)) return null;
    return `${SELF_URL}/uploads/music/${path.basename(template.music)}`;
  }

  /**
   * The spoken track, and the words in it.
   *
   * The script is returned even when no audio could be produced. Captions are the more
   * valuable half on social video — most viewers watch muted — and they should not
   * depend on a text-to-speech provider being switched on. Today Groq TTS needs a
   * one-time terms acceptance, so `audioSrc` is usually null while `script` is not.
   */
  private async tryNarration(
    listing: ReelSource,
    seconds: number,
  ): Promise<{ audioSrc: string | null; script: string | null }> {
    let script: string | null = null;
    try {
      const { voiceover } = await this.aiService.generateVoiceover({
        title: listing.title,
        price: listing.price,
        status: listing.status,
        listingType: listing.listingType,
        amenities: listing.amenities,
        seconds,
      });
      script = voiceover;

      const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const dir = path.join(process.cwd(), 'uploads', 'narration');

      // Groq first: free and direct. It needs a one-time terms acceptance, so it
      // returns null until that happens.
      const groqAudio = await this.aiService.synthesizeSpeech(voiceover);
      if (groqAudio) {
        const filename = `${stamp}.wav`;
        await writeFile(path.join(dir, filename), groqAudio);
        return { audioSrc: `${SELF_URL}/uploads/narration/${filename}`, script };
      }

      // Fall back to the cloud renderer purely as a voice source, then keep only its
      // audio track. Costs credits per second of narration, but needs no setup.
      const clip = await this.json2VideoService.synthesizeNarration(voiceover);
      if (!clip) return { audioSrc: null, script };

      const tmpVideo = path.join(dir, `${stamp}.mp4`);
      const audioFile = `${stamp}.mp3`;
      await writeFile(tmpVideo, clip);
      await extractAudio(tmpVideo, path.join(dir, audioFile));
      await unlink(tmpVideo).catch(() => undefined);

      return { audioSrc: `${SELF_URL}/uploads/narration/${audioFile}`, script };
    } catch (err) {
      console.warn('Narration unavailable, rendering silent reel:', (err as Error).message);
      // The script may already be written even if speech failed — keep the captions.
      return { audioSrc: null, script };
    }
  }

  private async renderViaRemotion(
    listing: ReelSource,
    hook: string,
    outputLocation: string,
    template: ReelTemplate,
    userId: string,
    reelId: string,
    heroClip?: string | null,
  ) {
    const absolutePhotoUrls = listing.photoUrls.map(absolute);

    // Narration is optional here: Groq's TTS model needs one-time terms acceptance,
    // so until that happens the reel simply renders without a voice track.
    const seconds = totalSeconds(template, listing.photoUrls.length);
    this.emitProgress(userId, reelId, 'narration');
    const { audioSrc, script } = await this.tryNarration(listing, seconds);

    // Each template names a track; a file that has not been added yet is simply absent
    // and the reel renders as before. Checked on disk rather than assumed, so a missing
    // file never becomes a broken <Audio> that fails the whole render.
    const musicSrc = this.resolveMusic(template);

    // The closing card carries the owner's contact details.
    const agent = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, phone: true },
    });
    const logoSrc = `${SELF_URL}/brand/logo-light.png`;

    this.emitProgress(userId, reelId, 'prepare');
    const [bundleLocation, browser] = await Promise.all([getBundle(), getBrowser()]);

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: 'PropertyReel',
      port: REMOTION_PORT,
      puppeteerInstance: browser,
      inputProps: {
        photos: absolutePhotoUrls,
        audioSrc,
        musicSrc,
        // Captions carry the reel on muted playback, which is how most of social video
        // is watched — so they are sent whether or not a voice track exists.
        script,
        // Chrome fetches this back over HTTP during the render, same as the photos.
        heroClip: heroClip ? absolute(heroClip) : null,
        ...toRemotionProps(template, listing, hook, agent, logoSrc),
      },
    });

    this.emitProgress(userId, reelId, 'render');
    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation,
      port: REMOTION_PORT,
      inputProps: composition.props,
      puppeteerInstance: browser,
      // Skip the audio pipeline only when there is genuinely nothing to encode. Music
      // counts: with narration still switched off it is usually the only track, and
      // testing !audioSrc alone would have muted every reel that had one.
      muted: !audioSrc && !musicSrc,
      imageFormat: 'jpeg',
      jpegQuality: 80,
      x264Preset: 'veryfast',
      crf: REEL_CRF,
      concurrency: REEL_CONCURRENCY,
      scale: REEL_SCALE,
      // Remotion reports 0..1 across the frames it encodes — the only phase of
      // this pipeline that knows its own size.
      onProgress: ({ progress }) => this.emitProgress(userId, reelId, 'render', progress),
    });
  }

  findForListing(listingId: string) {
    return this.prisma.reel.findMany({
      where: { listingId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findMine(userId: string) {
    return this.prisma.reel.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { listing: { select: { id: true, title: true, price: true, listingType: true } } },
    });
  }

  /**
   * Everyone's finished reels, newest first — the public-facing feed.
   *
   * Only 'done' reels with a video appear: a stranger has no use for someone else's
   * failed render or a placeholder that is still processing. The creator's phone is
   * included so a buyer can act on what they just watched, and the route is behind
   * the JWT guard so those numbers are not readable by anonymous callers.
   */
  findFeed() {
    return this.prisma.reel.findMany({
      where: { status: 'done', videoUrl: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: FEED_PAGE_SIZE,
      include: {
        listing: { select: { id: true, title: true, price: true, listingType: true } },
        user: { select: { id: true, name: true, avatarUrl: true, phone: true } },
      },
    });
  }
}
