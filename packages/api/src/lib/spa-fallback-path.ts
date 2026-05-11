/** Avoid SPA fallback for missing real files — returning HTML for *.css/*.js breaks strict MIME checks in browsers. */
export function shouldServeSpaFallback(requestPath: string): boolean {
  const pathOnly = requestPath.split('?')[0]
  if (pathOnly.startsWith('/assets/')) return false
  return !/\.(css|js|mjs|map|json|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|webmanifest)$/i.test(
    pathOnly,
  )
}
