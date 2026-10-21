"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { Spinner } from "@/components/ui/spinner";
import { type Account, useAccount } from "@/hooks/use-account";
import type { PortalArea } from "./types";

/** Where to send someone who doesn't belong in `area`, or null if they may stay. */
function redirectFor(area: PortalArea, account: Account): string | null {
  // YES Hub staff can open every area
  if (account.isAdmin) return null;

  const isEnterprise = account.organizations.length > 0;
  switch (area) {
    case "admin":
      return "/start";
    case "sme":
      // New accounts may enter to register; enterprise members belong in their dashboard
      return isEnterprise && !account.hasSmeProfile ? "/dashboard" : null;
    case "enterprise":
      return account.hasSmeProfile && !isEnterprise ? "/sme" : null;
  }
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
