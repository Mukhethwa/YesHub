import { isExpired } from "./dates";
import type { SmeProfile } from "./types";

export interface ReadinessCheck {
  id: string;
  passed: boolean;
  label: string;
  fix: string;
}

/** Profile readiness: which gaps are holding an SME back from being matched. */
export function getReadiness(p: SmeProfile) {
  const checks: ReadinessCheck[] = [
    {
      id: "bbbee",
      passed: !!p.documents.bbbeeCertificate && !isExpired(p.bbbeeExpiry),
      label: "Valid B-BBEE certificate",
      fix: "Upload a current B-BBEE certificate or sworn affidavit",
    },
    {
      id: "tax",
      passed: !!p.documents.taxCertificate && !isExpired(p.taxExpiry),
      label: "Valid tax compliance status",
      fix: "Upload a current SARS tax compliance status document",
    },
    {
      id: "csd",
      passed: !!p.csdNumber,
      label: "Registered on the CSD",
      fix: "Add your Central Supplier Database number. Most public tenders require it",
    },
    {
      id: "presence",
      passed: !!p.website && !!p.documents.companyProfile,
      label: "Website and company profile",
      fix: "Add both a website and a company profile so buyers can vet you quickly",
    },
    {
      id: "services",
      passed: p.services.length >= 3,
      label: "At least 3 services listed",
      fix: "List at least 3 services so you show up in more searches",
    },
    {
      id: "capabilities",
      passed: p.capabilities.trim().length >= 150,
      label: "Detailed capability statement",
      fix: "Expand your capabilities by mentioning capacity, equipment and past clients",
    },
    {
      id: "accreditations",
      passed: p.accreditations.length > 0,
      label: "Accreditations added",
      fix: "Add accreditations you hold, e.g. CIDB grading, ISO 9001 or PSIRA",
    },
    {
      id: "areas",
      passed: p.nationwide || p.serviceAreas.length > 0,
      label: "Service areas specified",
      fix: "Name the cities or municipalities you serve for sharper local matches",
    },
  ];

  const passed = checks.filter((c) => c.passed).length;
  return { checks, score: Math.round((passed / checks.length) * 100) };
}
