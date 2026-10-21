"use client";

import { useAuth, useSession } from "@better-auth-ui/react";
import { useEffect } from "react";

import { authClient } from "@/lib/auth-client";

/**
 * The session, sending signed-out visitors to sign-in (and back here afterwards).
 *
 * Replaces better-auth-ui's useAuthenticate, which redirects as soon as the cached session is null, even
 * while it's being refetched. With cacheComponents, Next keeps a page visited while signed out alive, so
 * right after signing in that page would see the stale null and bounce straight back to sign-in.
 */
export function useRequireSession() {
  const { basePaths, viewPaths, navigate } = useAuth();
  const session = useSession(authClient);
  const signedOut = !session.data && !session.isPending && !session.isFetching;

  useEffect(() => {
    if (!signedOut) return;
    const here = encodeURIComponent(window.location.pathname + window.location.search);
    navigate({ to: `${basePaths.auth}/${viewPaths.auth.signIn}?redirectTo=${here}`, replace: true });
  }, [signedOut, basePaths.auth, viewPaths.auth.signIn, navigate]);

  return session;
}
