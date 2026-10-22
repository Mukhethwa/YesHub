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

### How applications are decided

SMEs apply with a quoted price, a short proposal and supporting documents (stored in Convex file storage).
**Jev** ([TypeSafe’s router model](https://openrouter.ai/typesafe/jev-router) on OpenRouter) then reviews them
in two durable [Convex workflows](https://www.convex.dev/components/workflow) (`convex/review.ts`):

1. **Review**, when the SME applies: Jev reads every document behind the application (the profile’s compliance
   documents the opportunity asks for, and the files sent with it), records what each says and any mismatch with
   the profile, then scores the application against each of the buyer’s evaluation criteria with evidence.
2. **Decision**, when the buyer asks: price and B-BBEE points are calculated with the preferential procurement
   formulas (80/20 or 90/10, `convex/lib/procurement.ts`), Jev decides who is approved, and guardrails make sure
   only eligible applicants are approved and never more than the buyer asked for.

Every step goes on a **paper trail** (`reviewTrail`): what Jev read, how it scored and why, the points arithmetic,
the decision and its reasons, the model OpenRouter used and what each call cost, and any change a person made
(which needs a reason). Buyers see it per applicant and per decision, SMEs see their own outcome and reasons, and
YES Hub staff see every decision under **Admin → Jev decisions**.

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
pnpm exec convex env set OPENROUTER_API_KEY sk-or-...   # Jev; the OpenRouter account needs credits
# Optional. The default, onboarding@resend.dev, only delivers to your own Resend account's address
pnpm exec convex env set AUTH_EMAIL_FROM "YES Hub <auth@your-verified-domain.com>"
```

In a second terminal:

```bash
pnpm dev
```

Open http://localhost:3000 and sign up at `/auth/sign-up`. In development, the SME portal has a
**Dev: fill in a sample business** button that creates a sample SME profile for your account.

### Sample data

To fill a development deployment with accounts, SMEs, enterprises (with teams, members and invitations) and
staff:

```bash
pnpm exec convex run seed:devData '{"inviterEmail":"you@example.com"}'   # inviterEmail is optional
```

It refuses to run unless the deployment's `SITE_URL` is on localhost (or `ALLOW_SEED` is `true`, for a shared test
deployment; unset it again afterwards), and it's safe to re-run. Every seed account
uses the password in `SEED_PASSWORD` (`convex/seed.ts`); `naledi@yeshub.test` is a super admin, `musa@`,
`lindiwe@` and `tumi@yeshub.test` are an admin, a moderator and a viewer.

Seeded applications are scored by the rules until Jev reviews them. To have Jev review them (about 5 US cents each):

```bash
pnpm exec convex run seed:sampleProposals     # sample quotes and proposals for Jev to score
pnpm exec convex run review:reviewExisting    # also retries failed reviews
```

### Accounts and organisations

- **SMEs** are business accounts: one account, one SME profile, no teammates.
- **Enterprises** (Capitec, Boxer, …) are Better Auth organisations with members, teams and invitations. Anyone can
  create one, but it stays **unverified** until YES Hub staff approve it, and only verified organisations can post
  opportunities.
- **YES Hub staff** are members of the staff organisation (slug `yeshub`). Their role there is their access level
  in `/admin`, synced to the Better Auth admin role: owner → **super admin**, then **admin**, **moderator** and
  **viewer** (`src/lib/permissions.ts` lists what each can do).
- An account belongs to at most one organisation, and an SME account can't join one.

### YES Hub admins

Super admins invite staff and set access levels from **Admin → Staff**. Every staff action in the admin area is
recorded in **Admin → Audit log**.

To bootstrap the first super admin, list their email in `SUPER_ADMIN_EMAILS` on the Convex deployment, and the
account becomes the staff organisation's owner when it signs up:

```bash
pnpm exec convex env set SUPER_ADMIN_EMAILS "you@example.com,teammate@example.com"   # add --prod for production
```

For an account that already exists, or to delete one from the command line (internal functions, so only the CLI
or the Convex dashboard can run them):

```bash
pnpm exec convex run platform:makeSuperAdmin '{"email":"you@example.com"}'
pnpm exec convex run admin:deleteAccount '{"email":"someone@example.com"}'   # also removes their SME profile and files
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
| `OPENROUTER_API_KEY` | Convex | Jev, for reviewing and deciding applications. The OpenRouter account needs credits: a key’s limit is only a cap |
| `JEV_MODEL` | Convex | Optional. Defaults to `typesafe/jev-router` |
| `SUPER_ADMIN_EMAILS` | Convex | Comma-separated emails that become YES Hub super admins when they sign up |
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

Production runs at **https://yeshub-app.vercel.app** (Vercel project `yeshub-app`) against the Convex production
deployment `posh-seahorse-411`.

`vercel.json` makes every Vercel build run `pnpm convex deploy --cmd 'pnpm build'`: it deploys the Convex
functions and schema to production first, then builds Next.js against that deployment. Vercel authenticates to
Convex with the `CONVEX_DEPLOY_KEY` environment variable (Production), and the production backend has
`BETTER_AUTH_SECRET`, `SITE_URL` and `RESEND_API_KEY` set.

To deploy from your machine:

```bash
pnpm dlx vercel link        # once, pick the yeshub-app project
pnpm dlx vercel deploy --prod
```

Pushes to `main` deploy automatically: the Vercel project is connected to this GitHub repository. It's on Vercel's
Hobby plan, which only builds commits by the project owner, so teammates open a pull request and the owner merges it.

If you use a custom domain, update the backend to match:

```bash
pnpm exec convex env set --prod SITE_URL https://your-domain.example
```

**Preview deployments** would need a Convex _preview_ deploy key as `CONVEX_DEPLOY_KEY` in Vercel's **Preview**
environment, so each branch gets its own Convex backend, plus a `SITE_URL` that matches each preview's URL for
sign-in to work. Until then, `git.deploymentEnabled` in `vercel.json` only deploys `main`.

## Project layout

| Path | What |
| --- | --- |
| `convex/schema.ts` | Database schema (`smes`: SME business profiles, keyed by Better Auth user; `auditLog`: staff actions) |
| `convex/smes.ts` | SME profile queries and mutations |
| `convex/auth.ts` | Better Auth options and instance: email/password, organisations (enterprises with teams, and YES Hub staff), admin, and the hooks that enforce access levels and write the audit log |
| `convex/betterAuth/` | Locally installed Better Auth component: generated schema, adapter, component functions |
| `convex/admin.ts` | The admin area's queries and mutations (SMEs, organisations, staff), each checked against the caller's access level |
| `convex/platform.ts`, `convex/audit.ts` | Account state, staff roles and the audit log |
| `convex/seed.ts` | Development sample data |
| `convex/review.ts`, `convex/reviewActions.ts` | Jev’s review and decision workflows, the paper trail, and the Jev calls |
| `convex/lib/jev.ts`, `convex/lib/procurement.ts` | The OpenRouter client, and the price and B-BBEE points formulas |
| `convex/email.tsx` | Auth emails via Resend, using `@better-auth-ui/react/email` templates |
| `convex/http.ts` | Mounts the Better Auth HTTP routes on Convex |
| `src/app/api/auth/[...all]/route.ts` | Proxies `/api/auth/*` from Next.js to Convex |
| `src/app/auth/` | Auth screens with their own layout |
| `src/app/(marketing)/` | Landing page (`/`) |
| `src/app/start/` | Where sign-in lands: sends each account to its portal, or asks new accounts if they're an SME or an enterprise |
| `src/app/sme/` | SME portal (`/sme`) and the registration wizard (`/sme/register`) |
| `src/app/dashboard/` | Enterprise dashboard (`/dashboard`), for organisation members |
| `src/app/admin/` | YES Hub admin (`/admin`), for staff: users, SMEs, organisations, staff and the audit log |
| `src/app/(app)/` | Account settings, with the app header |
| `src/components/portal/` | Shared portal shell, sidebar and access guard |
| `src/components/sme-portal/`, `enterprise/`, `admin/` | Each portal's navigation and screens |
| `src/lib/sme/` | SME domain logic shared by the UI: profile readiness, document status |
| `src/lib/permissions.ts` | Access control shared by Convex and the UI: staff access levels and organisation roles |
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
