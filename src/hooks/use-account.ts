"use client";

import { useConvexAuth, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";

/**
 * Who the signed-in person is to MASLink: staff access level, SME profile, enterprise organisation.
 * undefined while loading (or before Convex auth is ready), null when signed out.
 */
export function useAccount() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const account = useQuery(api.account.overview, isAuthenticated ? {} : "skip");
  if (isLoading) return undefined;
  return isAuthenticated ? account : null;
}

export type Account = NonNullable<ReturnType<typeof useAccount>>;

/** Where an account belongs, or null if it hasn't chosen yet. */
export function homeFor(account: Account) {
  if (account.staffRole) return "/admin";
  if (account.hasSmeProfile) return "/sme";
  if (account.enterprise) return "/dashboard";
  return null;
}
