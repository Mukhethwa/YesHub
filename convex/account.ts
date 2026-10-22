import { isStaffRole } from "../src/lib/permissions";
import { components } from "./_generated/api";
import { type QueryCtx } from "./_generated/server";
import { query } from "./functions";
import { authComponent } from "./auth";

/** The organisations a user belongs to (at most one by policy). */
export async function organizationsFor(ctx: QueryCtx, userId: string) {
  return ctx.runQuery(components.betterAuth.organizations.forUser, { userId });
}

/**
 * Who the signed-in person is to YES Hub, for routing them to the right portal. Every account is exactly
 * one of: YES Hub staff (a member of the staff organisation), an enterprise member, an SME, or new.
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
    const enterprise = organizations.find((org) => org.kind === "enterprise") ?? null;

    return {
      /** Platform access level ("superadmin", "admin", "moderator", "viewer"), or null for non-staff. */
      staffRole: isStaffRole(user.role) ? user.role : null,
      hasSmeProfile: sme !== null,
      /** The enterprise organisation this account belongs to, with the user's role in it. */
      enterprise,
    };
  },
});
