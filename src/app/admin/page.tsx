import { ADMIN_NAV } from "@/components/admin/nav";
import { ComingSoon } from "@/components/portal/coming-soon";

export default function AdminOverviewPage() {
  return (
    <ComingSoon
      title="YES Hub admin"
      icon={ADMIN_NAV.overview.icon}
      description="Platform activity, users, SMEs and organisations will appear here. Moderation tools are coming in the next build."
    />
  );
}
