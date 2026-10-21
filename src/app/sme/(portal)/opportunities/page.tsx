import { ComingSoon } from "@/components/portal/coming-soon";
import { SME_NAV } from "@/components/sme-portal/nav";

export default function Page() {
  return <ComingSoon title={SME_NAV.opportunities.label} icon={SME_NAV.opportunities.icon} />;
}
