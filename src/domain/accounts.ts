/**
 * Account rules shared by the forms and every backend.
 */

/** Students younger than this need a parent or guardian to manage their account. */
export const ADULT_AGE = 18;
/** Youngest learner a parent can register. */
export const MIN_CHILD_AGE = 6;

/** Age this year (the precise birthday isn't collected, so it can be one year high). */
export function ageFromBirthYear(birthYear: number, now = new Date()): number {
  return now.getFullYear() - birthYear;
}

export function isMinor(birthYear: number, now = new Date()): boolean {
  return ageFromBirthYear(birthYear, now) < ADULT_AGE;
}

/** Libyan mobile numbers: 09X XXXXXXX, or +218 9X XXXXXXX. */
export function normalizeLibyanPhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-().]/g, "").replace(/^00/, "+");
  const match = digits.match(/^(?:\+218|0)(9[1-5]\d{7})$/);
  return match ? `+218${match[1]}` : null;
}
