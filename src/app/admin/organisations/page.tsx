import { ADMIN_NAV } from "@/components/admin/nav";
import { ComingSoon } from "@/components/portal/coming-soon";

export default function Page() {
  return <ComingSoon title={ADMIN_NAV.organisations.label} icon={ADMIN_NAV.organisations.icon} />;
}
