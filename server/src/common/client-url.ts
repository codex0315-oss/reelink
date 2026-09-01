import { allowedOrigins } from './cors-origins';

/**
 * Where the browser-facing app lives, for links inside emails.
 *
 * This is not the same as SELF_URL. That one points at this API, because Chrome fetches
 * photos back over HTTP while rendering a reel. This one points at the React app the
 * recipient of an email is meant to land on.
 *
 * The fallback chain matters more than it looks. A password reset email went out to a
 * real user reading `http://localhost:5173/reset-password?...` because APP_URL was
 * simply never set on the host — the code fell back to the development default and
 * nothing anywhere complained. So the last resort is now the first allowed CORS origin
 * rather than localhost: CORS_ORIGINS has to name the deployed frontend for the app to
 * function at all, which means that value is always correct in production, whereas a
 * variable used only by two email templates can sit wrong indefinitely without anyone
 * noticing.
 *
 * APP_URL still wins when set, for the case where the app is reachable at a nicer
 * address than the one the browser happens to call the API from.
 */
export function clientUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const [first] = allowedOrigins();
  return (first ?? 'http://localhost:5173').replace(/\/+$/, '');
}
