export const PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
  "Western Cape",
];

export const INDUSTRIES = [
  "Agriculture & Agro-processing",
  "Construction & Built Environment",
  "Manufacturing",
  "ICT & Digital Services",
  "Professional & Business Services",
  "Transport & Logistics",
  "Cleaning & Facilities Management",
  "Security Services",
  "Hospitality, Catering & Events",
  "Healthcare & Pharmaceuticals",
  "Education & Training",
  "Energy & Renewables",
  "Mining Support Services",
  "Retail & Wholesale",
  "Creative, Media & Marketing",
  "Financial Services",
  "Other",
];

export const SERVICE_SUGGESTIONS: Record<string, string[]> = {
  "Construction & Built Environment": ["General building", "Civil works", "Electrical installation", "Plumbing", "Painting & renovations"],
  "ICT & Digital Services": ["Software development", "IT support", "Network installation", "Web design", "Data capturing"],
  "Cleaning & Facilities Management": ["Office cleaning", "Hygiene services", "Garden services", "Pest control", "Waste removal"],
  "Transport & Logistics": ["Courier services", "Freight", "Staff transport", "Warehousing", "Fleet management"],
  "Hospitality, Catering & Events": ["Corporate catering", "Event management", "Conference venues", "Décor & hiring"],
  "Professional & Business Services": ["Bookkeeping", "Payroll", "HR consulting", "Legal services", "Project management"],
  "Security Services": ["Guarding", "Armed response", "CCTV installation", "Access control"],
  "Education & Training": ["Accredited training", "Learnerships", "Skills development", "Tutoring"],
  Manufacturing: ["Steel fabrication", "Furniture", "Textiles & uniforms", "Packaging", "Printing"],
  "Agriculture & Agro-processing": ["Fresh produce supply", "Poultry", "Food processing", "Landscaping"],
  "Energy & Renewables": ["Solar PV installation", "Energy audits", "Backup power", "Electrical maintenance"],
};

export const YEARS_TRADING = ["Less than 1 year", "1–2 years", "3–5 years", "6–10 years", "More than 10 years"];

export const EMPLOYEE_BANDS = ["1–5", "6–20", "21–50", "51–200", "More than 200"];

export const BBBEE_LEVELS = [
  "Level 1",
  "Level 2",
  "Level 3",
  "Level 4",
  "Level 5",
  "Level 6",
  "Level 7",
  "Level 8",
  "Non-compliant",
];

export const CONTACT_ROLES = [
  "Owner / Founder",
  "Managing Director",
  "Director",
  "Operations Manager",
  "Finance Manager",
  "Business Development",
  "Administrator",
  "Other",
];

export const DOC_ACCEPT = ".pdf,.png,.jpg,.jpeg";
export const DOC_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"];
export const DOC_MAX_MB = 5;
