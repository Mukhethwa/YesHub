"use client";

import { Building2Icon } from "lucide-react";

import { ComingSoon } from "@/components/portal/coming-soon";
import { useAccount } from "@/hooks/use-account";

export default function EnterpriseOverviewPage() {
  const account = useAccount();
  const organization = account?.organizations[0];

  if (!organization) {
    return (
      <ComingSoon
        title="Set up your organisation"
        icon={Building2Icon}
        description="Enterprises and funders join YES Hub as an organisation, so your team can post opportunities and review suppliers together. Organisation setup is coming in the next build."
      />
    );
  }

  return (
    <ComingSoon
      title={organization.name}
      icon={Building2Icon}
      description="Your enterprise dashboard is coming in the next build: post tenders, RFQs and grants, and review matched SMEs with your team."
    />
  );
}
