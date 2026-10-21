![YES Hub: Enterprise & SME Matchmaking Portal. Connecting enterprise tenders with the right SME providers.](docs/yeshub-banner.jpeg)

# YES Hub

**AI SME opportunity matching** (YES AI Hub, Challenge 4). YES Hub connects enterprise tenders, RFQs and funding
with the right SME providers: SMEs build a match-ready business profile, and corporates and funders find suppliers
who are compliant and can deliver in their area.

This is the Next.js + Convex rebuild of the original Vite prototype, migrated a piece at a time.

| Area | Status |
| --- | --- |
| Accounts: sign up, sign in, email verification, password reset, account & security settings | Done |
| SME dashboard: layout, navigation, Overview (profile readiness, coverage, documents, matches) | Done |
| SME registration (6-step business profile) | Next |
| Dashboard: Documents, Business profile, Settings | Planned |
| Opportunities, matching, Corporate / Funder and YES Programme Team portals | Planned |

Until registration is migrated, the dashboard offers a **Dev: fill in a sample business** button in development so
the Overview can be seen with data.

## Stack

- [Next.js 16](https://nextjs.org) (App Router, TypeScript, Cache Components) with [shadcn/ui](https://ui.shadcn.com) (radix-nova) and Tailwind CSS 4
- [Convex](https://convex.dev) for the database, backend functions and file storage
- [Better Auth](https://www.better-auth.com) running inside Convex via [`@convex-dev/better-auth`](https://labs.convex.dev/better-auth), with screens from [Better Auth UI](https://better-auth-ui.com)
- [Resend](https://resend.com) for auth emails, through the [Convex Resend component](https://www.convex.dev/components/resend)
- [Vercel](https://vercel.com) for hosting
- [pnpm](https://pnpm.io) as the package manager

## Getting started

You need Node.js 20.9+ and pnpm 12 (`corepack enable` picks up the version from `package.json`).

```bash
pnpm install
pnpm dev:convex     # first run: log in and pick the Convex project; writes .env.local
```

Leave that running (it pushes `convex/` as you save), then set the backend's environment once per Convex deployment:

```bash
pnpm exec convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
pnpm exec convex env set SITE_URL http://localhost:3000
pnpm exec convex env set RESEND_API_KEY re_...
# Optional. The default, onboarding@resend.dev, only delivers to your own Resend account's address
pnpm exec convex env set AUTH_EMAIL_FROM "YES Hub <auth@your-verified-domain.com>"
```

In a second terminal:

```bash
pnpm dev
```

Open http://localhost:3000 and sign up at `/auth/sign-up`.

### Environment variables

| Variable | Where | Notes |
| --- | --- | --- |
| `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL` | `.env.local` | Written by `pnpm dev:convex` |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | `.env.local` | Optional for cloud deployments (derived from `NEXT_PUBLIC_CONVEX_URL`); required for a local Convex backend (`http://127.0.0.1:3211`) |
| `BETTER_AUTH_SECRET` | Convex | Signs sessions and tokens |
| `SITE_URL` | Convex | The app's public URL; used in email links and to validate requests |
| `RESEND_API_KEY` | Convex | Emails are sent from Convex, not Next.js |
| `AUTH_EMAIL_FROM` | Convex | Sender address on a domain verified in Resend |
| `CONVEX_DEPLOY_KEY` | Vercel | See below |

### Scripts

| Command | What |
| --- | --- |
| `pnpm dev` | Next.js dev server |
| `pnpm dev:convex` | Convex dev deployment, watching `convex/` |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Route type generation + `tsc` |

## Deploying to Vercel

`vercel.json` makes every Vercel build run `pnpm convex deploy --cmd 'pnpm build'`: it deploys the Convex
functions and schema first, then builds Next.js against that deployment.

1. In Vercel, **Add New → Project** and import `Mukhethwa/YesHub`. Keep the detected settings; `vercel.json`
   supplies the install and build commands.
2. In the [Convex dashboard](https://dashboard.convex.dev), open the project's **Production** deployment →
   **Settings** → **Generate Production Deploy Key**. Add it in Vercel as `CONVEX_DEPLOY_KEY`, scoped to the
   **Production** environment.
3. Set the production backend's environment (use your Vercel or custom domain for `SITE_URL`):

   ```bash
   pnpm exec convex env set --prod BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
   pnpm exec convex env set --prod SITE_URL https://your-domain.example
   pnpm exec convex env set --prod RESEND_API_KEY re_...
   pnpm exec convex env set --prod AUTH_EMAIL_FROM "YES Hub <auth@your-verified-domain.com>"
   ```

4. Deploy. Pushes to `main` deploy to production from then on.

**Preview deployments** need a Convex _preview_ deploy key as `CONVEX_DEPLOY_KEY` in Vercel's **Preview**
environment; each branch then gets its own Convex backend. Sign-in on previews also needs `SITE_URL` to match the
preview's URL, which isn't automated yet, so auth on previews isn't set up.

## Project layout

| Path | What |
| --- | --- |
| `convex/schema.ts` | Database schema (`smes`: SME business profiles, keyed by Better Auth user) |
| `convex/smes.ts` | SME profile queries and mutations |
| `convex/auth.ts` | Better Auth instance (`createAuth`) backed by the Convex component |
| `convex/email.tsx` | Auth emails via Resend, using `@better-auth-ui/react/email` templates |
| `convex/http.ts` | Mounts the Better Auth HTTP routes on Convex |
| `src/app/api/auth/[...all]/route.ts` | Proxies `/api/auth/*` from Next.js to Convex |
| `src/app/auth/` | Auth screens with their own layout |
| `src/app/dashboard/` | SME dashboard (Overview and section routes) |
| `src/app/(app)/` | Landing page and account settings, with the app header |
| `src/components/dashboard/` | Dashboard shell, sidebar and Overview widgets |
| `src/lib/sme/` | SME domain logic shared by the UI: profile readiness, document status |
| `src/components/auth/**`, `src/components/ui/**` | Better Auth UI and shadcn/ui components (owned code, from registries) |

## Version pins: read before upgrading

`@convex-dev/better-auth@0.12.x` only supports `better-auth <1.7` (its 1.7 migration is unreleased), and
`@better-auth-ui/*` 1.7+ requires `better-auth >=1.7`. So:

- `better-auth` and every `@better-auth/*` package are pinned to `~1.6.33`.
- `@better-auth-ui/react` and `@better-auth-ui/core` are pinned to exactly `1.6.45` (the last 1.6 release).
- The components in `src/components/auth` were built from the better-auth-ui `v1.6.45` tag's registry, **not**
  the hosted registry at better-auth-ui.com (which serves 1.7 components). Don't run
  `pnpm dlx shadcn add @better-auth-ui/...` until you've upgraded everything to 1.7 together.
- `src/components/providers.tsx` casts `authClient` for `ConvexBetterAuthProvider`; Convex's type for that prop
  doesn't match better-auth 1.6.19+'s session type. Remove the cast once `@convex-dev/better-auth` supports 1.7.
