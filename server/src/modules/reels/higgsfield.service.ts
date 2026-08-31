import { Injectable, Logger } from '@nestjs/common';
import { createWriteStream } from 'fs';
import { mkdir, readFile, unlink } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import * as path from 'path';
import { randomUUID } from 'crypto';

const API_BASE = 'https://api.higgsfield.ai';

/**
 * DoP Turbo: 6.5 credits (~$0.41) a clip, against 2 for Lite and 9 for Standard.
 * Overridable so the tier can be compared on real listings without a redeploy.
 */
const MODEL = process.env.HIGGSFIELD_MODEL ?? 'higgsfield-ai/dop/turbo';

/** Generation is queued, not immediate; these bound how long we are willing to wait. */
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * The camera move. Deliberately conservative: a real estate hero shot wants a slow
 * push that makes the room feel walked-into, not a model reinventing the geometry of
 * someone's actual house. Asking for subtlety is also what keeps the still recognisable
 * as the property the buyer will turn up to see.
 */
const HERO_PROMPT =
  'Slow cinematic push-in with gentle parallax, steady tripod feel, natural daylight, ' +
  'photorealistic real estate showcase. Keep the architecture and layout unchanged.';

type UploadTicket = {
  upload_url: string;
  public_url: string;
  headers?: Record<string, string>;
};

type SubmitResponse = { request_id?: string; status_url?: string; detail?: string };

type StatusResponse = {
  status: string;
  video?: { url?: string };
  videos?: { url?: string }[];
  detail?: string;
};

/**
 * Turns one listing photo into a short animated clip.
 *
 * Every path through this service returns null rather than throwing. A reel that
 * renders without its cinematic opener is a slightly plainer reel; a reel that fails
 * because a paid third-party API was out of credits is a broken feature. The caller
 * treats null as "carry on with stills", which is also what happens when the account
 * has no balance — the state this was written in.
 */
@Injectable()
export class HiggsfieldService {
  private readonly logger = new Logger(HiggsfieldService.name);

  private get keyId() {
    return process.env.HIGGSFIELD_KEY_ID?.trim();
  }

  private get keySecret() {
    return process.env.HIGGSFIELD_KEY_SECRET?.trim();
  }

  get isConfigured() {
    return !!(this.keyId && this.keySecret);
  }

  private get authHeader() {
    return `Key ${this.keyId}:${this.keySecret}`;
  }

  /**
   * @param photo the source image's bytes and its original name, which is only used to
   *   pick a content type. Bytes rather than a path: with uploads in object storage the
   *   photo is not on this machine's filesystem at all.
   * @returns a `/uploads/clips/...` path, or null if generation was not possible
   */
  async generateHeroClip(photo: {
    buffer: Buffer;
    name: string;
  }): Promise<string | null> {
    if (!this.isConfigured) {
      this.logger.log('Higgsfield keys not set — rendering with stills only.');
      return null;
    }

    try {
      const imageUrl = await this.uploadImage(photo);
      if (!imageUrl) return null;

      const statusUrl = await this.submit(imageUrl);
      if (!statusUrl) return null;

      const videoUrl = await this.poll(statusUrl);
      if (!videoUrl) return null;

      return await this.download(videoUrl);
    } catch (err) {
      this.logger.warn(
        `Cinematic clip failed, falling back to stills: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  /**
   * Higgsfield fetches the input over the public internet, so a listing photo served
   * from localhost is unreachable to it. The presigned upload puts the bytes in their
   * storage instead, which is what makes this work in development at all.
   */
  private async uploadImage(photo: {
    buffer: Buffer;
    name: string;
  }): Promise<string | null> {
    const contentType = contentTypeFor(photo.name);

    const ticketRes = await fetch(`${API_BASE}/files/generate-upload-url`, {
      method: 'POST',
      headers: { Authorization: this.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_type: contentType }),
    });

    if (!ticketRes.ok) {
      this.logger.warn(`Upload URL request failed: HTTP ${ticketRes.status}`);
      return null;
    }

    const ticket = (await ticketRes.json()) as UploadTicket;

    // Credentials must not travel to the storage host — it is a different origin and
    // the presigned URL is already the authorisation.
    const putRes = await fetch(ticket.upload_url, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'x-amz-tagging': 'retention=temporary',
        ...(ticket.headers ?? {}),
      },
      body: new Uint8Array(photo.buffer),
    });

    if (!putRes.ok) {
      this.logger.warn(`Photo upload failed: HTTP ${putRes.status}`);
      return null;
    }

    return ticket.public_url;
  }

  private async submit(imageUrl: string): Promise<string | null> {
    const res = await fetch(`${API_BASE}/${MODEL}`, {
      method: 'POST',
      headers: { Authorization: this.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: HERO_PROMPT, image_url: imageUrl }),
    });

    const data = (await res.json().catch(() => ({}))) as SubmitResponse;

    if (!res.ok) {
      // The one failure worth naming: it is a billing state, not a bug, and it is what
      // this account returns today.
      if (data.detail === 'not_enough_credits') {
        this.logger.warn('Higgsfield account is out of credits — rendering with stills.');
      } else {
        this.logger.warn(`Generation rejected: HTTP ${res.status} ${data.detail ?? ''}`);
      }
      return null;
    }

    return data.status_url ?? `${API_BASE}/requests/${data.request_id}/status`;
  }

  /** Terminal states per the docs: completed, failed, nsfw, canceled. */
  private async poll(statusUrl: string): Promise<string | null> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      const res = await fetch(statusUrl, { headers: { Authorization: this.authHeader } });
      if (!res.ok) continue; // a transient 5xx should not abandon a paid generation

      const data = (await res.json()) as StatusResponse;

      if (data.status === 'completed') {
        return data.video?.url ?? data.videos?.[0]?.url ?? null;
      }
      if (['failed', 'nsfw', 'canceled'].includes(data.status)) {
        this.logger.warn(`Generation ended as "${data.status}".`);
        return null;
      }
    }

    this.logger.warn('Generation timed out; rendering with stills.');
    return null;
  }

  /**
   * Their CDN drops output after about seven days, so the clip is copied into the same
   * uploads tree as everything else. A reel is a durable artifact — it cannot depend on
   * a URL that expires while the listing is still live.
   */
  private async download(videoUrl: string): Promise<string | null> {
    const res = await fetch(videoUrl);
    if (!res.ok || !res.body) {
      this.logger.warn(`Clip download failed: HTTP ${res.status}`);
      return null;
    }

    const dir = path.join(process.cwd(), 'uploads', 'clips');
    await mkdir(dir, { recursive: true });

    const filename = `${randomUUID()}.mp4`;
    const target = path.join(dir, filename);

    try {
      await pipeline(Readable.fromWeb(res.body as never), createWriteStream(target));
    } catch (err) {
      await unlink(target).catch(() => undefined); // no half-written clips left behind
      throw err;
    }

    return `/uploads/clips/${filename}`;
  }
}

function contentTypeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
