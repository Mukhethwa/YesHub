import type { SmeSettings } from "../../../convex/schema";

export const OPPORTUNITY_TYPES = [
  "Tenders",
  "RFQs",
  "Grants & funding",
  "Supplier development programmes",
  "Enterprise development loans",
];

export const CONTRACT_VALUES = [
  "Any value",
  "R50 000 and above",
  "R250 000 and above",
  "R1 million and above",
  "R5 million and above",
];

export const REMINDER_DAYS = ["1 day before", "3 days before", "7 days before", "14 days before"];

export const LANGUAGES = [
  "English",
  "isiZulu",
  "isiXhosa",
  "Afrikaans",
  "Sepedi",
  "Setswana",
  "Sesotho",
  "Xitsonga",
  "siSwati",
  "Tshivenda",
  "isiNdebele",
];

export const DEFAULT_SETTINGS: SmeSettings = {
  notifyEmail: true,
  notifySms: true,
  notifyWhatsapp: false,
  language: "English",

  alertNewMatches: true,
  alertDeadlines: true,
  deadlineReminderDays: "3 days before",
  alertStatusUpdates: true,
  alertDocExpiry: true,
  weeklyDigest: false,

  opportunityTypes: [...OPPORTUNITY_TYPES],
  minContractValue: "Any value",
  eligibleOnly: true,

  lowDataMode: false,
  profileVisible: true,
  shareContactAfterShortlist: true,
};

export function getSettings(sme: { settings?: SmeSettings }): SmeSettings {
  return { ...DEFAULT_SETTINGS, ...sme.settings };
}
