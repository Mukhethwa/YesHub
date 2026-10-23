"use client";

import { ProgrammesView } from "@/components/sme-portal/programmes-view";
import { RequireSme } from "@/components/sme-portal/require-sme";

export default function ProgrammesPage() {
  return <RequireSme>{(sme) => <ProgrammesView sme={sme} />}</RequireSme>;
}
