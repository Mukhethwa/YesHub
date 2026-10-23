"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { PlatformAnalytics } from "@/components/admin/analytics";
import { AppFrame } from "../lifted";

export default function AdminAnalyticsScene() {
  return (
    <AppFrame pathname="/admin/analytics" height={1700}>
      <AdminShell>
        <PlatformAnalytics />
      </AdminShell>
    </AppFrame>
  );
}
