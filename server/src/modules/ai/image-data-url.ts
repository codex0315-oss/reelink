import { StorageService } from '../storage/storage.service';
import { extname } from 'path';

/**
 * An uploaded image as a data URL, for the vision model.
 *
 * Groq needs the bytes inline or on a URL it can fetch. Inlining them is the honest
 * choice here: it works whether the file is on this machine or in a bucket, and it does
 * not depend on the model's servers being able to reach ours.
 *
 * Goes through StorageService rather than reading the uploads folder directly. That
 * assumption held only while files were written to disk — after they moved to object
 * storage every one of these reads began failing with ENOENT, and because both callers
 * are designed to fail soft, nothing said so. Panorama labels quietly stopped appearing
 * and Amicus quietly stopped being able to see attached photos.
 */
export async function imageDataUrl(
  storage: StorageService,
  url: string,
): Promise<string | null> {
  const buffer = await storage.read(url);
  if (!buffer) return null;

  const ext = extname(url).toLowerCase();
  const mime =
    ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}
