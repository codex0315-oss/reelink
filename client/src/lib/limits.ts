/**
 * Mirrors the server's `src/common/field-limits.ts`.
 *
 * These are a courtesy, not a control — the browser stops the user at the same number
 * the API would have rejected them at, so they find out while typing instead of after
 * submitting. Every one of these is enforced again server-side; changing a value here
 * without changing it there just moves where the error appears.
 */
export const LIMITS = {
  name: 80,
  email: 254,
  /** bcrypt ignores anything past 72 bytes, so allowing more would be a lie. */
  password: 72,
  phone: 20,
  listingTitle: 120,
  listingDescription: 2000,
  amenity: 60,
  amenityCount: 30,
  messageBody: 2000,
} as const
