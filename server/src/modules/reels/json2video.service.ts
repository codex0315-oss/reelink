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
function text(value: string, y: number, size: number, color: string, weight: number) {
  return {
    type: 'text',
    text: value,
    position: 'custom' as const,
    x: 'center',
    y,
    width: CANVAS.width - 120,
    settings: {
      'font-family': 'Oswald',
      'font-size': `${size}px`,
      'font-weight': String(weight),
      color,
      'text-align': 'center',
    },
  };
}

type UploadTicket = { success: boolean; uploadUrl: string; fileUrl: string };

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
  ): Promise<void> {
    // The renderer runs on their infrastructure and cannot reach this machine, so
    // every photo has to be pushed somewhere publicly readable first.
    const publicPhotoUrls = await Promise.all(
      listing.photoUrls.map((url) => this.uploadPhoto(url)),
    );

    const template = resolveTemplate(templateId);
    const movie = this.buildMovie(listing, hook, voiceover, publicPhotoUrls, template);
    const project = await this.submit(movie);
    const videoUrl = await this.waitForRender(project);
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

  private async uploadPhoto(localUrl: string): Promise<string> {
    const filename = basename(localUrl);
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

    return {
      resolution: 'custom',
      width: CANVAS.width,
      height: CANVAS.height,
      quality: 'high',
      scenes: photoUrls.map((src) => ({
        duration: seconds,
        transition: { type: 'xfade', style: 'fade', duration: 0.5 },
        elements: [{ type: 'image', src, duration: seconds, zoom: 1 }],
      })),
      // Movie-level elements overlay every scene, so the branding stays put while
      // the photos change underneath.
      elements: [
        text(hook.toUpperCase(), 170, 62, '#F0A93B', 800),
        text(forLabel, 1330, 34, '#F0A93B', 700),
        text(price, 1400, 86, '#FFFFFF', 900),
        text(listing.title, 1520, 44, '#FFFFFF', 600),
        {
          type: 'voice',
          text: voiceover,
          voice: VOICE,
          model: 'azure',
        },
      ],
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

  private async waitForRender(project: string): Promise<string> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

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

      if (movie.status === 'done' && movie.url) return movie.url;
      if (movie.status === 'error') {
        throw new Error(`JSON2Video render failed: ${movie.message ?? 'unknown error'}`);
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
