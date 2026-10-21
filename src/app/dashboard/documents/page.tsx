"use client";

import { DocumentsSection } from "@/components/dashboard/documents-section";
import { RequireSme } from "@/components/dashboard/require-sme";

export default function DocumentsPage() {
  return <RequireSme>{(sme) => <DocumentsSection sme={sme} />}</RequireSme>;
}
