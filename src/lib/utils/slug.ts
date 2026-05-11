/**
 * Convert a tenant/display name into a URL-safe ASCII slug.
 * Thai/non-ASCII characters are stripped — if the result is empty,
 * a random fallback is returned.
 */
export function toSlug(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s-]/g, "") // remove non-alphanumeric
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return slug || randomSlug();
}

function randomSlug(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Resolve a unique tenant slug by appending `-2`, `-3`, … if the base
 * slug is already taken. `isAvailable` should resolve to `true` when
 * the candidate slug is free.
 */
export async function resolveUniqueSlug(
  baseName: string,
  isAvailable: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const base = toSlug(baseName);
  let candidate = base;
  let attempt = 1;
  while (!(await isAvailable(candidate))) {
    attempt++;
    candidate = `${base}-${attempt}`;
    if (attempt > 50) {
      throw new Error(`Could not generate unique slug for "${baseName}" after 50 attempts`);
    }
  }
  return candidate;
}
