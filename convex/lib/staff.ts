import { can, isStaffRole } from "../../src/lib/permissions";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { authComponent } from "../auth";

type Permissions = Parameters<typeof can>[1];

/** The signed-in YES Hub staff member if they have every listed permission, otherwise null. */
export async function getStaff(ctx: QueryCtx, permissions: Permissions) {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user || !isStaffRole(user.role) || !can(user.role, permissions)) return null;
  return user;
}

/** Like getStaff, but throws for anyone else. For mutations. */
export async function requireStaff(ctx: MutationCtx, permissions: Permissions) {
  const staff = await getStaff(ctx, permissions);
  if (!staff) throw new Error("You don’t have permission to do that.");
  return staff;
}
