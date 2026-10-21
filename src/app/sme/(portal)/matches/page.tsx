"use client";

import { MatchesView } from "@/components/sme-portal/matches-view";
import { RequireSme } from "@/components/sme-portal/require-sme";

export default function MatchesPage() {
  return <RequireSme>{(sme) => <MatchesView sme={sme} />}</RequireSme>;
}
