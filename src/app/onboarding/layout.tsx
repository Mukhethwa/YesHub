import type { Metadata } from "next";

import { Header } from "@/components/header";

export const metadata: Metadata = {
  title: "Register your business · YES Hub",
};

export default function OnboardingLayout({ children }: LayoutProps<"/onboarding">) {
  return (
    <>
      <Header />
      <div className="flex-1 bg-muted/30 pt-6">{children}</div>
    </>
  );
}
