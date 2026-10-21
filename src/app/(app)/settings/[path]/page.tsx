import { viewPaths } from "@better-auth-ui/core";
import { organizationPlugin } from "@better-auth-ui/core/plugins";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Spinner } from "@/components/ui/spinner";
import { SettingsView } from "./settings-view";

// Account and security, plus the organisation plugin's organisations tab
const settingsPaths = [...Object.values(viewPaths.settings), ...Object.values(organizationPlugin().viewPaths.settings ?? {})];

export function generateStaticParams() {
  return settingsPaths.map((path) => ({ path }));
}

// Prerendered, so there's no server-side session check here.
// <Settings> calls useAuthenticate, which redirects signed-out users to sign-in.
export default function SettingsPage({ params }: PageProps<"/settings/[path]">) {
  return (
    <main className="mx-auto w-full max-w-3xl p-4 md:p-6">
      <Suspense fallback={<Spinner className="mx-auto" />}>
        <SettingsRoute params={params} />
      </Suspense>
    </main>
  );
}

async function SettingsRoute({ params }: Pick<PageProps<"/settings/[path]">, "params">) {
  const { path } = await params;

  if (!settingsPaths.includes(path)) notFound();

  return <SettingsView path={path} />;
}
