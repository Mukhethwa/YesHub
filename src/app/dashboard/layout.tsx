import type { Metadata } from "next";

import { EnterpriseShell } from "@/components/enterprise/enterprise-shell";

export const metadata: Metadata = {
  title: "Dashboard · YES Hub",
};

export default function EnterpriseLayout({ children }: LayoutProps<"/dashboard">) {
  return <EnterpriseShell>{children}</EnterpriseShell>;
}
