import { ENTERPRISE_NAV } from "@/components/enterprise/nav";
import { ComingSoon } from "@/components/portal/coming-soon";

export default function Page() {
  return <ComingSoon title={ENTERPRISE_NAV.settings.label} icon={ENTERPRISE_NAV.settings.icon} />;
}
