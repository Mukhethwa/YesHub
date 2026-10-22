import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL!;

// `convex deploy --cmd` (used on Vercel) only injects NEXT_PUBLIC_CONVEX_URL, so derive the
// HTTP actions URL for cloud deployments. Local deployments must set it explicitly.
const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? convexUrl.replace(/\.convex\.cloud$/, ".convex.site");

export const {
  handler,
  preloadAuthQuery,
  isAuthenticated,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthNextJs({ convexUrl, convexSiteUrl });
