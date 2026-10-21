"use client";

import {
  type AuthClient as ConvexAuthClient,
  ConvexBetterAuthProvider,
} from "@convex-dev/better-auth/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ConvexReactClient } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

import { AuthProvider } from "@/components/auth/auth-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { authClient } from "@/lib/auth-client";
import { getQueryClient } from "@/lib/query-client";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// @convex-dev/better-auth's AuthClient type is inferred against better-auth 1.6.15 and
// rejects the session type from 1.6.19+ (required by better-auth-ui). Runtime is unaffected.
const convexAuthClient = authClient as unknown as ConvexAuthClient;

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = getQueryClient();

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ConvexBetterAuthProvider client={convex} authClient={convexAuthClient}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider
            authClient={authClient}
            // After sign-in or sign-up, /start sends each account to its portal
            redirectTo="/start"
            // Must match convex/auth.ts: sign-up goes straight in instead of to "check your email"
            emailAndPassword={{ requireEmailVerification: false }}
            navigate={({ to, replace }) =>
              replace ? router.replace(to) : router.push(to)
            }
            Link={Link}
          >
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster />
          </AuthProvider>
        </QueryClientProvider>
      </ConvexBetterAuthProvider>
    </ThemeProvider>
  );
}
