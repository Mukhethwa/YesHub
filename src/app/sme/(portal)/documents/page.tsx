"use client";

import { DocumentsSection } from "@/components/sme-portal/documents-section";
import { RequireSme } from "@/components/sme-portal/require-sme";

export default function DocumentsPage() {
  return <RequireSme>{(sme) => <DocumentsSection sme={sme} />}</RequireSme>;
}
