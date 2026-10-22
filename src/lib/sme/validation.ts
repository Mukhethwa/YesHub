// Shared by the browser and Convex (convex/smes.ts), so only relative imports here.
import type { SmeDetails } from "../../../convex/schema";
import { isExpired } from "./dates";

export type StepId = "company" | "offering" | "coverage" | "documents" | "contact" | "review";

/** Presence of the three documents captured at registration (files in the form, flags on the server). */
export interface RegistrationDocs {
  bbbeeCertificate: unknown;
  taxCertificate: unknown;
  companyProfile: unknown;
}

export type Validatable = SmeDetails & RegistrationDocs & { consent?: boolean };
export type Errors = Partial<Record<keyof Validatable, string>>;

const CIPC_REG = /^\d{4}\/\d{6}\/\d{2}$/;
const CSD = /^MAAA\d{7}$/i;
const SA_PHONE = /^(\+27|0)[1-9]\d{8}$/;
const URL_LIKE = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i;

export function normalisePhone(phone: string) {
  return phone.replace(/[\s()-]/g, "");
}

export function validateStep(step: StepId, f: Validatable): Errors {
  switch (step) {
    case "company":
      return validateCompany(f);
    case "offering":
      return validateOffering(f);
    case "coverage":
      return !f.nationwide && f.provinces.length === 0
        ? { provinces: "Select at least one province you can deliver in" }
        : {};
    case "documents":
      return validateCompliance(f, {
        bbbeeCertificate: !!f.bbbeeCertificate,
        taxCertificate: !!f.taxCertificate,
        companyProfile: !!f.companyProfile,
      });
    case "contact":
      return validateContactDetails(f);
    case "review":
      return f.consent ? {} : { consent: "Please confirm to create your profile" };
  }
}

function validateCompany(f: SmeDetails): Errors {
  const e: Errors = {};
  if (!f.companyName.trim()) e.companyName = "Enter your registered company name";
  if (!f.registrationNumber.trim()) e.registrationNumber = "Enter your CIPC registration number";
  else if (!CIPC_REG.test(f.registrationNumber.trim()))
    e.registrationNumber = "Use the CIPC format, e.g. 2019/123456/07";
  if (f.csdNumber.trim() && !CSD.test(f.csdNumber.trim())) e.csdNumber = "CSD numbers look like MAAA0123456";
  if (!f.industry) e.industry = "Choose the industry you mainly operate in";
  if (!f.city.trim()) e.city = "Enter the city or town you are based in";
  if (!f.hqProvince) e.hqProvince = "Choose your head office province";
  return e;
}

function validateOffering(f: SmeDetails): Errors {
  const e: Errors = {};
  if (f.services.length === 0) e.services = "Add at least one service you offer";
  if (f.capabilities.trim().length < 40) e.capabilities = "Tell us a little more (at least 40 characters)";
  return e;
}

/** `has` says which documents exist, whether new uploads or ones already on file. */
export function validateCompliance(
  f: Pick<SmeDetails, "bbbeeLevel" | "bbbeeExpiry" | "taxExpiry" | "website">,
  has: { bbbeeCertificate: boolean; taxCertificate: boolean; companyProfile: boolean },
): Errors {
  const e: Errors = {};
  if (!f.bbbeeLevel) e.bbbeeLevel = "Choose your B-BBEE status level";
  if (!has.bbbeeCertificate) e.bbbeeCertificate = "Upload your B-BBEE certificate or sworn affidavit";
  if (isExpired(f.bbbeeExpiry)) e.bbbeeExpiry = "This certificate has expired. Upload a current one";
  if (!has.taxCertificate) e.taxCertificate = "Upload your SARS tax compliance status (TCS) document";
  if (isExpired(f.taxExpiry)) e.taxExpiry = "This tax clearance has expired. Upload a current one";
  if (f.website.trim() && !URL_LIKE.test(f.website.trim()))
    e.website = "Enter a valid web address, e.g. www.yourcompany.co.za";
  if (!f.website.trim() && !has.companyProfile) e.website = "Add your website or upload a company profile";
  return e;
}

export function validateContactDetails(f: Pick<SmeDetails, "contactName" | "contactRole" | "phone">): Errors {
  const e: Errors = {};
  if (!f.contactName.trim()) e.contactName = "Enter the primary contact’s full name";
  if (!f.contactRole) e.contactRole = "Choose their role in the business";
  if (!SA_PHONE.test(normalisePhone(f.phone))) e.phone = "Enter a valid SA number, e.g. 082 123 4567";
  return e;
}

/** Everything a stored profile must satisfy. Used by the server on register and update. */
export function validateProfile(details: SmeDetails, has: RegistrationDocs): Errors {
  const f: Validatable = { ...details, ...has };
  return {
    ...validateCompany(f),
    ...validateOffering(f),
    ...validateStep("coverage", f),
    ...validateCompliance(f, {
      bbbeeCertificate: !!has.bbbeeCertificate,
      taxCertificate: !!has.taxCertificate,
      companyProfile: !!has.companyProfile,
    }),
    ...validateContactDetails(f),
  };
}

/** Trims and canonicalises user input before it's stored. */
export function normaliseDetails(d: SmeDetails): SmeDetails {
  return {
    ...d,
    companyName: d.companyName.trim(),
    registrationNumber: d.registrationNumber.trim(),
    csdNumber: d.csdNumber.trim().toUpperCase(),
    city: d.city.trim(),
    address: d.address.trim(),
    capabilities: d.capabilities.trim(),
    website: d.website.trim(),
    contactName: d.contactName.trim(),
    phone: normalisePhone(d.phone),
    provinces: d.nationwide ? [] : d.provinces,
  };
}
