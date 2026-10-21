"use client";

import { useAuthenticate } from "@better-auth-ui/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { RegistrationWizard } from "@/components/sme/registration-wizard";
import { Spinner } from "@/components/ui/spinner";
import { useCurrentSme } from "@/hooks/use-current-sme";
import { authClient } from "@/lib/auth-client";

export default function OnboardingPage() {
  const router = useRouter();
  // Redirects to sign-in when signed out
  const { data: session } = useAuthenticate(authClient);
  const sme = useCurrentSme();

  // Registration is once per account
  useEffect(() => {
    if (sme) router.replace("/dashboard");
  }, [sme, router]);

  if (!session || sme !== null) return <Spinner className="mx-auto mt-24" />;

  return <RegistrationWizard name={session.user.name} email={session.user.email} />;
}
