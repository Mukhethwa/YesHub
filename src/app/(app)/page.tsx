"use client";

import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api } from "../../../convex/_generated/api";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <AuthLoading>
        <Spinner />
      </AuthLoading>

      <Unauthenticated>
        <h1 className="text-2xl font-semibold">Welcome to YES Hub</h1>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/auth/sign-in">Sign in</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/auth/sign-up">Sign up</Link>
          </Button>
        </div>
      </Unauthenticated>

      <Authenticated>
        <CurrentUser />
      </Authenticated>
    </main>
  );
}

function CurrentUser() {
  const user = useQuery(api.auth.getCurrentUser);

  if (user === undefined) return <Spinner />;

  return (
    <>
      <h1 className="text-2xl font-semibold">Hello, {user?.name || user?.email}</h1>
      <Button asChild>
        <Link href="/dashboard">Go to your dashboard</Link>
      </Button>
    </>
  );
}
