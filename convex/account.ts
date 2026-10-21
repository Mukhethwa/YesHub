import { components } from "./_generated/api";
import { query, type QueryCtx } from "./_generated/server";
import { authComponent } from "./auth";

/** The organisations (enterprises / funders) a user belongs to. */
export async function organizationsFor(ctx: QueryCtx, userId: string) {
  return ctx.runQuery(components.betterAuth.users.organizationsForUser, { userId });
}

/**
 * Who the signed-in person is to YES Hub, for routing them to the right portal.
 * An account is either an SME (has an SME profile) or an enterprise member (belongs to an organisation);
 * a new account is neither until it registers. Admins are YES Hub staff.
 */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) return null;

    const [sme, organizations] = await Promise.all([
      ctx.db
        .query("smes")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .unique(),
      organizationsFor(ctx, user._id),
    ]);

    return {
      isAdmin: user.role === "admin",
      hasSmeProfile: sme !== null,
      organizations,
    };
  },
});
