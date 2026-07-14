export function buildPublicPostoUrl(slug: string, origin = window.location.origin) {
  return `${origin}/p/${slug}`
}
