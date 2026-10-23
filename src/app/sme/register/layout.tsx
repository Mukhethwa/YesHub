import type { Metadata } from "next";

import { Header } from "@/components/header";

export const metadata: Metadata = {
  title: "Register your business | MASLink",
};

export default function SmeRegisterLayout({ children }: LayoutProps<"/sme/register">) {
  return (
    <>
      <Header />
      <div className="flex-1 bg-muted/30 pt-6">{children}</div>
    </>
  );
}
