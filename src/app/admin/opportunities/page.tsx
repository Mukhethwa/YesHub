import { ADMIN_NAV } from "@/components/admin/nav";
import { ComingSoon } from "@/components/portal/coming-soon";

export default function Page() {
  return <ComingSoon title={ADMIN_NAV.opportunities.label} icon={ADMIN_NAV.opportunities.icon} />;
}
