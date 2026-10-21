"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

/** Shown on every page while a YES Hub admin is viewing the platform as someone else. */
export function ImpersonationBanner() {
  const { data } = authClient.useSession();
  const [busy, setBusy] = useState(false);

  if (!data?.session.impersonatedBy) return null;

  const stop = async () => {
    setBusy(true);
    const { error } = await authClient.admin.stopImpersonating();
    if (error) {
      setBusy(false);
      return toast.error(error.message || "Couldn’t switch back to your account.");
    }
    // Full reload so every query re-authenticates as the admin again
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full reload re-authenticates every query
    window.location.assign("/admin/users");
  };

  return (
    <div role="status" className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-warning px-4 py-2 text-sm text-black">
      <span>
        You’re viewing YES Hub as <strong>{data.user.name}</strong> ({data.user.email}).
      </span>
      <Button size="sm" variant="outline" className="h-7 border-black/30 bg-transparent text-black hover:bg-black/10" disabled={busy} onClick={stop}>
        {busy && <Spinner />}
        Back to my account
      </Button>
    </div>
  );
}
