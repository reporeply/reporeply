/**
 * Parse natural-language reminder text.
 *
 * Returns:
 * - { remindAt: Date } on success
 * - null on failure
 */
import * as chrono from "chrono-node";

export function parseReminder(text) {
  if (!text || typeof text !== "string") return null;

  const normalized = text.toLowerCase();

  /* -------------------- Intent Detection -------------------- */

  // Flexible intent keywords (order does not matter)
  const intentRegex = /\b(remind|reminder|notify|notification|ping|alert)\b/;

  if (!intentRegex.test(normalized)) {
    return null;
  }

  /* -------------------- Time Extraction -------------------- */

  const now = new Date();
  const date = chrono.parseDate(normalized, now, {
    forwardDate: true, // always future dates
  });

  if (!date) {
    return null;
  }

  /* -------------------- Validation -------------------- */

  // Must be a valid future date
  if (isNaN(date.getTime())) {
    return null;
  }

  // Ensure the date is actually in the future (at least 1 second from now)
  if (date.getTime() <= Date.now()) {
    return null;
  }

  return {
    remindAt: date,
  };
}
