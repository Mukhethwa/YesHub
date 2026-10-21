import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { MemberPreferences, OrganizationSettings } from "../schema";

export const DEFAULT_ORGANIZATION_SETTINGS: OrganizationSettings = {
  about: "",
  industry: "",
  website: "",
  procurementEmail: "",

  defaultRequiredDocuments: ["bbbeeCertificate", "taxCertificate", "cipcCertificate"],
  defaultMinBbbeeLevel: 0,
  defaultEvaluationCriteria: ["Price: 80 points", "B-BBEE status: 20 points"],
  defaultSubmission: "Submit your response through YES Hub before the closing date.",

  defaultApplicantFilter: "all",
  shortlistAdminsOnly: false,

  retentionMonths: 12,
};

export const DEFAULT_MEMBER_PREFERENCES: MemberPreferences = {
  notifyNewApplications: true,
  onlyMyDepartments: true,
  notifyClosingSoon: true,
  closingReminderDays: 3,
  notifyColleagueShortlists: false,
  weeklySummary: true,
};

/** The saved values for every field in `defaults`, falling back to the default; anything else is dropped. */
function withDefaults<T extends object>(defaults: T, saved: object): T {
  const values = saved as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [key, values[key] ?? fallback]),
  ) as T;
}

/** Owners and admins manage the organisation; members work on its opportunities. */
export function canManage(role: string) {
  return role === "owner" || role === "admin";
}

async function settingsRow(ctx: QueryCtx, organizationId: string) {
  return ctx.db
    .query("organizationSettings")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .unique();
}

/** The organisation's settings, with defaults for anything it hasn't saved. */
export async function getOrganizationSettings(ctx: QueryCtx, organizationId: string) {
  const row = await settingsRow(ctx, organizationId);
  if (!row) return { ...DEFAULT_ORGANIZATION_SETTINGS, updatedBy: null, updatedAt: null };
  return { ...withDefaults(DEFAULT_ORGANIZATION_SETTINGS, row), updatedBy: row.updatedBy, updatedAt: row._creationTime };
}

export async function saveOrganizationSettings(
  ctx: MutationCtx,
  organizationId: string,
  settings: OrganizationSettings,
  updatedBy: string,
) {
  const existing = await settingsRow(ctx, organizationId);
  // Replaced rather than patched so _creationTime records when they were last saved
  if (existing) await ctx.db.delete("organizationSettings", existing._id);
  await ctx.db.insert("organizationSettings", { organizationId, ...settings, updatedBy });
}

export async function deleteOrganizationSettings(ctx: MutationCtx, organizationId: string) {
  const existing = await settingsRow(ctx, organizationId);
  if (existing) await ctx.db.delete("organizationSettings", existing._id);
}

async function preferencesRow(ctx: QueryCtx, userId: string) {
  return ctx.db
    .query("memberPreferences")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

export async function getMemberPreferences(ctx: QueryCtx, userId: string): Promise<MemberPreferences> {
  const row = await preferencesRow(ctx, userId);
  return row ? withDefaults(DEFAULT_MEMBER_PREFERENCES, row) : DEFAULT_MEMBER_PREFERENCES;
}

export async function saveMemberPreferences(ctx: MutationCtx, userId: string, preferences: MemberPreferences) {
  const existing = await preferencesRow(ctx, userId);
  if (existing) await ctx.db.patch("memberPreferences", existing._id, preferences);
  else await ctx.db.insert("memberPreferences", { userId, ...preferences });
}

export async function deleteMemberPreferences(ctx: MutationCtx, userId: string) {
  const existing = await preferencesRow(ctx, userId);
  if (existing) await ctx.db.delete("memberPreferences", existing._id);
}
