/**
 * Field length caps, shared by the DTOs and mirrored by the client's maxLength
 * attributes.
 *
 * Nothing enforced a maximum before this: `@IsString()` accepts a megabyte of text as
 * happily as a word, so a title, description or amenity could be arbitrarily long and
 * go straight into Postgres and onto every card that renders it.
 *
 * The client stops at the same numbers, but only the server's copy is a control — the
 * browser's is a courtesy so the user finds out before they hit submit.
 */
export const LIMITS = {
  name: 80,
  email: 254, // the practical maximum for an address, per RFC 5321
  /**
   * bcrypt only hashes the first 72 bytes and silently ignores the rest, so anything
   * longer would give the user a false sense of a stronger password.
   */
  password: 72,
  phone: 20,
  listingTitle: 120,
  listingDescription: 2000,
  amenity: 60,
  amenityCount: 30,
  messageBody: 2000,
} as const;
