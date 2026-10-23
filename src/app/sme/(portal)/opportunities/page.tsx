"use client";

import { Suspense } from "react";

import { ApplicationsView } from "@/components/sme-portal/applications-view";
import { RequireSme } from "@/components/sme-portal/require-sme";

export default function OpportunitiesPage() {
  // ApplicationsView reads ?id= to open one opportunity, which needs a Suspense boundary
  return (
    <Suspense>
      <RequireSme>{(sme) => <ApplicationsView sme={sme} />}</RequireSme>
    </Suspense>
  );
}
