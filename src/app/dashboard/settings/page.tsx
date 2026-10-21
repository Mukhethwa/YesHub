"use client";

import { RequireSme } from "@/components/dashboard/require-sme";
import { SettingsSection } from "@/components/dashboard/settings-section";

export default function SettingsPage() {
  return <RequireSme>{(sme) => <SettingsSection key={sme._id} sme={sme} />}</RequireSme>;
}
