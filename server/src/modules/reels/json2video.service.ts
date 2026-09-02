import { Injectable, BadRequestException } from '@nestjs/common';
import { readFile, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { randomUUID } from 'crypto';
import { ReelSource } from './reel-source.type';
import { CANVAS, ReelTemplate, resolveTemplate } from './reel-templates';

const API = 'https://api.json2video.com/v2';
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

// Azure voices are included in the plan; ElevenLabs would bill separately.
const VOICE = process.env.JSON2VIDEO_VOICE ?? 'en-US-EmmaMultilingualNeural';

/**
 * Templates live in the Remotion renderer. This cloud path keeps one plain layout as
 * a fallback, so it stays useful without duplicating the template system.
 */
const TEXT_WIDTH = CANVAS.width - 120;
/** Centred horizontally by arithmetic, since x has to be a number — see below. */
const TEXT_X = (CANVAS.width - TEXT_WIDTH) / 2;

/**
 * One overlay line, absolutely positioned.
 *
 * Two things here are load-bearing, both found by rendering frames and looking at them.
 *
 * `x` must be a number. It used to be the string 'center', which their renderer does
 * not treat as a position at all — it abandoned absolute placement and laid the
 * elements out in flow instead, stacking the text *below* the photo on black rather
 * than over it. That is what made finished reels look broken.
 *
 * `height` must be given. Without it the box spans the rest of the canvas and the text
 * centres itself inside that, so every line landed in the middle of the frame no matter
 * what `y` said — and lines drawn after the first were pushed out of view entirely.
 */
function text(
  value: string,
  y: number,
  height: number,
  size: number,
  color: string,
  weight: number,
  font = 'Oswald',
) {
  return {
    type: 'text',
    text: value,
    position: 'custom' as const,
    x: TEXT_X,
    y,
    width: TEXT_WIDTH,
    height,
    settings: {
      'font-family': font,
      'font-size': `${size}px`,
      'font-weight': String(weight),
      color,
      'text-align': 'center',
    },
  };
}

/**
 * The price line's font, which is not the display font the rest of the reel uses.
 *
 * Oswald has no ₱ glyph, and the renderer drops it silently rather than substituting
 * one — so prices went out reading "12,000" with no currency at all, which for a
 * Philippine listing is worse than wrong. Compared rendered frames across four faces:
 * Roboto and Noto Sans both draw it, Lato shows a tofu box, Oswald shows nothing.
 * Only this one line changes face, so the reel keeps Oswald's condensed look.
 */
const PRICE_FONT = 'Roboto';

type UploadTicket = { success: boolean; uploadUrl: string; fileUrl: string };

/** Reports how far along the cloud render is: a 0..1 fraction and their own wording. */
export type RenderProgress = (fraction: number, stage?: string) => void;

/**
 * How long a render is assumed to take when estimating the bar.
 *
 * Their API reports a stage but never a percentage, so there is nothing to read a real
 * figure from. Measured renders of a three-photo reel finish in well under a minute;
 * this is deliberately longer than that, because a bar that creeps and then waits at
 * 90 reads better than one that sits pinned at 100 while the work continues.
 */
const NOMINAL_RENDER_MS = 60_000;

/**
 * Elapsed time as a fraction, nudged by whatever stage they report.
 *
 * Capped below 1: this phase only ends when the file actually arrives, and the caller
 * still has to fetch it and move it into storage afterwards. Concatenating is the last
 * thing they do, so seeing it means the end is close regardless of the clock.
 */
function fractionDone(elapsedMs: number, stage?: string): number {
  const byClock = Math.min(elapsedMs / NOMINAL_RENDER_MS, 0.9);
  return /concatenat/i.test(stage ?? '') ? Math.max(byClock, 0.93) : byClock;
}

@Injectable()
export class Json2VideoService {
  private get apiKey() {
    const key = process.env.JSON2VIDEO_API_KEY;
    if (!key) throw new BadRequestException('JSON2VIDEO_API_KEY is not configured');
    return key;
  }

  /**
   * Renders in the cloud and writes the finished MP4 to outputLocation, so callers
   * get the same result shape as the local Remotion renderer.
   */
  async render(
    listing: ReelSource,
    hook: string,
    voiceover: string,
    outputLocation: string,
    templateId?: string | null,
    onProgress?: RenderProgress,
  ): Promise<void> {
    // The renderer runs on their infrastructure and cannot reach this machine, so
    // every photo has to be pushed somewhere publicly readable first.
    const publicPhotoUrls = await Promise.all(
      listing.photoUrls.map((url) => this.uploadPhoto(url)),
    );

    const template = resolveTemplate(templateId);
    const movie = this.buildMovie(listing, hook, voiceover, publicPhotoUrls, template);
    const project = await this.submit(movie);
    const videoUrl = await this.waitForRender(project, onProgress);

    // The file still has to come back over the wire, and for a 1080x1920 reel that is
    // not instant. Reported rather than left as a silent gap at the end of the bar.
    onProgress?.(0.97, 'Downloading your reel');
    await this.downloadTo(videoUrl, outputLocation);
  }

  /**
   * Renders narration only, for the local Remotion renderer to lay over its video.
   *
   * Groq's TTS models sit behind a one-time terms acceptance, so this is the path
   * that works without any account changes. The frame is deliberately tiny (64x64,
   * low quality) because only the audio track is kept — credits bill per second of
   * video, so the narration length is all that costs anything.
   *
   * Returns the rendered MP4 bytes; the caller extracts the audio.
   */
  async synthesizeNarration(text: string): Promise<Buffer | null> {
    if (!text.trim()) return null;

    try {
      const movie = {
        resolution: 'custom',
        width: 64,
        height: 64,
        quality: 'low',
        scenes: [
          {
            duration: -1, // stretches to fit the voice element
            'background-color': '#000000',
            elements: [{ type: 'voice', text, voice: VOICE, model: 'azure' }],
          },
        ],
      };

      const project = await this.submit(movie);
      const url = await this.waitForRender(project);
      const res = await fetch(url);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      console.warn('Cloud narration unavailable:', (err as Error).message);
      return null;
    }
  }

  private async uploadPhoto(photoUrl: string): Promise<string> {
    // A photo in object storage is already on a public URL their renderer can fetch,
    // so there is nothing to copy — and, more to the point, nothing on this filesystem
    // to copy from. Uploading it again would just be a round-trip to reproduce a URL
    // that already exists.
    if (/^https?:/.test(photoUrl)) return photoUrl;

    const filename = basename(photoUrl);
    const buffer = await readFile(join(process.cwd(), 'uploads', 'listings', filename));
    const contentType = this.contentTypeFor(filename);

    // Their drive rejects a name that already exists, so re-rendering a listing would
    // otherwise fail on every attempt after the first. A unique prefix per upload
    // keeps each render independent.
    const remoteName = `${randomUUID()}-${filename}`;

    // Two steps: ask for a presigned slot, then PUT the bytes into it.
    const ticketRes = await fetch(`${API}/media/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey },
      body: JSON.stringify({
        name: remoteName,
        contentType,
        size: buffer.length,
        folder: 'temp', // auto-expires, so their drive doesn't fill up with our uploads
      }),
    });

    if (!ticketRes.ok) {
      throw new Error(
        `Requesting an upload slot for ${filename} failed (${ticketRes.status}): ${await ticketRes.text()}`,
      );
    }
    const ticket = (await ticketRes.json()) as UploadTicket & { message?: string };
    if (!ticket.success) {
      throw new Error(
        `JSON2Video refused the upload of ${filename}: ${ticket.message ?? 'no reason given'}`,
      );
    }

    const put = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: new Uint8Array(buffer),
    });
    // Without the body the reason (expired signature, size mismatch, duplicate name)
    // is invisible, which is exactly what made this hard to diagnose.
    if (!put.ok) {
      throw new Error(
        `Uploading ${filename} failed (${put.status}): ${(await put.text()).slice(0, 300)}`,
      );
    }

    return ticket.fileUrl;
  }

  private contentTypeFor(filename: string) {
    const ext = filename.toLowerCase().split('.').pop();
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    return 'image/jpeg';
  }

  private buildMovie(
    listing: ReelSource,
    hook: string,
    voiceover: string,
    photoUrls: string[],
    template: ReelTemplate,
  ) {
    const seconds = template.secondsPerPhoto;

    const price = `₱${Number(listing.price).toLocaleString()}`;
    const forLabel = listing.listingType === 'rent' ? 'FOR RENT' : 'FOR SALE';

    /**
     * Repeated into every scene rather than declared once at movie level.
     *
     * Movie-level text is the obvious way to keep branding fixed while the photos
     * change under it, and it works — but only for a single-scene movie. Add a second
     * scene and the render fails with "Error rendering video", naming nothing. Isolated
     * by bisection against their API: three scenes alone render, three scenes plus a
     * movie-level voice render, one scene plus all four texts renders, and three scenes
     * plus any one movie-level text fails. Moving the same elements inside each scene
     * renders correctly and looks identical, since every scene carries the same overlay.
     *
     * Voice stays at movie level: it has to span the whole reel, and it is unaffected.
     */
    const overlay = [
      text(hook.toUpperCase(), 150, 180, 62, '#F0A93B', 800),
      text(forLabel, 1310, 60, 34, '#F0A93B', 700),
      text(price, 1380, 120, 86, '#FFFFFF', 900, PRICE_FONT),
      text(listing.title, 1510, 80, 44, '#FFFFFF', 600),
    ];

    return {
      resolution: 'custom',
      width: CANVAS.width,
      height: CANVAS.height,
      quality: 'high',
      scenes: photoUrls.map((src) => ({
        duration: seconds,
        transition: { type: 'xfade', style: 'fade', duration: 0.5 },
        elements: [
          {
            type: 'image',
            src,
            duration: seconds,
            // A phone photo is landscape; the reel is 1080x1920. Left to itself the
            // renderer keeps the photo's own shape and pins it to the top, leaving the
            // bottom two thirds black — which is what agents were seeing. 'cover' fills
            // the frame and crops the overflow, and the explicit box is what gives it a
            // frame to fill.
            resize: 'cover',
            position: 'custom' as const,
            x: 0,
            y: 0,
            width: CANVAS.width,
            height: CANVAS.height,
          },
          ...overlay,
        ],
      })),
      // Only when there is something to say. The script comes from a model that can
      // return nothing — it fails soft elsewhere so the reel still renders silently —
      // and a voice element with empty text is rejected at render time, which turns
      // a missing voiceover into a failed reel instead of a quiet one.
      elements: voiceover.trim()
        ? [{ type: 'voice', text: voiceover, voice: VOICE, model: 'azure' }]
        : [],
    };
  }

  private async submit(movie: unknown): Promise<string> {
    const res = await fetch(`${API}/movies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey },
      body: JSON.stringify(movie),
    });
    const json = (await res.json()) as { success: boolean; project?: string; message?: string };
    if (!res.ok || !json.success || !json.project) {
      throw new Error(`JSON2Video render request failed: ${json.message ?? res.status}`);
    }
    return json.project;
  }

  private async waitForRender(
    project: string,
    onProgress?: RenderProgress,
  ): Promise<string> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    const startedAt = Date.now();

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const res = await fetch(`${API}/movies?project=${project}`, {
        headers: { 'x-api-key': this.apiKey },
      });
      const json = (await res.json()) as {
        movie?: { status: string; url?: string; message?: string };
      };
      const movie = json.movie;
      if (!movie) continue;

      if (movie.status === 'running' || movie.status === 'pending') {
        onProgress?.(fractionDone(Date.now() - startedAt, movie.message), movie.message);
      }

      if (movie.status === 'done' && movie.url) return movie.url;
      if (movie.status === 'error') {
        // Their `message` is a catch-all — "Error rendering video" says nothing about
        // which element was rejected. The rest of the payload carries the detail, so
        // it goes in the error rather than being dropped on the floor.
        throw new Error(
          `JSON2Video render failed: ${movie.message ?? 'unknown error'} | response: ` +
            JSON.stringify(json).slice(0, 1000),
        );
      }
    }

    throw new Error('JSON2Video render timed out');
  }

  private async downloadTo(videoUrl: string, outputLocation: string) {
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`Could not download rendered video (${res.status})`);
    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(outputLocation, buffer);
  }
}
