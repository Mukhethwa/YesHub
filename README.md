# Tendr

Next.js 16 (App Router, TypeScript, Cache Components) + shadcn/ui (radix-nova) + Convex + Better Auth + Better Auth UI.

## Getting started

```bash
npm install
npx convex dev            # first run: log in / pick a project, writes .env.local
```

Then, once per Convex deployment:

```bash
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
npx convex env set SITE_URL http://localhost:3000
```

Auth emails (verification, password reset, password changed, change-email confirmation) are sent from
Convex through the [Resend component](https://www.convex.dev/components/resend), using the email templates
from `@better-auth-ui/react/email` (see `convex/email.tsx`):

```bash
npx convex env set RESEND_API_KEY re_...
# Optional; defaults to onboarding@resend.dev, which only delivers to your own Resend account's address
npx convex env set AUTH_EMAIL_FROM "Tendr <auth@your-verified-domain.com>"
```

Make sure `.env.local` has `NEXT_PUBLIC_CONVEX_SITE_URL` and `NEXT_PUBLIC_SITE_URL` (see `.env.example`), then in a second terminal:

```bash
npm run dev
```

Open http://localhost:3000 and sign up at `/auth/sign-up`.

## Layout

| Path | What |
| --- | --- |
| `convex/auth.ts` | Better Auth instance (`createAuth`) backed by the Convex component; `getCurrentUser` query |
| `convex/email.tsx` | Sends auth emails via Resend |
| `convex/http.ts` | Mounts the Better Auth HTTP routes on Convex |
| `src/app/api/auth/[...all]/route.ts` | Proxies `/api/auth/*` from Next.js to Convex |
| `src/lib/auth-client.ts` | Better Auth React client |
| `src/lib/auth-server.ts` | Server helpers: `isAuthenticated`, `getToken`, `fetchAuthQuery`, `preloadAuthQuery`, … |
| `src/components/providers.tsx` | Convex + React Query + Better Auth UI providers |
| `src/components/auth/**` | Better Auth UI components (owned code, from the shadcn registry) |
| `src/app/auth/` | Auth screens with their own layout: sign in, sign up, verify email, forgot/reset password, sign out |
| `src/app/(app)/` | Everything else, with the app header: home, `settings/[path]` (account, security) |

## Version pins — read before upgrading

`@convex-dev/better-auth@0.12.x` only supports `better-auth <1.7` (its 1.7 migration is unreleased), and
`@better-auth-ui/*` 1.7+ requires `better-auth >=1.7`. So:

- `better-auth` and every `@better-auth/*` package are pinned to `~1.6.33`.
- `@better-auth-ui/react` and `@better-auth-ui/core` are pinned to exactly `1.6.45` (the last 1.6 release).
- The components in `src/components/auth` were built from the better-auth-ui `v1.6.45` tag's registry, **not**
  the hosted registry at better-auth-ui.com (which serves 1.7 components). Don't run
  `npx shadcn add @better-auth-ui/...` until you've upgraded everything to 1.7 together.
- `src/components/providers.tsx` casts `authClient` for `ConvexBetterAuthProvider`; Convex's type for that prop
  doesn't match better-auth 1.6.19+'s session type. Remove the cast once `@convex-dev/better-auth` supports 1.7.
