![YES Hub: Enterprise & SME Matchmaking Portal. Connecting enterprise tenders with the right SME providers.](docs/yeshub-banner.jpeg)

# YES Hub

**AI SME opportunity matching** (YES AI Hub, Challenge 4). YES Hub connects enterprise tenders, RFQs and funding
with the right SME providers.

## How it works

YES Hub has a portal for each side of the match:

- **SMEs** register their business once: company details, the services they offer, the provinces and areas they
  can deliver in, and the compliance documents buyers ask for (B-BBEE certificate, tax compliance status, CIPC
  registration and more). Their dashboard shows a **profile readiness** score with the gaps holding them back,
  which documents are missing or expired, and the opportunities they've been matched to.
- **Corporates and funders** publish tenders, RFQs and grants, and find suppliers who are compliant and can
  deliver where the work is.
- **The YES Programme Team** oversees the programme across both sides.

Matching uses what SMEs put in their profile, so a complete, current profile means more and better matches.

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

Open http://localhost:3000 and sign up at `/auth/sign-up`. In development, the SME portal has a
**Dev: fill in a sample business** button that creates a sample SME profile for your account.

### YES Hub admins

YES Hub staff (the `/admin` area) are accounts with the Better Auth `admin` role. Any account created with an
email listed in `SUPER_ADMIN_EMAILS` on the Convex deployment becomes an admin as it signs up:

```bash
pnpm exec convex env set SUPER_ADMIN_EMAILS "you@example.com,teammate@example.com"   # add --prod for production
```

For accounts that already exist, set or remove the role directly, and delete accounts the same way. These are
internal functions, so only the CLI or the Convex dashboard can run them:

```bash
pnpm exec convex run admin:setPlatformRole '{"email":"you@example.com","role":"admin"}'   # or "user"
pnpm exec convex run admin:deleteAccount '{"email":"someone@example.com"}'                # also removes their SME profile and files
# add --prod for production
```

### Environment variables

| Variable | Where | Notes |
| --- | --- | --- |
| `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL` | `.env.local` | Written by `pnpm dev:convex` |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | `.env.local` | Optional for cloud deployments (derived from `NEXT_PUBLIC_CONVEX_URL`); required for a local Convex backend (`http://127.0.0.1:3211`) |
| `BETTER_AUTH_SECRET` | Convex | Signs sessions and tokens |
| `SITE_URL` | Convex | The app's public URL; used in email links and to validate requests |
| `RESEND_API_KEY` | Convex | Emails are sent from Convex, not Next.js |
| `SUPER_ADMIN_EMAILS` | Convex | Comma-separated emails that become YES Hub admins when they sign up |
| `AUTH_EMAIL_FROM` | Convex | Sender address on a domain verified in Resend. Until one is set, mail only reaches the Resend account owner, so sign-up doesn’t require email verification (see `convex/auth.ts`) |
| `CONVEX_DEPLOY_KEY` | Vercel | See below |

### Scripts

| Command | What |
| --- | --- |
| `pnpm dev` | Next.js dev server |
| `pnpm dev:convex` | Convex dev deployment, watching `convex/` |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Route type generation + `tsc` |
| `pnpm auth:generate` | Regenerate the Better Auth schema in `convex/betterAuth` after changing auth plugins or fields |

## Deployment

Production runs at **https://yes-hub.vercel.app** (Vercel project `yes-hub`) against the Convex production
deployment `fortunate-pigeon-601`.

`vercel.json` makes every Vercel build run `pnpm convex deploy --cmd 'pnpm build'`: it deploys the Convex
functions and schema to production first, then builds Next.js against that deployment. Vercel authenticates to
Convex with the `CONVEX_DEPLOY_KEY` environment variable (Production), and the production backend has
`BETTER_AUTH_SECRET`, `SITE_URL` and `RESEND_API_KEY` set.

To deploy from your machine:

```bash
pnpm dlx vercel link        # once, pick the yes-hub project
pnpm dlx vercel deploy --prod
```

Pushes to `main` deploy automatically once the Vercel project is connected to this GitHub repository
(Vercel project **Settings → Git**; connecting needs the Vercel GitHub app installed with access to the repo).

If you use a custom domain, update the backend to match:

```bash
pnpm exec convex env set --prod SITE_URL https://your-domain.example
```

**Preview deployments** would need a Convex _preview_ deploy key as `CONVEX_DEPLOY_KEY` in Vercel's **Preview**
environment, so each branch gets its own Convex backend, plus a `SITE_URL` that matches each preview's URL for
sign-in to work.

## Project layout

| Path | What |
| --- | --- |
| `convex/schema.ts` | Database schema (`smes`: SME business profiles, keyed by Better Auth user) |
| `convex/smes.ts` | SME profile queries and mutations |
| `convex/auth.ts` | Better Auth options and instance: email/password, organisations (enterprises, with teams) and admin |
| `convex/betterAuth/` | Locally installed Better Auth component: generated schema, adapter, component functions |
| `convex/admin.ts` | Internal admin tooling, e.g. `setPlatformRole` |
| `convex/email.tsx` | Auth emails via Resend, using `@better-auth-ui/react/email` templates |
| `convex/http.ts` | Mounts the Better Auth HTTP routes on Convex |
| `src/app/api/auth/[...all]/route.ts` | Proxies `/api/auth/*` from Next.js to Convex |
| `src/app/auth/` | Auth screens with their own layout |
| `src/app/(marketing)/` | Landing page (`/`) |
| `src/app/start/` | Where sign-in lands: sends each account to its portal, or asks new accounts if they're an SME or an enterprise |
| `src/app/sme/` | SME portal (`/sme`) and the registration wizard (`/sme/register`) |
| `src/app/dashboard/` | Enterprise dashboard (`/dashboard`), for organisation members |
| `src/app/admin/` | YES Hub admin (`/admin`), for accounts with the `admin` role |
| `src/app/(app)/` | Account settings, with the app header |
| `src/components/portal/` | Shared portal shell, sidebar and access guard |
| `src/components/sme-portal/`, `enterprise/`, `admin/` | Each portal's navigation and screens |
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
