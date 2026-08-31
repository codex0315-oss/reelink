/**
 * Multipart form fields arrive as strings, so array fields are sent JSON-encoded.
 * A bare JSON.parse in a @Transform throws on malformed input, and because that
 * happens before validation runs it surfaces as a 500 instead of a 400. Returning
 * the value unchanged lets @IsArray reject it with a proper validation error.
 */
export function parseJsonArray(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
