/**
 * The origins allowed to call this API, over HTTP and over WebSocket alike.
 *
 * Comma-separated in CORS_ORIGINS so staging or a deployed frontend can be added
 * without a code change. Shared by main.ts and both gateways, so the socket and the
 * REST API can never drift apart — which they had, with the origin hardcoded in
 * three separate places.
 */
export function allowedOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
