/** Where to go after signing in: a path inside the app (e.g. back to an invite), else Home.
 * Anything that could leave the app (`//host`, `/\host`, a full address) goes Home. */
export function safeNext(next: string | null | undefined): string {
  return next && /^\/(?![/\\])/.test(next) ? next : "/home";
}
