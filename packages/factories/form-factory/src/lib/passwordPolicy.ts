/**
 * Client-side policy for passwords the user is *creating* (signup, reset).
 *
 * This mirrors the intended Supabase minimum so the user is told about a short
 * password before a round trip. Supabase remains the boundary: it enforces the
 * minimum and leaked-password protection server-side.
 *
 * Not applied to the sign-in field -- existing accounts predate this rule and
 * must still be able to log in and then reset.
 *
 * No symbol/case rules, because production does not enforce any -- inventing
 * them here would only produce rejections the server would have accepted.
 */
export const NEW_PASSWORD_MIN_LENGTH = 8;

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
