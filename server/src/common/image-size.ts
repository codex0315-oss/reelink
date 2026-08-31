import { readFile } from 'fs/promises';

export type ImageSize = { width: number; height: number };

/**
 * A real panorama is far wider than it is tall. 1.9 sits just under the 2:1 of a true
 * equirectangular image so a slightly cropped panorama still passes, while ordinary
 * photos (3:4 portrait, 3:2 landscape) never do.
 */
export const PANORAMA_MIN_RATIO = 1.9;

/**
 * Reads the pixel dimensions straight out of the file header.
 *
 * Only JPEG and PNG are parsed, which is what the upload filter allows apart from
 * WEBP; an unreadable file returns null and the caller decides what that means.
 * Doing this here avoids pulling in an image library for two numbers.
 */
export async function readImageSize(path: string): Promise<ImageSize | null> {
  try {
    return readImageSizeFromBuffer(await readFile(path));
  } catch {
    return null;
  }
}

/**
 * The same parse against bytes already in hand.
 *
 * Uploads are held in memory now rather than written to disk first, so the shape of a
 * file has to be checkable before anything is stored — a rejected panorama should never
 * reach the bucket at all.
 */
export function readImageSizeFromBuffer(buf: Buffer): ImageSize | null {
  // PNG: IHDR is always the first chunk, width/height at fixed offsets.
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // JPEG: walk the segments to the start-of-frame, which carries the dimensions.
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let p = 2;
    while (p + 9 < buf.length) {
      if (buf[p] !== 0xff) {
        p++;
        continue;
      }
      const marker = buf[p + 1];
      const isStartOfFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isStartOfFrame) {
        return { height: buf.readUInt16BE(p + 5), width: buf.readUInt16BE(p + 7) };
      }
      const length = buf.readUInt16BE(p + 2);
      if (length < 2) return null;
      p += 2 + length;
    }
  }

  return null;
}

/** True when the image is wide enough to be a genuine panorama. */
export function isPanoramaShaped(size: ImageSize | null) {
  if (!size || size.height === 0) return false;
  return size.width / size.height >= PANORAMA_MIN_RATIO;
}
