import type { Metadata } from "next";

import { Header } from "@/components/header";

export const metadata: Metadata = {
  title: "Welcome | MASLink",
};

export default function StartLayout({ children }: LayoutProps<"/start">) {
  return (
    <>
      <Header />
      <main className="flex flex-1 flex-col bg-muted/30">{children}</main>
    </>
  );
}
