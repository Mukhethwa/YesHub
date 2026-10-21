"use client";

import { Settings } from "@/components/auth/settings/settings";
import { useIsHydrated } from "@/components/auth/use-is-hydrated";
import { Spinner } from "@/components/ui/spinner";

// Settings is prerendered without a session, but the header may fetch the session
// before this subtree hydrates. Rendering after hydration avoids a mismatch.
export function SettingsView({ path }: { path: string }) {
  const isHydrated = useIsHydrated();

  if (!isHydrated) return <Spinner className="mx-auto" />;

  return <Settings path={path} />;
}
