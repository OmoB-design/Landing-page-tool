/**
 * Where links meant for people outside the app point (client review links, invites): the
 * project's production domain, which Vercel keeps public while its login covers previews and
 * generated addresses, so a link copied from anywhere opens. Locally, this server's own address.
 */
export function publicBase(request: Request): string {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return production ? `https://${production}` : new URL(request.url).origin;
}
