import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { extname, basename, join } from 'path';
import { randomUUID } from 'crypto';

/** The folders uploads are grouped into, mirrored in both backends. */
export type UploadFolder =
  | 'listings'
  | 'panoramas'
  | 'avatars'
  | 'reels'
  | 'narration'
  | 'clips'
  | 'chat';

/**
 * Where uploaded files live.
 *
 * Two backends behind one interface. Local disk is the default and is what runs on a
 * developer machine — no account, no credentials, no network. Object storage takes over
 * as soon as S3 credentials are present, which is what production needs: a container
 * filesystem is wiped on every restart, so a file written there survives only until the
 * instance sleeps. Verified in production before this existed — a listing photo returned
 * 404 while its database row still pointed at it, and profile pictures vanished on the
 * next login.
 *
 * Both return a URL that goes straight into the database. Local returns a relative
 * `/uploads/...` path served by the API; object storage returns an absolute URL served by
 * the provider. The client's assetUrl() already passes absolute URLs through untouched,
 * so nothing on the front end has to know which backend produced a given file.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;

  /** True when object storage is configured; false means local disk. */
  get isRemote() {
    return !!(
      process.env.S3_ENDPOINT &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY &&
      process.env.S3_BUCKET
    );
  }

  private get bucket() {
    return process.env.S3_BUCKET;
  }

  /**
   * The base the browser fetches from. This is the bucket's public URL, which differs
   * by provider: Supabase serves /storage/v1/object/public/<bucket>, R2 a pub-*.r2.dev
   * host. Supplied whole rather than assembled here.
   */
  private get publicBase() {
    return (process.env.S3_PUBLIC_URL ?? '').replace(/\/+$/, '');
  }

  private s3() {
    this.client ??= new S3Client({
      // Supabase issues a real region with its S3 keys (eg. ap-southeast-1) and rejects
      // a mismatch, because the region is part of what the request signature covers.
      // Cloudflare R2 has no regions and wants the literal 'auto', which is the default
      // here so R2 works with the region left unset.
      region: process.env.S3_REGION || 'auto',
      // A full URL, not an account id. Supabase and R2 have different endpoint shapes,
      // and asking for the whole thing keeps this file from having to know which
      // provider it is talking to.
      endpoint: process.env.S3_ENDPOINT,
      // Supabase requires path-style addressing: the bucket goes in the path rather
      // than becoming a subdomain. Virtual-host style resolves to nothing there.
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
    });
    return this.client;
  }

  /**
   * Stores one file and returns the URL to record against it.
   *
   * The name is generated here rather than taken from the upload: a filename arriving
   * from a browser is attacker-controlled, and one containing `../` would otherwise
   * decide where the file lands.
   */
  async save(
    folder: UploadFolder,
    file: { originalname: string; buffer: Buffer; mimetype?: string },
  ): Promise<string> {
    const key = `${folder}/${Date.now()}-${randomUUID()}${extname(file.originalname).toLowerCase()}`;

    if (!this.isRemote) {
      const dir = join(process.cwd(), 'uploads', folder);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, basename(key)), file.buffer);
      return `/uploads/${key}`;
    }

    await this.s3().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype || 'application/octet-stream',
        // Immutable: every key carries a uuid, so a given URL can never point at
        // different bytes and is safe to cache indefinitely.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    return `${this.publicBase}/${key}`;
  }

  /**
   * Stores a whole field's worth of uploads and returns their URLs in order.
   *
   * Sequential rather than parallel: a listing can carry sixteen files, and firing all
   * of them at once on a small instance competes for the same memory the request is
   * already holding the buffers in.
   */
  async saveAll(
    folder: UploadFolder,
    files?: Express.Multer.File[],
  ): Promise<string[]> {
    const urls: string[] = [];
    for (const file of files ?? []) {
      urls.push(await this.save(folder, file));
    }
    return urls;
  }

  /** Stores bytes the server produced itself — a rendered reel, narration audio. */
  async saveBuffer(
    folder: UploadFolder,
    filename: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    return this.save(folder, {
      originalname: filename,
      buffer,
      mimetype: contentType,
    });
  }

  /**
   * Reads a stored file back.
   *
   * Needed because some work happens on the bytes rather than the URL — the cinematic
   * clip has to re-upload the source photo to Higgsfield, and it can no longer assume
   * that photo is sitting on the local filesystem. Remote objects are fetched over
   * HTTP rather than through the S3 client: the bucket is public, so a plain GET is
   * both simpler and one less signed request. Returns null rather than throwing, since
   * every caller has a path that works without the bytes.
   */
  async read(url: string): Promise<Buffer | null> {
    if (!url) return null;

    try {
      if (!url.startsWith('http')) {
        const parts = url.split('/').filter(Boolean);
        const folder = parts[parts.length - 2] ?? '';
        return await readFile(
          join(process.cwd(), 'uploads', basename(folder), basename(url)),
        );
      }

      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      this.logger.warn(`could not read ${url}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Removes a stored file. Never throws: cleanup runs after the database row is already
   * gone, and failing here would turn a tidy-up into a failed request.
   */
  async remove(url: string): Promise<void> {
    if (!url) return;

    try {
      if (!this.isRemote || !url.startsWith('http')) {
        // basename() keeps a crafted path from reaching outside the uploads tree.
        const parts = url.split('/').filter(Boolean);
        const folder = parts[parts.length - 2] ?? '';
        await unlink(
          join(process.cwd(), 'uploads', basename(folder), basename(url)),
        );
        return;
      }

      // Keys are always exactly `folder/filename`. Taking the last two path segments
      // works even when the URL does not sit under the configured public base — a
      // provider change, or a row written before this setting was what it is now.
      // The whole pathname would be wrong there: Supabase prefixes its public URLs
      // with /storage/v1/object/public/<bucket>/, which is not part of the key.
      const key = url.startsWith(this.publicBase)
        ? url.slice(this.publicBase.length + 1)
        : new URL(url).pathname.split('/').filter(Boolean).slice(-2).join('/');

      await this.s3().send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      // Already gone, never written, or a transient failure. An orphaned object costs
      // a fraction of a cent; a failed delete request costs the user their action.
      this.logger.debug(`could not remove ${url}: ${(err as Error).message}`);
    }
  }

  /** Logged once at boot so it is obvious which backend a deployment is using. */
  describe() {
    return this.isRemote
      ? `object storage (${this.bucket})`
      : 'local disk (uploads/) — files are lost on restart in a container';
  }
}
