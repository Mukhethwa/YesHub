import { isExpired } from "./dates";
import type { DocKey, SmeProfile } from "./types";

export interface DocumentType {
  key: DocKey;
  label: string;
  description: string;
  required: boolean;
}

/** The documents buyers typically ask for in a South African tender pack. */
export const DOCUMENTS: DocumentType[] = [
  {
    key: "bbbeeCertificate",
    label: "B-BBEE certificate or affidavit",
    description: "From a SANAS-accredited verification agency, or a sworn affidavit for EMEs and QSEs.",
    required: true,
  },
  {
    key: "taxCertificate",
    label: "Tax compliance status",
    description: "Your SARS Tax Compliance Status (TCS) PIN letter or certificate.",
    required: true,
  },
  {
    key: "cipcCertificate",
    label: "CIPC registration certificate",
    description: "Your company registration certificate (CoR 14.3) from CIPC.",
    required: true,
  },
  {
    key: "companyProfile",
    label: "Company profile",
    description: "Who you are, what you do and who you have worked with.",
    required: false,
  },
  {
    key: "csdReport",
    label: "CSD registration report",
    description: "Summary report from National Treasury’s Central Supplier Database.",
    required: false,
  },
  {
    key: "bankLetter",
    label: "Bank confirmation letter",
    description: "A stamped letter from your bank confirming the business account.",
    required: false,
  },
  {
    key: "coidaLetter",
    label: "COIDA letter of good standing",
    description: "From the Compensation Fund. Often needed for on-site work.",
    required: false,
  },
  {
    key: "proofOfAddress",
    label: "Proof of business address",
    description: "A utility bill or lease agreement not older than 3 months.",
    required: false,
  },
];

export type DocStatus = "missing" | "expired" | "ok";

/** Expiry dates are captured on the profile for the two documents that lapse. */
export function expiryFor(sme: SmeProfile, key: DocKey) {
  if (key === "bbbeeCertificate") return sme.bbbeeExpiry;
  if (key === "taxCertificate") return sme.taxExpiry;
  return "";
}

export function docStatus(sme: SmeProfile, key: DocKey): DocStatus {
  if (!sme.documents[key]) return "missing";
  return isExpired(expiryFor(sme, key)) ? "expired" : "ok";
}

export function documentProgress(sme: SmeProfile) {
  const ok = (d: DocumentType) => docStatus(sme, d.key) === "ok";
  const required = DOCUMENTS.filter((d) => d.required);
  const done = DOCUMENTS.filter(ok).length;
  return {
    done,
    total: DOCUMENTS.length,
    percent: Math.round((done / DOCUMENTS.length) * 100),
    requiredDone: required.filter(ok).length,
    requiredTotal: required.length,
  };
}
