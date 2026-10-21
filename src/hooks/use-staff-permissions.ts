"use client";

import { can, isStaffRole } from "@/lib/permissions";
import { useAccount } from "./use-account";

/** The signed-in staff member's access level and a permission check against it (src/lib/permissions.ts). */
export function useStaffPermissions() {
  const account = useAccount();
  const role = account?.staffRole ?? null;
  return {
    role: isStaffRole(role) ? role : null,
    can: (permissions: Parameters<typeof can>[1]) => can(role, permissions),
  };
}
