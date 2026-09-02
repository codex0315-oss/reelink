/**
 * Turns a caught error into something worth showing a user.
 *
 * `fetch` rejects with a TypeError when the request never reached the server, and its
 * message is "Failed to fetch" — accurate, and meaningless to whoever is holding the
 * phone. That case becomes a sentence about the connection, which is also the most
 * common one here: the API sleeps on its free tier and a request made while it wakes
 * can simply not arrive.
 *
 * Everything else was thrown by the API layer, which already carries the server's own
 * wording. That is worth showing verbatim — it names the actual refusal, like a listing
 * that was deleted since the page was loaded, rather than a generic apology.
 */
export function describeError(err: unknown, fallback: string): string {
  if (err instanceof TypeError) {
    return 'Could not reach the server. Check your connection and try again.'
  }
  if (err instanceof Error && err.message.trim()) return err.message
  return fallback
}
