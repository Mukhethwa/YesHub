"use client";

import { RequireSme } from "@/components/sme-portal/require-sme";
import { SettingsSection } from "@/components/sme-portal/settings-section";

export default function SettingsPage() {
  return <RequireSme>{(sme) => <SettingsSection key={sme._id} sme={sme} />}</RequireSme>;
}
