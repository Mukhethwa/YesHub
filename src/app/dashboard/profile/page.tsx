"use client";

import { ProfileSection } from "@/components/dashboard/profile-section";
import { RequireSme } from "@/components/dashboard/require-sme";

export default function ProfilePage() {
  return <RequireSme>{(sme) => <ProfileSection sme={sme} />}</RequireSme>;
}
