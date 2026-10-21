import type { SmeDetails } from "../../../convex/schema";
import type { SmeProfile } from "./types";

/** The registration wizard's state: profile details plus files waiting to upload. */
export type SmeForm = SmeDetails & {
  bbbeeCertificate: File | null;
  taxCertificate: File | null;
  companyProfile: File | null;
  consent: boolean;
};

export type UpdateForm = (patch: Partial<SmeForm>) => void;

export const EMPTY_DETAILS: SmeDetails = {
  companyName: "",
  registrationNumber: "",
  csdNumber: "",
  industry: "",
  yearsTrading: "",
  employees: "",
  address: "",
  city: "",
  hqProvince: "",
  services: [],
  capabilities: "",
  accreditations: [],
  nationwide: false,
  provinces: [],
  serviceAreas: [],
  bbbeeLevel: "",
  bbbeeExpiry: "",
  taxExpiry: "",
  website: "",
  contactName: "",
  contactRole: "",
  email: "",
  phone: "",
};

/** A form pre-filled from a stored profile, with no pending uploads. */
export function formFromProfile(sme: SmeProfile): SmeForm {
  const details = Object.fromEntries(
    (Object.keys(EMPTY_DETAILS) as (keyof SmeDetails)[]).map((key) => [key, sme[key]]),
  ) as SmeDetails;
  return { ...details, bbbeeCertificate: null, taxCertificate: null, companyProfile: null, consent: true };
}

/** Just the given profile fields from a form, for a partial update. */
export function pickDetails<K extends keyof SmeDetails>(form: SmeForm, keys: K[]): Pick<SmeDetails, K> {
  return Object.fromEntries(keys.map((key) => [key, form[key]])) as unknown as Pick<SmeDetails, K>;
}
