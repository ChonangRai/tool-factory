/**
 * Client-side policy for passwords the user is *creating* (signup, reset).
 *
 * Supabase enforces the real minimum (8) plus leaked-password protection
 * server-side; this is a deliberately stricter front door, not the boundary.
 * It is not applied to the sign-in field: existing accounts predate this rule
 * and must still be able to log in and then reset.
 *
 * No symbol/case rules, because production does not enforce any -- inventing
 * them here would only produce rejections the server would have accepted.
 */
export const NEW_PASSWORD_MIN_LENGTH = 12;

export const NEW_PASSWORD_HINT = `Use at least ${NEW_PASSWORD_MIN_LENGTH} characters.`;

/** Returns an error message for a new password, or null when it is acceptable. */
export function validateNewPassword(password: string): string | null {
  if (password.length < NEW_PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${NEW_PASSWORD_MIN_LENGTH} characters.`;
  }
  return null;
}

/** Returns an error message when a confirmation does not match, or null. */
export function validatePasswordConfirmation(password: string, confirmation: string): string | null {
  if (password !== confirmation) {
    return 'Passwords do not match.';
  }
  return null;
}
