"use client";

import { ProfileSection } from "@/components/sme-portal/profile-section";
import { RequireSme } from "@/components/sme-portal/require-sme";

export default function ProfilePage() {
  return <RequireSme>{(sme) => <ProfileSection sme={sme} />}</RequireSme>;
}
