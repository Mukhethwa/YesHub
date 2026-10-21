"use client";

import { useConvexAuth, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";

/**
 * The signed-in user's SME profile: undefined while loading, null if they have none.
 * Waits for Convex auth so a not-yet-authenticated query can't report "no profile".
 */
export function useCurrentSme() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.smes.current, isAuthenticated ? {} : "skip");
}
