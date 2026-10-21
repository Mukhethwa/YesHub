<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Project conventions

- **Use pnpm** for everything (`pnpm install`, `pnpm add`, `pnpm exec convex …`). Never commit a `package-lock.json`.
  Packages with install scripts must be allowed in `pnpm-workspace.yaml` (`allowBuilds`).
- **Better Auth versions are pinned** because `@convex-dev/better-auth` doesn't support better-auth 1.7 yet:
  `better-auth` and `@better-auth/*` stay on `~1.6.33`, `@better-auth-ui/*` on exactly `1.6.45`.
  Don't run `pnpm dlx shadcn add @better-auth-ui/...` (the hosted registry serves 1.7 components). See README.
- `src/components/auth/**` and `src/components/ui/**` are generated from registries; prefer composing them over editing.
- Better Auth runs as a **locally installed Convex component** (`convex/betterAuth`). After changing plugins or
  user/org fields in `convex/auth.ts`, run `pnpm auth:generate` and commit `generatedSchema.ts`. Never hand-edit it.
- Deploys go through Vercel, which runs `convex deploy --cmd 'pnpm build'` (see `vercel.json`).
