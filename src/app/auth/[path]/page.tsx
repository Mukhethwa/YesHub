import { type AuthView, viewPaths } from "@better-auth-ui/core";
import { organizationPlugin } from "@better-auth-ui/core/plugins";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Auth } from "@/components/auth/auth";
import { Spinner } from "@/components/ui/spinner";

// Core auth views plus the organisation plugin's (accept-invitation)
const authPaths = [...Object.values(viewPaths.auth), ...Object.values(organizationPlugin().viewPaths.auth ?? {})];

const titles: Partial<Record<AuthView, string>> = {
  signIn: "Sign in",
  signUp: "Create an account",
  signOut: "Signing out",
  forgotPassword: "Forgot password",
  resetPassword: "Reset password",
  resetLinkSent: "Check your email",
  verifyEmail: "Verify your email",
  redirect: "Redirecting",
  acceptInvitation: "Accept invitation",
};

export function generateStaticParams() {
  return authPaths.map((path) => ({ path }));
}

export async function generateMetadata({ params }: PageProps<"/auth/[path]">): Promise<Metadata> {
  const { path } = await params;
  const view = (Object.keys(viewPaths.auth) as AuthView[]).find((key) => viewPaths.auth[key] === path);

  const title = view && titles[view];

  return { title: title ? `${title} | MASLink` : "MASLink" };
}

export default function AuthPage({ params }: PageProps<"/auth/[path]">) {
  return (
    <Suspense fallback={<Spinner />}>
      <AuthRoute params={params} />
    </Suspense>
  );
}

async function AuthRoute({ params }: Pick<PageProps<"/auth/[path]">, "params">) {
  const { path } = await params;

  if (!authPaths.includes(path)) notFound();

  return <Auth path={path} />;
}
