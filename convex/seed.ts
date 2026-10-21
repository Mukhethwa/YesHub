import { ConvexError, v } from "convex/values";

import type { SmeDetails } from "./schema";
import { components, internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { createAuth } from "./auth";

/*
 * Dev seed: realistic users, SMEs, enterprises (with teams, members and invitations) and staff, so the
 * admin area has something to manage. Only runs when SITE_URL is a localhost URL.
 *
 *   pnpm exec convex run seed:devData
 *
 * Every seeded account signs in with the password below (dev deployments only).
 */
const SEED_PASSWORD = "YesHubDev2026!";

const PEOPLE = {
  capitecOwner: { name: "Naledi Dlamini", email: "naledi.dlamini@capitec.test" },
  capitecAdmin: { name: "Johan van Wyk", email: "johan.vanwyk@capitec.test" },
  capitecHr: { name: "Ayanda Nkosi", email: "ayanda.nkosi@capitec.test" },
  capitecFacilities: { name: "Priya Naidoo", email: "priya.naidoo@capitec.test" },
  boxerOwner: { name: "Sipho Mthembu", email: "sipho.mthembu@boxer.test" },
  boxerMerch: { name: "Lerato Molefe", email: "lerato.molefe@boxer.test" },
  foundationOwner: { name: "Grace Khumalo", email: "grace@ubuntufund.test" },
  fakeCapitec: { name: "Capitec Procurement", email: "tenders@capitec-bank.test" },
  smeUbuntu: { name: "Thandi Mokoena", email: "thandi@ubuntufacilities.test" },
  smeLethabo: { name: "Kabelo Sithole", email: "kabelo@lethabocatering.test" },
  smeSiyakha: { name: "Bongani Zulu", email: "bongani@siyakhabuild.test" },
  smeMzansi: { name: "Fatima Patel", email: "fatima@mzansiit.test" },
  smeKaroo: { name: "Pieter Botha", email: "pieter@karoologistics.test" },
  // A test super admin, so the full admin area can be tried without a real account
  staffOwner: { name: "Naledi Dube", email: "naledi@yeshub.test" },
  staffAdmin: { name: "Musa Khoza", email: "musa@yeshub.test" },
  staffModerator: { name: "Lindiwe Moyo", email: "lindiwe@yeshub.test" },
  staffViewer: { name: "Tumi Radebe", email: "tumi@yeshub.test" },
  newUserA: { name: "Zanele Mahlangu", email: "zanele.mahlangu@gmail.test" },
  newUserB: { name: "Kgosi Masilo", email: "kgosi@outlook.test" },
  spammer: { name: "Cheap Tenders 4U", email: "win-every-tender@spam.test" },
} as const;

type Person = keyof typeof PEOPLE;

function assertDevSite() {
  if (!process.env.SITE_URL?.startsWith("http://localhost")) {
    throw new ConvexError("The seed only runs against development deployments (SITE_URL on localhost).");
  }
}

function isoDate(daysFromToday: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

const SMES: { owner: Person; details: Omit<SmeDetails, "contactName" | "email">; docs: string[]; verified?: boolean; suspended?: string }[] = [
  {
    owner: "smeUbuntu",
    verified: true,
    docs: ["bbbeeCertificate", "taxCertificate", "cipcCertificate", "companyProfile", "csdReport", "bankLetter"],
    details: {
      companyName: "Ubuntu Facilities Services",
      registrationNumber: "2019/123456/07",
      csdNumber: "MAAA0123456",
      industry: "Cleaning & Facilities Management",
      yearsTrading: "3–5 years",
      employees: "21–50",
      address: "12 Umgeni Road",
      city: "Durban",
      hqProvince: "KwaZulu-Natal",
      services: ["Office cleaning", "Hygiene services", "Pest control"],
      capabilities:
        "A team of 34 trained cleaners with our own industrial equipment and vehicles. We service four office parks in Umhlanga and have supplied two private hospital groups for three years.",
      accreditations: ["ISO 9001"],
      nationwide: false,
      provinces: ["KwaZulu-Natal", "Eastern Cape"],
      serviceAreas: ["eThekwini", "Pietermaritzburg"],
      bbbeeLevel: "Level 1",
      bbbeeExpiry: isoDate(220),
      taxExpiry: isoDate(150),
      website: "www.ubuntufacilities.co.za",
      contactRole: "Owner / Founder",
      phone: "0821234567",
    },
  },
  {
    owner: "smeLethabo",
    docs: ["bbbeeCertificate", "taxCertificate"],
    details: {
      companyName: "Lethabo Catering & Events",
      registrationNumber: "2021/554433/07",
      csdNumber: "",
      industry: "Hospitality, Catering & Events",
      yearsTrading: "1–2 years",
      employees: "6–20",
      address: "",
      city: "Soweto",
      hqProvince: "Gauteng",
      services: ["Corporate catering"],
      capabilities: "Corporate lunches and year-end functions for up to 300 guests.",
      accreditations: [],
      nationwide: false,
      provinces: ["Gauteng"],
      serviceAreas: [],
      bbbeeLevel: "Level 1",
      bbbeeExpiry: isoDate(90),
      taxExpiry: isoDate(-20),
      website: "",
      contactRole: "Managing Director",
      phone: "0835550142",
    },
  },
  {
    owner: "smeSiyakha",
    docs: ["bbbeeCertificate", "taxCertificate", "cipcCertificate", "coidaLetter"],
    details: {
      companyName: "Siyakha Construction",
      registrationNumber: "2015/887766/07",
      csdNumber: "MAAA0456789",
      industry: "Construction & Built Environment",
      yearsTrading: "6–10 years",
      employees: "51–200",
      address: "Unit 4, Mahikeng Industrial Park",
      city: "Mahikeng",
      hqProvince: "North West",
      services: ["General building", "Civil works", "Painting & renovations", "Plumbing"],
      capabilities:
        "CIDB 6GB contractor with a fleet of plant and 120 staff. Completed schools, clinics and municipal offices across North West and Gauteng, including a R40m provincial clinic upgrade.",
      accreditations: ["CIDB 6GB"],
      nationwide: false,
      provinces: ["North West", "Gauteng", "Free State"],
      serviceAreas: ["Mahikeng", "Rustenburg"],
      bbbeeLevel: "Level 2",
      bbbeeExpiry: isoDate(300),
      taxExpiry: isoDate(200),
      website: "www.siyakhaconstruction.co.za",
      contactRole: "Director",
      phone: "0187001234",
    },
  },
  {
    owner: "smeMzansi",
    docs: ["bbbeeCertificate", "taxCertificate", "cipcCertificate", "companyProfile"],
    suspended: "CIPC number doesn’t match the company name on the certificate. Waiting for the owner to resubmit.",
    details: {
      companyName: "Mzansi IT Solutions",
      registrationNumber: "2020/112233/07",
      csdNumber: "MAAA0987654",
      industry: "ICT & Digital Services",
      yearsTrading: "3–5 years",
      employees: "6–20",
      address: "",
      city: "Cape Town",
      hqProvince: "Western Cape",
      services: ["IT support", "Network installation", "Software development"],
      capabilities: "Managed IT for 40 small businesses, network installs and custom software for retail clients.",
      accreditations: [],
      nationwide: true,
      provinces: [],
      serviceAreas: [],
      bbbeeLevel: "Level 4",
      bbbeeExpiry: isoDate(-5),
      taxExpiry: isoDate(100),
      website: "www.mzansiit.co.za",
      contactRole: "Owner / Founder",
      phone: "0219876543",
    },
  },
  {
    owner: "smeKaroo",
    docs: ["taxCertificate"],
    details: {
      companyName: "Karoo Logistics",
      registrationNumber: "2023/778899/07",
      csdNumber: "",
      industry: "Transport & Logistics",
      yearsTrading: "Less than 1 year",
      employees: "1–5",
      address: "",
      city: "Kimberley",
      hqProvince: "Northern Cape",
      services: ["Courier services", "Freight"],
      capabilities: "Two 8-ton trucks covering Kimberley, Upington and De Aar.",
      accreditations: [],
      nationwide: false,
      provinces: ["Northern Cape"],
      serviceAreas: ["Sol Plaatje"],
      bbbeeLevel: "Level 1",
      bbbeeExpiry: "",
      taxExpiry: isoDate(60),
      website: "",
      contactRole: "Owner / Founder",
      phone: "0538001122",
    },
  },
];

/** Inserts the SME profiles for already-created accounts. */
export const insertSmes = internalMutation({
  args: { owners: v.record(v.string(), v.string()) },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    for (const sme of SMES) {
      const userId = args.owners[sme.owner];
      if (!userId) continue;
      const exists = await ctx.db
        .query("smes")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
      if (exists) continue;

      const person = PEOPLE[sme.owner];
      await ctx.db.insert("smes", {
        ...sme.details,
        contactName: person.name,
        email: person.email,
        userId,
        consentedAt: now,
        isDemo: true,
        documents: Object.fromEntries(
          sme.docs.map((key) => [key, { name: `${key}.pdf`, size: 180_000, type: "application/pdf", uploadedAt: now }]),
        ),
        ...(sme.verified ? { verifiedAt: Date.now(), verifiedBy: "Seed" } : {}),
        ...(sme.suspended ? { suspendedAt: Date.now(), suspendedReason: sme.suspended } : {}),
      });
    }
  },
});

/** Creates every seed account (with a password), then SMEs, enterprises, staff and flags. Safe to re-run. */
export const devData = internalAction({
  args: { inviterEmail: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertDevSite();
    const auth = createAuth(ctx);

    const ids: Partial<Record<Person, string>> = {};
    for (const [key, person] of Object.entries(PEOPLE) as [Person, (typeof PEOPLE)[Person]][]) {
      let id = await ctx.runQuery(components.betterAuth.users.idByEmail, { email: person.email });
      if (!id) {
        const result = await auth.api.signUpEmail({ body: { ...person, password: SEED_PASSWORD } });
        id = result.user.id;
      }
      ids[key] = id;
    }
    const id = (p: Person) => ids[p]!;

    await ctx.runMutation(internal.seed.insertSmes, { owners: ids as Record<string, string> });

    // Staff invitations come from the first super admin, if there is one
    const inviterId = args.inviterEmail
      ? await ctx.runQuery(components.betterAuth.users.idByEmail, { email: args.inviterEmail })
      : id("staffOwner");

    await ctx.runMutation(components.betterAuth.seed.organizations, {
      enterprises: [
        {
          name: "Capitec Bank",
          slug: "capitec",
          verificationStatus: "verified",
          teams: ["Procurement", "Human Resources", "Facilities"],
          members: [
            { userId: id("capitecOwner"), role: "owner", teams: ["Procurement"] },
            { userId: id("capitecAdmin"), role: "admin", teams: ["Procurement", "Facilities"] },
            { userId: id("capitecHr"), role: "member", teams: ["Human Resources"] },
            { userId: id("capitecFacilities"), role: "member", teams: ["Facilities"] },
          ],
          invitations: [{ email: "finance.lead@capitec.test", role: "member", inviterId: id("capitecOwner") }],
        },
        {
          name: "Boxer Superstores",
          slug: "boxer",
          verificationStatus: "unverified",
          teams: ["Merchandise", "Logistics"],
          members: [
            { userId: id("boxerOwner"), role: "owner", teams: ["Logistics"] },
            { userId: id("boxerMerch"), role: "member", teams: ["Merchandise"] },
          ],
          invitations: [],
        },
        {
          name: "Ubuntu Enterprise Development Fund",
          slug: "ubuntu-fund",
          verificationStatus: "unverified",
          teams: [],
          members: [{ userId: id("foundationOwner"), role: "owner", teams: [] }],
          invitations: [],
        },
        {
          name: "Capitec Bank Tenders",
          slug: "capitec-bank-tenders",
          verificationStatus: "rejected",
          verificationNote: "Not affiliated with Capitec. Domain capitec-bank.test isn’t Capitec’s.",
          teams: [],
          members: [{ userId: id("fakeCapitec"), role: "owner", teams: [] }],
          invitations: [],
        },
      ],
      staff: [
        { userId: id("staffOwner"), role: "owner" },
        { userId: id("staffAdmin"), role: "admin" },
        { userId: id("staffModerator"), role: "moderator" },
        { userId: id("staffViewer"), role: "viewer" },
      ],
      staffInvitations: inviterId ? [{ email: "new.admin@yeshub.test", role: "admin", inviterId }] : [],
      banned: [{ userId: id("spammer"), reason: "Posting fake tender adverts with payment links." }],
    });

    return { accounts: Object.keys(ids).length, password: "see SEED_PASSWORD in convex/seed.ts" };
  },
});
