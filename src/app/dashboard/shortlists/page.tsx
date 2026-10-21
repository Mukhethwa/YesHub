import { ENTERPRISE_NAV } from "@/components/enterprise/nav";
import { ComingSoon } from "@/components/portal/coming-soon";

export default function Page() {
  return <ComingSoon title={ENTERPRISE_NAV.shortlists.label} icon={ENTERPRISE_NAV.shortlists.icon} />;
}
