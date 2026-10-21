"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { Spinner } from "@/components/ui/spinner";
import { type Account, useAccount } from "@/hooks/use-account";
import type { PortalArea } from "./types";

/** Where to send someone who doesn't belong in `area`, or null if they may stay. */
function redirectFor(area: PortalArea, account: Account): string | null {
  // Staff accounts are staff only; everyone else stays out of the admin area
  if (account.staffRole) return area === "admin" ? null : "/admin";
  if (area === "admin") return "/start";

  // New accounts may enter either side to register; after that, each account has one home
  if (area === "sme") return account.enterprise ? "/dashboard" : null;
  return account.hasSmeProfile ? "/sme" : null;
}

/**
 * Keeps each portal to the right accounts. Pages stay mounted (hidden) while the account loads, so they
 * prerender normally; Convex functions enforce the same rules server-side.
 */
export function PortalGuard({ area, children }: { area: PortalArea; children: ReactNode }) {
  const router = useRouter();
  const account = useAccount();
  const redirect = account ? redirectFor(area, account) : null;
  const allowed = !!account && redirect === null;

  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  return (
    <>
      {!allowed && <Spinner className="mx-auto mt-24" />}
      <div hidden={!allowed}>{children}</div>
    </>
  );
}
