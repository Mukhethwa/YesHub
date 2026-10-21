"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/** Header actions: sign in / register when signed out, dashboard when signed in. */
export function AuthButtons() {
  return (
    <div className="flex items-center gap-2">
      <AuthLoading>
        {/* Reserve the space so the header doesn't shift when auth resolves */}
        <div className="h-8 w-40" />
      </AuthLoading>

      <Unauthenticated>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/auth/sign-in">Sign in</Link>
        </Button>
        <Button size="sm" asChild>
          <Link href="/auth/sign-up">Register</Link>
        </Button>
      </Unauthenticated>

      <Authenticated>
        <Button size="sm" asChild>
          <Link href="/start">Open YES Hub</Link>
        </Button>
      </Authenticated>
    </div>
  );
}
