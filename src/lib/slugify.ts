export function slugify(text: string): string {
  const slug = text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u0400-\u04FF\u0600-\u06FF-]/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "untitled";
}

export async function generateUniqueSlug(
  baseSlug: string,
  checkExists: (slug: string) => Promise<boolean>
): Promise<string> {
  let candidate = baseSlug;
  let counter = 0;

  while (await checkExists(candidate)) {
    counter++;
    candidate = `${baseSlug}-${counter}`;
  }

  return candidate;
}
