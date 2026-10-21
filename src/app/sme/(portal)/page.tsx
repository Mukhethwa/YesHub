"use client";

import { Overview } from "@/components/sme-portal/overview";
import { ClearDemoButton, SetupProfile } from "@/components/sme-portal/setup-profile";
import { Spinner } from "@/components/ui/spinner";
import { useCurrentSme } from "@/hooks/use-current-sme";

export default function DashboardPage() {
  const sme = useCurrentSme();

  if (sme === undefined) return <Spinner className="mx-auto mt-24" />;
  if (sme === null) return <SetupProfile />;

  return (
    <>
      <Overview sme={sme} />
      {sme.isDemo && <ClearDemoButton />}
    </>
  );
}
