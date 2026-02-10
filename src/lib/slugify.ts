export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u0400-\u04FF\u0600-\u06FF-]/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+|-+$/g, "");
}
