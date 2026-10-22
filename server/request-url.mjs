// Plain Vercel Functions do not implement Next.js [...path] catch-all routing.
// The explicit rewrite carries the original API path through its query string.
export function apiRequestUrl(rawUrl, origin) {
  const url = new URL(rawUrl, origin);
  const path = url.searchParams.get('__draft_path');
  if (path !== null) {
    url.pathname = '/api/' + path.replace(/^\/+/, '');
    url.searchParams.delete('__draft_path');
  }
  return url;
}
