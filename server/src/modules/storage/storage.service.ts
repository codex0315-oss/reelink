import { Injectable, Logger } from '@nestjs/common';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, unlink, writeFile } from 'fs/promises';
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
 * as soon as R2 credentials are present, which is what production needs: a container
 * filesystem is wiped on every restart, so a file written there survives only until the
 * instance sleeps. Verified in production before this existed — a listing photo returned
 * 404 while its database row still pointed at it, and profile pictures vanished on the
 * next login.
 *
 * Both return a URL that goes straight into the database. Local returns a relative
 * `/uploads/...` path served by the API; R2 returns an absolute URL served by Cloudflare.
 * The client's assetUrl() already passes absolute URLs through untouched, so nothing on
 * the front end has to know which backend produced a given file.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;

  /** True when R2 is configured; false means local disk. */
  get isRemote() {
    return !!(
      process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET
    );
  }

  private get bucket() {
    return process.env.R2_BUCKET as string;
  }

  /**
   * The base the browser fetches from. R2 buckets are private by default; this is
   * either the bucket's public r2.dev address or a custom domain in front of it.
   */
  private get publicBase() {
    return (process.env.R2_PUBLIC_URL ?? '').replace(/\/+$/, '');
  }

  private s3() {
    // R2 speaks the S3 API at an account-specific endpoint. 'auto' is the only region
    // it accepts — it has no regional endpoints in the AWS sense.
    this.client ??= new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
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

      const key = url.startsWith(this.publicBase)
        ? url.slice(this.publicBase.length + 1)
        : new URL(url).pathname.replace(/^\/+/, '');

      await this.s3().send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch {
      // Already gone, never written, or a transient failure. An orphaned object costs
      // a fraction of a cent; a failed delete request costs the user their action.
    }
  }

  /** Logged once at boot so it is obvious which backend a deployment is using. */
  describe() {
    return this.isRemote
      ? `Cloudflare R2 (${this.bucket})`
      : 'local disk (uploads/) — files are lost on restart in a container';
  }
}
