"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { RegistrationWizard } from "@/components/sme/registration-wizard";
import { Spinner } from "@/components/ui/spinner";
import { homeFor, useAccount } from "@/hooks/use-account";
import { useRequireSession } from "@/hooks/use-require-session";

export default function SmeRegisterPage() {
  const router = useRouter();
  // Redirects to sign-in when signed out
  const { data: session } = useRequireSession();
  const account = useAccount();
  // Registration is once per account, and only for accounts that aren't already an SME or enterprise
  const home = account ? homeFor(account) : null;

  useEffect(() => {
    if (home) router.replace(home);
  }, [home, router]);

  if (!session || !account || home) return <Spinner className="mx-auto mt-24" />;

  return <RegistrationWizard name={session.user.name} email={session.user.email} />;
}
