/**
 * Where the API lives.
 *
 * One definition for the whole app. This used to be the literal
 * 'http://localhost:3000' written out in sixteen files, which meant the build could
 * only ever run on the machine it was written on — every avatar, listing photo and
 * reel video pointed at the developer's laptop.
 *
 * Set VITE_API_URL at build time to point a deployment somewhere else. Vite inlines
 * it, so it must be present when the bundle is built, not when it runs.
 */
export const API_URL = (
  import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
).replace(/\/+$/, '');

/**
 * Turns a stored path like `/uploads/listings/abc.jpg` into a URL the browser can
 * load. Anything already absolute — an http(s) URL, or a blob: preview of a file the
 * user just picked — is passed straight through.
 */
export function assetUrl(path?: string | null): string {
  if (!path) return '';
  if (/^(https?:|blob:|data:)/.test(path)) return path;
  return `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}
